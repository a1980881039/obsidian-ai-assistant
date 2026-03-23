/**
 * 全局类型定义 — 仅包含类型声明，不包含运行时值。
 */

import type { AIChatSettings } from "./features/ai-chat/types";
import type { AIAgentSettings } from "./features/ai-agent/types";

export interface PluginSettings {
	aiChat: AIChatSettings;
	aiAgent: AIAgentSettings;
}
