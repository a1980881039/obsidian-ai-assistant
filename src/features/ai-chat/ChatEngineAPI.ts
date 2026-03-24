/**
 * ChatEngineAPI — 跨 Feature 公共接口。
 * ai-agent 等外部 Feature 通过此接口访问 ai-chat 能力，
 * 不再直接引用 ChatManager 内部成员。
 */

import type { ChatModelManager } from "./providers/chatModelManager";
import type { ToolRegistry } from "./tools/ToolRegistry";

export interface ChatEngineAPI {
	readonly chatModelManager: ChatModelManager;
	readonly toolRegistry: ToolRegistry;
}
