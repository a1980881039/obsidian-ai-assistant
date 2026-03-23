import type { App, TFile } from "obsidian";
import type {
	AgentTemplate, AgentNodeData, AgentWorkflow,
	AgentWorkflowNode, AgentConnection, CanvasData, CanvasNode,
} from "../types";
import {
	AGENT_NODE_MARKER_START, AGENT_NODE_MARKER_END,
	AGENT_NODE_REGEX, generateInstanceId,
} from "../constants";

/**
 * 白板引擎 — 读写 .canvas JSON，管理 Agent 节点。
 */
export class CanvasEngine {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/** 读取并解析白板文件 */
	async readCanvas(file: TFile): Promise<CanvasData> {
		const content = await this.app.vault.read(file);
		const data = JSON.parse(content) as CanvasData;
		return { nodes: data.nodes || [], edges: data.edges || [] };
	}

	/** 写回白板文件 */
	async writeCanvas(file: TFile, data: CanvasData): Promise<void> {
		await this.app.vault.modify(file, JSON.stringify(data, null, "\t"));
	}

	/** 插入一个 Agent 节点到白板 */
	async insertAgentNode(
		file: TFile,
		template: AgentTemplate,
		position: { x: number; y: number },
	): Promise<{ canvasNodeId: string; instanceId: string }> {
		const data = await this.readCanvas(file);
		const instanceId = generateInstanceId();
		const canvasNodeId = generateInstanceId();

		const agentData: AgentNodeData = {
			type: "ai-agent",
			templateId: template.id,
			instanceId,
			status: "idle",
		};

		const text = this.buildNodeText(agentData, template.name, template.icon);

		const node: CanvasNode = {
			id: canvasNodeId,
			type: "text",
			x: position.x,
			y: position.y,
			width: 360,
			height: 240,
			color: template.color || "4",
			text,
		};

		data.nodes.push(node);
		await this.writeCanvas(file, data);
		return { canvasNodeId, instanceId };
	}

	/** 从白板数据中解析所有 Agent 节点 */
	parseAgentNodes(data: CanvasData): AgentWorkflowNode[] {
		const nodes: AgentWorkflowNode[] = [];
		for (const node of data.nodes) {
			if (node.type !== "text" || !node.text) continue;
			const agentData = this.parseAgentData(node.text);
			if (!agentData) continue;
			nodes.push({
				canvasNodeId: node.id,
				instanceId: agentData.instanceId,
				templateId: agentData.templateId,
				position: { x: node.x, y: node.y },
				size: { width: node.width, height: node.height },
			});
		}
		return nodes;
	}

	/** 解析文本节点中的 Agent 元数据 */
	parseAgentData(text: string): AgentNodeData | null {
		const match = text.match(AGENT_NODE_REGEX);
		if (!match) return null;
		try {
			return JSON.parse(match[1]) as AgentNodeData;
		} catch {
			return null;
		}
	}

	/** 更新 Agent 节点的状态和输出 */
	async updateAgentNode(
		file: TFile,
		instanceId: string,
		updates: { status?: AgentNodeData["status"]; output?: string },
	): Promise<void> {
		const data = await this.readCanvas(file);
		for (const node of data.nodes) {
			if (node.type !== "text" || !node.text) continue;
			const agentData = this.parseAgentData(node.text);
			if (!agentData || agentData.instanceId !== instanceId) continue;

			if (updates.status) agentData.status = updates.status;
			if (updates.output) agentData.lastOutput = updates.output;

			// 重建节点文本
			const nameMatch = node.text.match(/## .+\n/);
			const name = nameMatch ? nameMatch[0].trim().replace(/^## /, "") : "Agent";
			node.text = this.buildNodeText(agentData, name, undefined, updates.output);
			break;
		}
		await this.writeCanvas(file, data);
	}

	/** 从白板 edges 构建工作流拓扑 */
	buildWorkflow(canvasPath: string, data: CanvasData): AgentWorkflow {
		const agentNodes = this.parseAgentNodes(data);
		const instanceByCanvasId = new Map<string, string>();
		for (const n of agentNodes) {
			instanceByCanvasId.set(n.canvasNodeId, n.instanceId);
		}

		const connections: AgentConnection[] = [];
		for (const edge of data.edges) {
			const fromInstance = instanceByCanvasId.get(edge.fromNode);
			const toInstance = instanceByCanvasId.get(edge.toNode);
			if (fromInstance && toInstance) {
				connections.push({
					fromInstanceId: fromInstance,
					toInstanceId: toInstance,
					edgeId: edge.id,
				});
			}
		}

		return { canvasPath, agents: agentNodes, connections };
	}

	/** 构建 Agent 节点的文本内容 */
	private buildNodeText(
		agentData: AgentNodeData,
		name: string,
		icon?: string,
		output?: string,
	): string {
		const meta = JSON.stringify(agentData);
		const statusLabel = this.getStatusLabel(agentData.status);
		const iconStr = icon ? `${icon} ` : "";
		let text = `${AGENT_NODE_MARKER_START}\n${meta}\n${AGENT_NODE_MARKER_END}\n\n`;
		text += `## ${iconStr}${name}\n`;
		text += `*${statusLabel}*\n`;
		if (output) {
			text += `\n---\n\n${output}`;
		}
		return text;
	}

	private getStatusLabel(status: AgentNodeData["status"]): string {
		switch (status) {
			case "idle": return "等待执行...";
			case "running": return "执行中...";
			case "done": return "已完成";
			case "error": return "执行出错";
		}
	}
}
