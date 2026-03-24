/** AI Agent 综合体 — 常量 */

import { AI_DATA_FOLDER, generateId } from "../../shared/utils";

export const VIEW_TYPE_AI_AGENT = "ai-agent-view";

export const AGENT_DATA_FOLDER = AI_DATA_FOLDER;
export const AGENT_TEMPLATES_FILE = "agent-templates.json";

/** Agent 节点标记的正则 */
export const AGENT_NODE_MARKER_START = "---ai-agent---";
export const AGENT_NODE_MARKER_END = "---end---";
export const AGENT_NODE_REGEX = /---ai-agent---\n([\s\S]*?)\n---end---/;

export function generateInstanceId(): string {
	return generateId("agent");
}

export function generateTemplateId(): string {
	return generateId("tpl");
}
