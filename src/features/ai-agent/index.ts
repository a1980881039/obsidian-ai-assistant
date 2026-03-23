import type { TFile } from "obsidian";
import { Notice } from "obsidian";
import type { Feature, SettingsRenderContext } from "../Feature";
import type SuperPlugin from "../../main";
import { AgentPanelView } from "./views/AgentPanelView";
import { AgentTemplateManager } from "./core/AgentTemplateManager";
import { CanvasEngine } from "./core/CanvasEngine";
import { WorkflowRunner } from "./core/WorkflowRunner";
import { InsertAgentModal } from "./modals/InsertAgentModal";
import { VIEW_TYPE_AI_AGENT } from "./constants";
import { renderAIAgentSettings } from "./settings";
import type { AIChatFeature } from "../ai-chat/index";

/**
 * AI Agent 综合体功能模块。
 */
export class AIAgentFeature implements Feature {
	readonly id = "ai-agent";
	private plugin!: SuperPlugin;
	private templateManager!: AgentTemplateManager;
	private canvasEngine!: CanvasEngine;
	private workflowRunner!: WorkflowRunner;

	load(plugin: SuperPlugin): void {
		this.plugin = plugin;
		const settings = plugin.settings.aiAgent;

		this.canvasEngine = new CanvasEngine(plugin.app);
		this.templateManager = new AgentTemplateManager(plugin.app, settings.templateStorePath);
		this.workflowRunner = new WorkflowRunner(plugin.app, this.canvasEngine, this.templateManager);

		// 注册视图
		plugin.registerView(VIEW_TYPE_AI_AGENT, (leaf) =>
			new AgentPanelView(leaf, {
				templateManager: this.templateManager,
				canvasEngine: this.canvasEngine,
				workflowRunner: this.workflowRunner,
				getActiveCanvasFile: () => this.getActiveCanvasFile(),
				onInsertAgent: (templateId) => this.insertAgentToCanvas(templateId),
				onRunWorkflow: (input) => this.runCurrentCanvasWorkflow(input),
			}),
		);

		// 注册命令
		plugin.addCommand({
			id: "open-ai-agent-panel",
			name: "打开 AI Agent 综合体",
			callback: () => this.activateView(),
		});

		plugin.addCommand({
			id: "insert-agent-to-canvas",
			name: "插入 Agent 到白板",
			checkCallback: (checking) => {
				if (!this.plugin.settings.aiAgent.enabled) return false;
				const file = this.getActiveCanvasFile();
				if (!file) return false;
				if (!checking) {
					new InsertAgentModal(
						plugin.app,
						this.templateManager,
						(template) => this.insertAgentToCanvas(template.id),
					).open();
				}
				return true;
			},
		});

		plugin.addCommand({
			id: "run-canvas-workflow",
			name: "运行白板 Agent 工作流",
			checkCallback: (checking) => {
				if (!this.plugin.settings.aiAgent.enabled) return false;
				const file = this.getActiveCanvasFile();
				if (!file) return false;
				if (!checking) this.runCurrentCanvasWorkflow("请开始执行任务");
				return true;
			},
		});

		// 加载模板
		plugin.app.workspace.onLayoutReady(() => {
			this.templateManager.loadTemplates();
		});
	}

	unload(): void {
		this.workflowRunner.abort();
		this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_AGENT);
	}

	renderSettings(containerEl: HTMLElement, ctx: SettingsRenderContext): void {
		ctx.createSection(containerEl, {
			title: "AI Agent 综合体",
			icon: "workflow",
			defaultOpen: false,
			toggle: {
				value: this.plugin.settings.aiAgent.enabled,
				onChange: async (value) => {
					this.plugin.settings.aiAgent.enabled = value;
					await this.plugin.saveSettings();
				},
			},
			render: (content) => renderAIAgentSettings(content, this.plugin, ctx),
		});
	}

	private async activateView(): Promise<void> {
		if (!this.plugin.settings.aiAgent.enabled) return;
		const { workspace } = this.plugin.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_AGENT)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: VIEW_TYPE_AI_AGENT, active: true });
				leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_AGENT)[0];
			}
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	private getActiveCanvasFile(): TFile | null {
		const file = this.plugin.app.workspace.getActiveFile();
		if (file && file.extension === "canvas") return file;
		return null;
	}

	private async insertAgentToCanvas(templateId: string): Promise<void> {
		const file = this.getActiveCanvasFile();
		if (!file) {
			new Notice("请先打开一个白板文件");
			return;
		}
		const template = this.templateManager.getTemplate(templateId);
		if (!template) {
			new Notice("智能体模板不存在");
			return;
		}
		// 在画布中心附近随机偏移插入
		const x = Math.round(Math.random() * 400);
		const y = Math.round(Math.random() * 400);
		await this.canvasEngine.insertAgentNode(file, template, { x, y });
		new Notice(`已插入智能体: ${template.name}`);
	}

	private async runCurrentCanvasWorkflow(input: string): Promise<void> {
		const file = this.getActiveCanvasFile();
		if (!file) {
			new Notice("请先打开一个白板文件");
			return;
		}

		const aiChat = this.plugin.getFeature<AIChatFeature>("ai-chat");
		if (!aiChat) {
			new Notice("AI Chat 功能未加载");
			return;
		}

		// 通过 AIChatFeature 获取 ChatManager 的公开属性
		const chatManager = (aiChat as any).chatManager;
		if (!chatManager) {
			new Notice("ChatManager 未初始化");
			return;
		}

		const settings = this.plugin.settings.aiChat;
		new Notice("开始执行工作流...");

		try {
			await this.workflowRunner.runWorkflow(
				file,
				input,
				chatManager.chatModelManager,
				chatManager.toolRegistry,
				{
					agentMaxIterations: settings.agentMaxIterations || 10,
					contextTurns: settings.contextTurns || 10,
				},
				(instanceId, status) => {
					if (status === "done") {
						new Notice(`Agent ${instanceId.slice(0, 12)}... 执行完成`);
					}
				},
			);
			new Notice("工作流执行完成");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`工作流执行失败: ${msg}`);
		}
	}
}
