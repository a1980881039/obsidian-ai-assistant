import type { TFile } from "obsidian";
import type { ChatManager } from "../core/ChatManager";
import type { CustomModel, ModelConfig, SessionOverrides } from "../types";
import { getModelKey, findModelConfig } from "../types";

export interface HistoryState {
	items: Array<{ file: TFile; topic: string; date: string }>;
	hasMore: boolean;
	page: number;
	sortStrategy: "recent" | "created" | "name";
}

export function createHistoryState(): HistoryState {
	return { items: [], hasMore: false, page: 0, sortStrategy: "recent" };
}

export async function loadHistory(
	mgr: ChatManager,
	state: HistoryState,
	sort?: "recent" | "created" | "name",
	reset = true,
): Promise<HistoryState> {
	const sortStrategy = sort ?? state.sortStrategy;
	const page = reset ? 0 : state.page;
	const result = await mgr.getChatHistory(sortStrategy, page);
	return {
		items: reset ? result.items : [...state.items, ...result.items],
		hasMore: result.hasMore,
		page,
		sortStrategy,
	};
}

export function initSessionOverrides(
	models: CustomModel[],
	selectedModelKey: string,
): SessionOverrides {
	const model = models.find(m => getModelKey(m) === selectedModelKey);
	if (!model) return {};
	return {
		maxTokens: model.maxTokens,
		temperature: model.temperature,
		topP: model.topP ?? null,
		frequencyPenalty: model.frequencyPenalty ?? null,
		reasoningEffort: model.reasoningEffort ?? null,
	};
}

/** 从 ModelConfig 列表初始化 session overrides（新架构） */
export function initSessionOverridesFromConfig(
	configs: ModelConfig[],
	selectedModelId: string,
): SessionOverrides {
	const mc = findModelConfig(configs, selectedModelId);
	if (!mc) return {};
	return {
		maxTokens: mc.maxTokens,
		temperature: mc.temperature,
		topP: mc.topP ?? null,
		frequencyPenalty: mc.frequencyPenalty ?? null,
		reasoningEffort: mc.reasoningEffort ?? null,
	};
}
