/**
 * 全局默认设置 — 运行时默认值，与类型定义分离。
 */

import type { PluginSettings } from "./types";
import { DEFAULT_AI_CHAT_SETTINGS } from "./features/ai-chat/constants";
import { DEFAULT_AI_AGENT_SETTINGS } from "./features/ai-agent/types";

export const DEFAULT_SETTINGS: PluginSettings = {
	aiChat: { ...DEFAULT_AI_CHAT_SETTINGS },
	aiAgent: { ...DEFAULT_AI_AGENT_SETTINGS },
};
