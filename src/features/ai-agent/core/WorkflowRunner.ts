import type { App, TFile } from "obsidian";
import type { AgentWorkflow } from "../types";
import type { CanvasEngine } from "./CanvasEngine";
import type { AgentTemplateManager } from "./AgentTemplateManager";
import type { ChatModelManager } from "../../ai-chat/providers/chatModelManager";
import type { ToolRegistry } from "../../ai-chat/tools/ToolRegistry";
import { ToolRegistry as ToolRegistryClass } from "../../ai-chat/tools/ToolRegistry";
import { MessageRepository } from "../../ai-chat/core/MessageRepository";
import { AgentChainRunner } from "../../ai-chat/chain/AgentChainRunner";

/**
 * 工作流执行器 — 单 Agent 执行 + 拓扑排序批量执行。
 */
export class WorkflowRunner {
	private app: App;
	private canvasEngine: CanvasEngine;
	private templateManager: AgentTemplateManager;
	private abortController: AbortController | null = null;

	constructor(app: App, canvasEngine: CanvasEngine, templateManager: AgentTemplateManager) {
		this.app = app;
		this.canvasEngine = canvasEngine;
		this.templateManager = templateManager;
	}

	/** 执行单个 Agent 节点 */
	async runAgent(
		canvasFile: TFile,
		instanceId: string,
		input: string,
		chatModelManager: ChatModelManager,
		toolRegistry: ToolRegistry,
		settings: { agentMaxIterations: number; contextTurns: number },
	): Promise<string> {
		// 找到对应节点
		const data = await this.canvasEngine.readCanvas(canvasFile);
		const nodes = this.canvasEngine.parseAgentNodes(data);
		const node = nodes.find((n) => n.instanceId === instanceId);
		if (!node) throw new Error(`Agent node not found: ${instanceId}`);

		const template = this.templateManager.getTemplate(node.templateId);
		if (!template) throw new Error(`Template not found: ${node.templateId}`);

		// 更新状态为 running
		await this.canvasEngine.updateAgentNode(canvasFile, instanceId, { status: "running" });

		try {
			// 初始化模型
			await chatModelManager.initModel(template.modelKey);

			// 创建 scoped ToolRegistry
			const scopedRegistry = new ToolRegistryClass();
			for (const toolName of template.enabledTools) {
				const toolDef = toolRegistry.get(toolName);
				if (toolDef) scopedRegistry.register(toolDef);
			}

			// 创建临时 MessageRepository
			const messageRepo = new MessageRepository();
			messageRepo.addMessage(input, "user");

			const agentSettings = {
				...settings,
				agentToolTimeout: 30000,
				enabledTools: {},
				autoCompactThreshold: 0,
			};

			const runner = new AgentChainRunner(
				chatModelManager,
				messageRepo,
				agentSettings as any,
				scopedRegistry,
				"",
				template.systemPrompt,
			);

			this.abortController = new AbortController();
			let result = "";

			await runner.run(input, {
				onToken: () => {},
				onComplete: async (msg) => {
					result = msg.message;
					await this.canvasEngine.updateAgentNode(canvasFile, instanceId, {
						status: "done",
						output: result,
					});
				},
				onError: async (error) => {
					result = `错误: ${error.message}`;
					await this.canvasEngine.updateAgentNode(canvasFile, instanceId, {
						status: "error",
						output: result,
					});
				},
			}, this.abortController);

			return result;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.canvasEngine.updateAgentNode(canvasFile, instanceId, {
				status: "error",
				output: `错误: ${errMsg}`,
			});
			return "";
		}
	}

	/** 按拓扑顺序执行整个工作流 */
	async runWorkflow(
		canvasFile: TFile,
		initialInput: string,
		chatModelManager: ChatModelManager,
		toolRegistry: ToolRegistry,
		settings: { agentMaxIterations: number; contextTurns: number },
		onProgress?: (instanceId: string, status: string) => void,
	): Promise<void> {
		const data = await this.canvasEngine.readCanvas(canvasFile);
		const workflow = this.canvasEngine.buildWorkflow(canvasFile.path, data);

		if (workflow.agents.length === 0) return;

		// 拓扑排序
		const order = this.topologicalSort(workflow);

		// 存储每个 Agent 的输出，供下游使用
		const outputs = new Map<string, string>();

		for (const instanceId of order) {
			if (this.abortController?.signal.aborted) break;

			onProgress?.(instanceId, "running");

			// 收集上游输出作为输入
			const upstreamInputs: string[] = [];
			for (const conn of workflow.connections) {
				if (conn.toInstanceId === instanceId) {
					const upOutput = outputs.get(conn.fromInstanceId);
					if (upOutput) upstreamInputs.push(upOutput);
				}
			}

			const input = upstreamInputs.length > 0
				? upstreamInputs.join("\n\n---\n\n")
				: initialInput;

			const result = await this.runAgent(
				canvasFile, instanceId, input,
				chatModelManager, toolRegistry, settings,
			);

			outputs.set(instanceId, result);
			onProgress?.(instanceId, "done");
		}
	}

	/** 拓扑排序：返回 instanceId 的执行顺序 */
	private topologicalSort(workflow: AgentWorkflow): string[] {
		const inDegree = new Map<string, number>();
		const adj = new Map<string, string[]>();

		for (const agent of workflow.agents) {
			inDegree.set(agent.instanceId, 0);
			adj.set(agent.instanceId, []);
		}

		for (const conn of workflow.connections) {
			adj.get(conn.fromInstanceId)?.push(conn.toInstanceId);
			inDegree.set(conn.toInstanceId, (inDegree.get(conn.toInstanceId) || 0) + 1);
		}

		// BFS
		const queue: string[] = [];
		for (const [id, deg] of inDegree) {
			if (deg === 0) queue.push(id);
		}

		const result: string[] = [];
		while (queue.length > 0) {
			const current = queue.shift()!;
			result.push(current);
			for (const next of adj.get(current) || []) {
				const newDeg = (inDegree.get(next) || 1) - 1;
				inDegree.set(next, newDeg);
				if (newDeg === 0) queue.push(next);
			}
		}

		return result;
	}

	abort(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}
}
