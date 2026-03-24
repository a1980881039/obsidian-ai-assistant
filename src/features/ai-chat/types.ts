/** AI Chat 功能的类型定义 */

export enum EmbeddingProvider {
	OPENAI = "openai",
	COHERE = "cohere",
	GOOGLE = "google",
	OPENAI_FORMAT = "openai_format",
}

export enum ChatModelProvider {
	OPENAI = "openai",
	ANTHROPIC = "anthropic",
	GOOGLE = "google",
	GROQ = "groq",
	OPENROUTER = "openrouter",
	MISTRAL = "mistral",
	DEEPSEEK = "deepseek",
	XAI = "xai",
	SILICONFLOW = "siliconflow",
	COHERE = "cohere",
	AZURE_OPENAI = "azure_openai",
	OPENAI_FORMAT = "openai_format",
}

export interface ModelCapabilities {
	reasoning: boolean;
	vision: boolean;
	websearch: boolean;
}

// ── Provider + ModelConfig 层级模型（对齐 agent-workbench 架构）──

/** Provider — 可复用的连接配置，一个 Provider 可关联多个 ModelConfig */
export interface Provider {
	id: string;
	name: string;
	type: ChatModelProvider;
	baseUrl: string;
	apiKey: string; // 加密存储
	stream: boolean;
	createdAt: number;
	updatedAt: number;
}

/** ModelConfig — 单个模型的配置，关联到 Provider */
export interface ModelConfig {
	id: string;
	name: string; // 显示名称
	model: string; // 实际模型 ID（如 gpt-4o）
	provider: ChatModelProvider;
	baseUrl: string;
	apiKey: string; // 加密存储
	enabled: boolean;
	capabilities: ModelCapabilities;
	providerId?: string; // 软链接到 Provider
	temperature: number;
	maxTokens: number;
	stream: boolean;
	topP?: number;
	frequencyPenalty?: number;
	reasoningEffort?: "low" | "medium" | "high";
	createdAt: number;
	updatedAt: number;
}

/** @deprecated 旧版扁平模型配置，仅用于迁移兼容。新代码请使用 Provider + ModelConfig。 */
export interface CustomModel {
	name: string;
	provider: ChatModelProvider;
	enabled: boolean;
	isBuiltin?: boolean;
	apiKey?: string;
	baseUrl?: string;
	temperature: number;
	maxTokens: number;
	stream: boolean;
	enableCors?: boolean;
	topP?: number;
	frequencyPenalty?: number;
	reasoningEffort?: "low" | "medium" | "high";
	capabilities?: ModelCapabilities;
}

export interface AIChatSettings {
	enabled: boolean;

	// ── New: Provider + ModelConfig 架构 ──
	providers: Provider[];
	modelConfigs: ModelConfig[];
	defaultModelId: string | null;

	// ── Legacy（迁移后可删除）──
	activeModels: CustomModel[];
	contextTurns: number;

	// Prompts & Commands
	systemPromptsFolder: string;
	customCommandsFolder: string;
	activeSystemPromptTitle: string;

	// Embedding & Vector Search (Phase 1)
	embeddingProvider: EmbeddingProvider;
	embeddingModel: string;
	embeddingApiKey: string;
	embeddingBaseUrl: string;
	chunkSize: number;
	chunkOverlap: number;
	indexBatchSize: number;
	qaExclusionPaths: string;
	qaInclusionPaths: string;
	enableAutoIndex: boolean;

	// Agent (Phase 2)
	tavilyApiKey: string;
	agentMaxIterations: number;
	agentToolTimeout: number;
	enabledTools: Record<string, boolean>;

	// Chat settings
	autosaveEnabled: boolean;
	autoCompactThreshold: number;

	// History (Phase 11)
	chatHistorySortStrategy: "recent" | "created" | "name";
}

export const USER_SENDER = "user";
export const AI_SENDER = "ai";

export interface ChatMessage {
	id: string;
	message: string;
	sender: typeof USER_SENDER | typeof AI_SENDER;
	timestamp: string;
	isVisible: boolean;
	isErrorMessage?: boolean;
	reasoningSteps?: ReasoningStep[];
	citations?: CitationSource[];
	contextItems?: { path: string; displayName: string; type: string }[];
}

export interface StoredMessage {
	id: string;
	displayText: string;
	sender: typeof USER_SENDER | typeof AI_SENDER;
	timestamp: string;
	isVisible: boolean;
	isErrorMessage?: boolean;
	reasoningSteps?: ReasoningStep[];
	citations?: CitationSource[];
}

/** Context item for chat input */
export interface ContextItem {
	type: "active-note" | "note" | "folder" | "selection";
	path: string;
	displayName: string;
	/** Only for selection type: the selected text content */
	selectionContent?: string;
}

/** 系统提示词 */
export interface UserSystemPrompt {
	title: string;
	content: string;
	createdMs: number;
	modifiedMs: number;
}

/** 自定义命令 */
export interface CustomCommand {
	title: string;
	content: string;
	showInContextMenu: boolean;
	order: number;
}

/** 获取 model 的唯一 key（兼容旧 CustomModel） */
export function getModelKey(model: CustomModel): string {
	return `${model.name}|${model.provider}`;
}

/** 获取第一个启用的模型 key（兼容旧 CustomModel，排序第一位即为默认模型） */
export function getFirstEnabledModelKey(models: CustomModel[]): string {
	const first = models.find((m) => m.enabled);
	return first ? getModelKey(first) : "";
}

// ── 新架构辅助函数 ──

/** 获取第一个启用的 ModelConfig ID */
export function getFirstEnabledModelConfigId(configs: ModelConfig[]): string {
	const first = configs.find((m) => m.enabled);
	return first?.id ?? "";
}

/** 根据 ID 查找 ModelConfig */
export function findModelConfig(configs: ModelConfig[], id: string): ModelConfig | undefined {
	return configs.find((m) => m.id === id);
}

/** 根据 ID 查找 Provider */
export function findProvider(providers: Provider[], id: string): Provider | undefined {
	return providers.find((p) => p.id === id);
}

/** 获取 ModelConfig 关联的 Provider */
export function getLinkedProvider(providers: Provider[], mc: ModelConfig): Provider | undefined {
	return mc.providerId ? findProvider(providers, mc.providerId) : undefined;
}

/** 获取 Provider 下关联的所有 ModelConfig */
export function getLinkedModels(configs: ModelConfig[], providerId: string): ModelConfig[] {
	return configs.filter((m) => m.providerId === providerId);
}

export { generateId } from "../../shared/utils";

/** Agent 推理步骤 (Phase 3) */
export interface ReasoningStep {
	type: "tool_call" | "tool_result" | "thinking";
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	result?: string;
	content?: string;
	durationMs?: number;
}

/** @提及类型 (Phase 4) */
export interface Mention {
	type: "note" | "tag" | "folder" | "url" | "vault" | "web";
	value: string;
	displayName: string;
}

/** 图片附件 (Phase 4) */
export interface ImageAttachment {
	id: string;
	data: string; // base64 data URL
	name: string;
	mimeType: string;
}

/** 引用来源 (Phase 7) */
export interface CitationSource {
	index: number;
	path: string;
	title: string;
	chunk: string;
	score: number;
	source: string;
}

export interface SessionOverrides {
	systemPromptTitle?: string;
	maxTokens?: number;
	temperature?: number;
	topP?: number | null;
	frequencyPenalty?: number | null;
	reasoningEffort?: "low" | "medium" | "high" | null;
}
