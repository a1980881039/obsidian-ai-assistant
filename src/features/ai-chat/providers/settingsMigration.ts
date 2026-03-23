/**
 * 设置迁移：将旧版 CustomModel[] 格式自动迁移为 Provider[] + ModelConfig[]。
 *
 * 迁移逻辑：
 * 1. 检测 settings.aiChat.activeModels 是否有数据且 providers 为空
 * 2. 按 (provider + apiKey + baseUrl) 分组，每组创建一个 Provider
 * 3. 每个 CustomModel 转为 ModelConfig，链接到对应 Provider
 * 4. 写入新字段并保留旧数据作为备份
 */

import {
	ChatModelProvider,
	type AIChatSettings,
	type CustomModel,
	type Provider,
	type ModelConfig,
	generateId,
} from "../types";
import { PROVIDER_PRESETS } from "./providerConfig";
import { PROVIDER_META } from "./providerConfig";
import { detectCapabilities } from "./modelCapabilities";

/** 检查是否需要迁移 */
export function needsMigration(settings: AIChatSettings): boolean {
	return (
		settings.activeModels?.length > 0 &&
		(!settings.providers || settings.providers.length === 0) &&
		(!settings.modelConfigs || settings.modelConfigs.length === 0)
	);
}

/** 从 CustomModel 生成 Provider 分组 key */
function providerGroupKey(model: CustomModel): string {
	const key = model.apiKey || "";
	const url = model.baseUrl || PROVIDER_PRESETS[model.provider] || "";
	return `${model.provider}::${key}::${url}`;
}

/** 执行迁移 */
export function migrateToProviderModel(settings: AIChatSettings): {
	providers: Provider[];
	modelConfigs: ModelConfig[];
	defaultModelId: string | null;
} {
	const now = Date.now();
	const groups = new Map<string, { models: CustomModel[]; provider: ChatModelProvider; apiKey: string; baseUrl: string }>();

	// Step 1: 按 (provider + apiKey + baseUrl) 分组
	for (const model of settings.activeModels) {
		const key = providerGroupKey(model);
		if (!groups.has(key)) {
			groups.set(key, {
				models: [],
				provider: model.provider,
				apiKey: model.apiKey || "",
				baseUrl: model.baseUrl || PROVIDER_PRESETS[model.provider] || "",
			});
		}
		groups.get(key)!.models.push(model);
	}

	const providers: Provider[] = [];
	const modelConfigs: ModelConfig[] = [];

	// Step 2: 每组创建 Provider + ModelConfigs
	for (const [, group] of groups) {
		const meta = PROVIDER_META[group.provider];
		const providerId = generateId("provider");

		const provider: Provider = {
			id: providerId,
			name: meta?.label || group.provider,
			type: group.provider,
			baseUrl: group.baseUrl,
			apiKey: group.apiKey,
			stream: true,
			createdAt: now,
			updatedAt: now,
		};
		providers.push(provider);

		for (const model of group.models) {
			const caps = model.capabilities || detectCapabilities(model.name);
			const mc: ModelConfig = {
				id: generateId("model"),
				name: model.name,
				model: model.name,
				provider: model.provider,
				baseUrl: group.baseUrl,
				apiKey: group.apiKey,
				enabled: model.enabled,
				capabilities: caps,
				providerId,
				temperature: model.temperature,
				maxTokens: model.maxTokens,
				stream: model.stream,
				topP: model.topP,
				frequencyPenalty: model.frequencyPenalty,
				reasoningEffort: model.reasoningEffort,
				createdAt: now,
				updatedAt: now,
			};
			modelConfigs.push(mc);
		}
	}

	// Step 3: 默认模型 = 第一个启用的
	const defaultModelId = modelConfigs.find((m) => m.enabled)?.id ?? null;

	return { providers, modelConfigs, defaultModelId };
}

/** 执行迁移并写入 settings（就地修改） */
export function applyMigration(settings: AIChatSettings): boolean {
	if (!needsMigration(settings)) return false;

	const { providers, modelConfigs, defaultModelId } = migrateToProviderModel(settings);
	settings.providers = providers;
	settings.modelConfigs = modelConfigs;
	settings.defaultModelId = defaultModelId;

	// 保留旧数据备份，不删除 activeModels
	return true;
}
