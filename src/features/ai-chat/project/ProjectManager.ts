import type { App, TFile } from "obsidian";
import { AI_ROOT_FOLDER, AI_DATA_FOLDER, PROJECTS_FILE } from "../constants";

export interface Project {
	name: string;
	folder: string;
	systemPromptTitle: string;
	createdMs: number;
}

/**
 * 项目管理器 — 每个项目有独立的对话范围和系统提示词。
 */
export class ProjectManager {
	private app: App;
	private projects: Project[] = [];
	private activeProject: string | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/** 加载项目列表 */
	async loadProjects(): Promise<Project[]> {
		const file = this.app.vault.getAbstractFileByPath(PROJECTS_FILE);
		if (file && "stat" in file) {
			const content = await this.app.vault.read(file as TFile);
			try {
				this.projects = JSON.parse(content);
			} catch {
				this.projects = [];
			}
		}
		return this.projects;
	}

	/** 保存项目列表 */
	private async saveProjects(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
			await this.app.vault.createFolder(AI_ROOT_FOLDER);
		}
		if (!this.app.vault.getAbstractFileByPath(AI_DATA_FOLDER)) {
			await this.app.vault.createFolder(AI_DATA_FOLDER);
		}
		const content = JSON.stringify(this.projects, null, 2);
		const file = this.app.vault.getAbstractFileByPath(PROJECTS_FILE);
		if (file && "stat" in file) {
			await this.app.vault.modify(file as TFile, content);
		} else {
			await this.app.vault.create(PROJECTS_FILE, content);
		}
	}

	/** 创建项目 */
	async createProject(name: string, folder: string): Promise<void> {
		if (this.projects.some((p) => p.name === name)) return;
		this.projects.push({
			name,
			folder,
			systemPromptTitle: "",
			createdMs: Date.now(),
		});
		await this.saveProjects();
	}

	/** 删除项目 */
	async deleteProject(name: string): Promise<void> {
		this.projects = this.projects.filter((p) => p.name !== name);
		if (this.activeProject === name) this.activeProject = null;
		await this.saveProjects();
	}

	/** 设置活跃项目 */
	setActiveProject(name: string | null): void {
		this.activeProject = name;
	}

	getActiveProject(): Project | null {
		if (!this.activeProject) return null;
		return this.projects.find((p) => p.name === this.activeProject) || null;
	}

	getProjects(): Project[] {
		return this.projects;
	}

	/** 更新项目的系统提示词 */
	async updateProjectPrompt(name: string, promptTitle: string): Promise<void> {
		const project = this.projects.find((p) => p.name === name);
		if (project) {
			project.systemPromptTitle = promptTitle;
			await this.saveProjects();
		}
	}
}
