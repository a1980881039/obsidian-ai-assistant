import { App, Modal, setIcon } from "obsidian";
import type { AgentTemplate } from "../types";
import type { AgentTemplateManager } from "../core/AgentTemplateManager";

/**
 * 插入 Agent 到白板的选择弹窗。
 */
export class InsertAgentModal extends Modal {
	private templateManager: AgentTemplateManager;
	private onSelect: (template: AgentTemplate) => void;

	constructor(app: App, templateManager: AgentTemplateManager, onSelect: (template: AgentTemplate) => void) {
		super(app);
		this.templateManager = templateManager;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("gz-agent-insert-modal");

		contentEl.createEl("h3", { text: "选择要插入的智能体" });

		const templates = this.templateManager.getTemplates();

		if (templates.length === 0) {
			contentEl.createEl("p", {
				text: "暂无智能体模板，请先在 AI Agent 综合体面板中创建。",
				cls: "gz-agent-empty-hint",
			});
			return;
		}

		const list = contentEl.createDiv({ cls: "gz-agent-template-list" });
		for (const tpl of templates) {
			const item = list.createDiv({ cls: "gz-agent-template-item" });
			item.addEventListener("click", () => {
				this.onSelect(tpl);
				this.close();
			});

			const iconEl = item.createSpan({ cls: "gz-agent-template-icon" });
			setIcon(iconEl, tpl.icon || "bot");

			const info = item.createDiv({ cls: "gz-agent-template-info" });
			info.createEl("strong", { text: tpl.name });
			info.createEl("small", { text: tpl.role });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
