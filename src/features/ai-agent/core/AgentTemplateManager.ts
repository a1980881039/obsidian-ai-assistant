import type { App, TFile } from "obsidian";
import type { AgentTemplate } from "../types";
import { AGENT_DATA_FOLDER, AGENT_TEMPLATES_FILE, generateTemplateId } from "../constants";

/**
 * 智能体模板管理器 — CRUD 操作，JSON 文件持久化。
 */
export class AgentTemplateManager {
	private app: App;
	private templates: AgentTemplate[] = [];
	private filePath: string;

	constructor(app: App, filePath: string) {
		this.app = app;
		this.filePath = filePath;
	}

	async loadTemplates(): Promise<AgentTemplate[]> {
		try {
			const file = this.app.vault.getFileByPath(this.filePath);
			if (file) {
				const content = await this.app.vault.read(file);
				this.templates = JSON.parse(content);
			}
		} catch {
			this.templates = [];
		}
		return this.templates;
	}

	private async saveTemplates(): Promise<void> {
		const json = JSON.stringify(this.templates, null, 2);
		const file = this.app.vault.getFileByPath(this.filePath);
		if (file) {
			await this.app.vault.modify(file, json);
		} else {
			// 确保目录存在
			const folder = this.app.vault.getFolderByPath(AGENT_DATA_FOLDER);
			if (!folder) {
				await this.app.vault.createFolder(AGENT_DATA_FOLDER);
			}
			await this.app.vault.create(this.filePath, json);
		}
	}

	async createTemplate(
		partial: Omit<AgentTemplate, "id" | "createdMs" | "modifiedMs">,
	): Promise<AgentTemplate> {
		const now = Date.now();
		const template: AgentTemplate = {
			...partial,
			id: generateTemplateId(),
			createdMs: now,
			modifiedMs: now,
		};
		this.templates.push(template);
		await this.saveTemplates();
		return template;
	}

	async updateTemplate(id: string, updates: Partial<AgentTemplate>): Promise<void> {
		const idx = this.templates.findIndex((t) => t.id === id);
		if (idx === -1) return;
		this.templates[idx] = { ...this.templates[idx], ...updates, modifiedMs: Date.now() };
		await this.saveTemplates();
	}

	async deleteTemplate(id: string): Promise<void> {
		this.templates = this.templates.filter((t) => t.id !== id);
		await this.saveTemplates();
	}

	getTemplate(id: string): AgentTemplate | undefined {
		return this.templates.find((t) => t.id === id);
	}

	getTemplates(): AgentTemplate[] {
		return [...this.templates];
	}
}
