import type { App, TFile } from "obsidian";
import type { UserSystemPrompt } from "../types";
import { AI_ROOT_FOLDER } from "../constants";

/**
 * 系统提示词管理器 — 以 Markdown 文件存储在指定文件夹中。
 * 文件名即标题，文件内容即提示词正文。
 */
export class SystemPromptManager {
	private app: App;
	private folder: string;
	private cache: UserSystemPrompt[] = [];

	constructor(app: App, folder: string) {
		this.app = app;
		this.folder = folder;
	}

	updateFolder(folder: string): void {
		this.folder = folder;
		this.cache = [];
	}

	/** 确保文件夹存在 */
	private async ensureFolder(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
			await this.app.vault.createFolder(AI_ROOT_FOLDER);
		}
		if (!this.app.vault.getAbstractFileByPath(this.folder)) {
			await this.app.vault.createFolder(this.folder);
		}
	}

	/** 加载所有提示词 */
	async fetchPrompts(): Promise<UserSystemPrompt[]> {
		await this.ensureFolder();
		const files = this.app.vault.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.folder + "/"));

		const prompts = await Promise.all(files.map(async (file) => {
			const content = await this.app.vault.read(file);
			return {
				title: file.basename,
				content,
				createdMs: file.stat.ctime,
				modifiedMs: file.stat.mtime,
			};
		}));

		this.cache = prompts.sort((a, b) => b.modifiedMs - a.modifiedMs);
		return this.cache;
	}

	getCachedPrompts(): UserSystemPrompt[] {
		return this.cache;
	}

	/** 创建提示词 */
	async createPrompt(title: string, content: string): Promise<void> {
		await this.ensureFolder();
		const path = `${this.folder}/${title}.md`;
		await this.app.vault.create(path, content);
		await this.fetchPrompts();
	}

	/** 更新提示词 */
	async updatePrompt(title: string, content: string): Promise<void> {
		const file = this.getFile(title);
		if (file) {
			await this.app.vault.modify(file, content);
			await this.fetchPrompts();
		}
	}

	/** 删除提示词 */
	async deletePrompt(title: string): Promise<void> {
		const file = this.getFile(title);
		if (file) {
			await this.app.vault.trash(file, true);
			await this.fetchPrompts();
		}
	}

	/** 获取指定提示词内容 */
	async getPromptContent(title: string): Promise<string | null> {
		const file = this.getFile(title);
		if (!file) return null;
		return this.app.vault.read(file);
	}

	private getFile(title: string): TFile | null {
		const path = `${this.folder}/${title}.md`;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !("stat" in file)) return null;
		return file as TFile;
	}
}
