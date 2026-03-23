/** AI Agent 综合体 — 常量 */

export const VIEW_TYPE_AI_AGENT = "ai-agent-view";

export const AGENT_DATA_FOLDER = "Super Enhance/AI Data";
export const AGENT_TEMPLATES_FILE = "agent-templates.json";

/** Agent 节点标记的正则 */
export const AGENT_NODE_MARKER_START = "---ai-agent---";
export const AGENT_NODE_MARKER_END = "---end---";
export const AGENT_NODE_REGEX = /---ai-agent---\n([\s\S]*?)\n---end---/;

export function generateInstanceId(): string {
	return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTemplateId(): string {
	return `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
