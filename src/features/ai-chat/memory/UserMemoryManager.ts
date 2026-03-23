import type { App, TFile } from "obsidian";
import { AI_ROOT_FOLDER, AI_DATA_FOLDER, MEMORY_FILE } from "../constants";

/**
 * 用户长期记忆管理器。
 * 将 AI 记住的用户偏好、事实存储在一个 Markdown 文件中。
 */
export class UserMemoryManager {
	private app: App;
	private folder: string;

	constructor(app: App, folder: string = AI_DATA_FOLDER) {
		this.app = app;
		this.folder = folder;
	}

	updateFolder(folder: string): void {
		this.folder = folder;
	}

	private get filePath(): string {
		return `${this.folder}/${MEMORY_FILE}`;
	}

	private async ensureFolder(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
			await this.app.vault.createFolder(AI_ROOT_FOLDER);
		}
		if (!this.app.vault.getAbstractFileByPath(this.folder)) {
			await this.app.vault.createFolder(this.folder);
		}
	}

	/** 读取所有记忆 */
	async getMemories(): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(this.filePath);
		if (!file || !("stat" in file)) return "";
		return this.app.vault.read(file as TFile);
	}

	/** 添加一条记忆 */
	async addMemory(memory: string): Promise<void> {
		await this.ensureFolder();
		const existing = await this.getMemories();
		const timestamp = new Date().toLocaleString("zh-CN");
		const entry = `\n- [${timestamp}] ${memory}`;

		const file = this.app.vault.getAbstractFileByPath(this.filePath);
		if (file && "stat" in file) {
			await this.app.vault.modify(file as TFile, existing + entry);
		} else {
			await this.app.vault.create(this.filePath, `# AI 记忆\n${entry}`);
		}
	}

	/** 清除所有记忆 */
	async clearMemories(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.filePath);
		if (file && "stat" in file) {
			await this.app.vault.modify(file as TFile, "# AI 记忆\n");
		}
	}

	/** 格式化为系统提示词注入 */
	async formatForPrompt(): Promise<string> {
		const memories = await this.getMemories();
		if (!memories.trim()) return "";
		return `<user_memory>\n${memories}\n</user_memory>`;
	}
}
