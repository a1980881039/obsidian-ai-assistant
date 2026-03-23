import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	ChatModelProvider,
	type AIChatSettings,
	type CustomModel,
	type ModelConfig,
	type Provider,
	getModelKey,
	getFirstEnabledModelKey,
	findModelConfig,
	findProvider,
	getFirstEnabledModelConfigId,
} from "../types";
import { CHAT_PROVIDER_CONSTRUCTORS, PROVIDER_REQUIRES_KEY } from "./providerConfig";
import { decryptKey } from "./encryptionService";

/**
 * LLM 提供商统一管理器。
 * 支持新版 Provider + ModelConfig 架构，同时保留旧版 CustomModel 兼容。
 */
export class ChatModelManager {
	private chatModel: BaseChatModel | null = null;
	private settings: AIChatSettings;

	constructor(settings: AIChatSettings) {
		this.settings = settings;
	}

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
	}

	getChatModel(): BaseChatModel {
		if (!this.chatModel) {
			throw new Error("No chat model initialized. Please check your API key settings.");
		}
		return this.chatModel;
	}

	async setChatModel(model: CustomModel): Promise<void> {
		this.chatModel = await this.createModelInstance(model);
	}

	/**
	 * 初始化模型。
	 * modelKey 可以是:
	 * - ModelConfig ID (新架构)
	 * - "name|provider" key (旧架构兼容)
	 */
	async initModel(modelKey?: string): Promise<void> {
		// 优先尝试新架构
		if (this.settings.modelConfigs?.length > 0) {
			const id = modelKey || this.settings.defaultModelId || getFirstEnabledModelConfigId(this.settings.modelConfigs);
			const mc = findModelConfig(this.settings.modelConfigs, id);
			if (mc && mc.enabled) {
				const provider = mc.providerId ? findProvider(this.settings.providers, mc.providerId) : undefined;
				this.chatModel = await this.createModelInstanceFromConfig(mc, provider);
				return;
			}
		}

		// 回退旧架构
		const key = modelKey || getFirstEnabledModelKey(this.settings.activeModels);
		const model = this.settings.activeModels.find(
			(m) => getModelKey(m) === key && m.enabled,
		);
		if (!model) {
			throw new Error(`Model not found or disabled: ${modelKey}`);
		}
		await this.setChatModel(model);
	}

	private async getApiKey(modelApiKey?: string): Promise<string> {
		if (modelApiKey) return await decryptKey(modelApiKey);
		return "";
	}

	/** 从新架构 ModelConfig + Provider 创建实例 */
	private async createModelInstanceFromConfig(mc: ModelConfig, provider?: Provider): Promise<BaseChatModel> {
		const Constructor = CHAT_PROVIDER_CONSTRUCTORS[mc.provider];
		if (!Constructor) {
			throw new Error(`Unsupported provider: ${mc.provider}`);
		}

		// 优先使用 Provider 的 apiKey，回退到 ModelConfig 自身
		const rawKey = provider?.apiKey || mc.apiKey || "";
		const apiKey = await decryptKey(rawKey);
		const requiresKey = PROVIDER_REQUIRES_KEY[mc.provider] !== false;
		if (!apiKey && requiresKey) {
			throw new Error(`API key not configured for ${mc.provider}. Please set it in settings.`);
		}

		const baseUrl = mc.baseUrl || provider?.baseUrl || "";
		const stream = mc.stream ?? provider?.stream ?? true;

		// 构建 CustomModel 兼容对象传给 buildProviderConfig
		const compat: CustomModel = {
			name: mc.model,
			provider: mc.provider,
			enabled: mc.enabled,
			temperature: mc.temperature,
			maxTokens: mc.maxTokens,
			stream,
			baseUrl: baseUrl || undefined,
			topP: mc.topP,
			frequencyPenalty: mc.frequencyPenalty,
			reasoningEffort: mc.reasoningEffort,
			capabilities: mc.capabilities,
		};

		const config = await this.buildProviderConfig(compat, apiKey);
		const instance = new Constructor(config) as BaseChatModel;

		instance.getNumTokens = async (content: string | Array<{ type: string; text?: string }>) => {
			const text = typeof content === "string"
				? content
				: content.map((item) => (typeof item === "string" ? item : (item.text ?? ""))).join("");
			return Math.ceil(text.length / 4);
		};

		return instance;
	}

	private async createModelInstance(model: CustomModel): Promise<BaseChatModel> {
		const Constructor = CHAT_PROVIDER_CONSTRUCTORS[model.provider];
		if (!Constructor) {
			throw new Error(`Unsupported provider: ${model.provider}`);
		}

		const apiKey = await this.getApiKey(model.apiKey);
		const requiresKey = PROVIDER_REQUIRES_KEY[model.provider] !== false;
		if (!apiKey && requiresKey) {
			throw new Error(`API key not configured for ${model.provider}. Please set it in settings.`);
		}

		const config = await this.buildProviderConfig(model, apiKey);
		const instance = new Constructor(config) as BaseChatModel;

		// Override getNumTokens to avoid tiktoken remote fetch
		instance.getNumTokens = async (content: string | Array<{ type: string; text?: string }>) => {
			const text = typeof content === "string"
				? content
				: content.map((item) => (typeof item === "string" ? item : (item.text ?? ""))).join("");
			return Math.ceil(text.length / 4);
		};

		return instance;
	}

	private async buildProviderConfig(model: CustomModel, apiKey: string): Promise<Record<string, unknown>> {
		const base: Record<string, unknown> = {
			temperature: model.temperature,
			maxTokens: model.maxTokens,
			streaming: model.stream,
			maxRetries: 3,
			maxConcurrency: 3,
		};
		if (model.topP != null) base.topP = model.topP;
		if (model.frequencyPenalty != null) base.frequencyPenalty = model.frequencyPenalty;

		switch (model.provider) {
			case ChatModelProvider.OPENAI:
				return {
					...base,
					modelName: model.name,
					openAIApiKey: apiKey,
					configuration: model.baseUrl ? { baseURL: model.baseUrl } : undefined,
				};

			case ChatModelProvider.ANTHROPIC:
				return {
					...base,
					anthropicApiKey: apiKey,
					modelName: model.name,
					clientOptions: {
						defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
					},
					...(model.baseUrl ? { anthropicApiUrl: model.baseUrl } : {}),
				};

			case ChatModelProvider.GOOGLE:
				return {
					...base,
					apiKey,
					model: model.name,
					...(model.baseUrl ? { baseUrl: model.baseUrl } : {}),
				};

			case ChatModelProvider.GROQ:
				return { ...base, apiKey, model: model.name };

			case ChatModelProvider.MISTRAL:
				return {
					...base,
					apiKey,
					model: model.name,
					...(model.baseUrl ? { serverURL: model.baseUrl } : {}),
				};

			case ChatModelProvider.COHERE:
				return { ...base, apiKey, model: model.name };

			case ChatModelProvider.DEEPSEEK:
				return {
					...base,
					modelName: model.name,
					apiKey,
					configuration: {
						baseURL: model.baseUrl || "https://api.deepseek.com/v1",
					},
				};

			case ChatModelProvider.XAI:
				return { ...base, apiKey, model: model.name };

			case ChatModelProvider.OPENROUTER:
				return {
					...base,
					modelName: model.name,
					apiKey,
					configuration: {
						baseURL: model.baseUrl || "https://openrouter.ai/api/v1",
						defaultHeaders: {
							"HTTP-Referer": "https://obsidian.md",
							"X-Title": "Obsidian AI Chat",
						},
					},
				};

				case ChatModelProvider.SILICONFLOW:
				return {
					...base,
					modelName: model.name,
					apiKey,
					configuration: {
						baseURL: model.baseUrl || "https://api.siliconflow.cn/v1",
					},
				};

			case ChatModelProvider.AZURE_OPENAI:
				return {
					...base,
					modelName: model.name,
					apiKey,
					configuration: {
						baseURL: model.baseUrl,
						defaultHeaders: {
							"Content-Type": "application/json",
							"api-key": apiKey,
						},
					},
				};

			case ChatModelProvider.OPENAI_FORMAT:
				return {
					...base,
					modelName: model.name,
					apiKey: apiKey || "default-key",
					configuration: {
						baseURL: model.baseUrl,
						defaultHeaders: { "dangerously-allow-browser": "true" },
					},
				};

			default:
				return { ...base, modelName: model.name, apiKey };
		}
	}

	getEnabledModels(): CustomModel[] {
		return this.settings.activeModels.filter((m) => m.enabled);
	}

	/** 获取启用的 ModelConfig（新架构） */
	getEnabledModelConfigs(): ModelConfig[] {
		return (this.settings.modelConfigs || []).filter((m) => m.enabled);
	}

	/** 是否使用新架构 */
	hasNewArchitecture(): boolean {
		return (this.settings.modelConfigs?.length ?? 0) > 0;
	}

	hasApiKey(model: CustomModel): boolean {
		return !!model.apiKey;
	}
}
