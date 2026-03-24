/** AI Agent 综合体 — 类型定义 */

import { AI_DATA_FOLDER } from "../../shared/utils";

/** 智能体模板 */
export interface AgentTemplate {
	id: string;
	name: string;
	role: string;
	systemPrompt: string;
	modelKey: string;
	enabledTools: string[];
	color: string;
	icon: string;
	createdMs: number;
	modifiedMs: number;
}

/** 嵌入白板文本节点中的 Agent 元数据 */
export interface AgentNodeData {
	type: "ai-agent";
	templateId: string;
	instanceId: string;
	status: "idle" | "running" | "done" | "error";
	lastOutput?: string;
}

/** 解析后的工作流 */
export interface AgentWorkflow {
	canvasPath: string;
	agents: AgentWorkflowNode[];
	connections: AgentConnection[];
}

export interface AgentWorkflowNode {
	canvasNodeId: string;
	instanceId: string;
	templateId: string;
	position: { x: number; y: number };
	size: { width: number; height: number };
}

export interface AgentConnection {
	fromInstanceId: string;
	toInstanceId: string;
	edgeId: string;
}

/** Canvas JSON 结构 */
export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface CanvasNode {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	text?: string;
	file?: string;
	color?: string;
	[key: string]: unknown;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide: "top" | "bottom" | "left" | "right";
	toSide: "top" | "bottom" | "left" | "right";
	label?: string;
	[key: string]: unknown;
}

/** 设置 */
export interface AIAgentSettings {
	enabled: boolean;
	templateStorePath: string;
	defaultWorkflowMaxSteps: number;
}

export const DEFAULT_AI_AGENT_SETTINGS: AIAgentSettings = {
	enabled: true,
	templateStorePath: `${AI_DATA_FOLDER}/agent-templates.json`,
	defaultWorkflowMaxSteps: 20,
};
