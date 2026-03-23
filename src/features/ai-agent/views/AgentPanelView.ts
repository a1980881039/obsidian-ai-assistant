import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import AgentPanel from "./AgentPanel.svelte";
import { VIEW_TYPE_AI_AGENT } from "../constants";
import type { AgentTemplateManager } from "../core/AgentTemplateManager";
import type { CanvasEngine } from "../core/CanvasEngine";
import type { WorkflowRunner } from "../core/WorkflowRunner";

export interface AgentPanelDeps {
	templateManager: AgentTemplateManager;
	canvasEngine: CanvasEngine;
	workflowRunner: WorkflowRunner;
	getActiveCanvasFile: () => import("obsidian").TFile | null;
	onInsertAgent: (templateId: string) => void;
	onRunWorkflow: (input: string) => void;
}

/**
 * Obsidian ItemView 容器，挂载 Svelte 5 AgentPanel 组件。
 */
export class AgentPanelView extends ItemView {
	private component: Record<string, unknown> | undefined;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: AgentPanelDeps,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_AI_AGENT;
	}

	getDisplayText(): string {
		return "AI Agent 综合体";
	}

	getIcon(): string {
		return "workflow";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("gz-ai-agent-container");

		this.component = mount(AgentPanel, {
			target: this.contentEl,
			props: {
				app: this.app,
				templateManager: this.deps.templateManager,
				canvasEngine: this.deps.canvasEngine,
				getActiveCanvasFile: this.deps.getActiveCanvasFile,
				onInsertAgent: this.deps.onInsertAgent,
				onRunWorkflow: this.deps.onRunWorkflow,
			},
		});
	}

	async onClose(): Promise<void> {
		if (this.component) {
			unmount(this.component);
			this.component = undefined;
		}
	}
}
