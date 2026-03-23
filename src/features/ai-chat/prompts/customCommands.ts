import type { App, TFile } from "obsidian";
import type { CustomCommand } from "../types";
import { AI_ROOT_FOLDER } from "../constants";

/**
 * 自定义命令管理器 — 以 Markdown 文件存储。
 * 文件名即命令标题，文件内容即命令模板。
 */
export class CustomCommandManager {
	private app: App;
	private folder: string;
	private cache: CustomCommand[] = [];

	constructor(app: App, folder: string) {
		this.app = app;
		this.folder = folder;
	}

	updateFolder(folder: string): void {
		this.folder = folder;
		this.cache = [];
	}

	private async ensureFolder(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
			await this.app.vault.createFolder(AI_ROOT_FOLDER);
		}
		if (!this.app.vault.getAbstractFileByPath(this.folder)) {
			await this.app.vault.createFolder(this.folder);
		}
	}

	/** 加载所有命令 */
	async fetchCommands(): Promise<CustomCommand[]> {
		await this.ensureFolder();
		const files = this.app.vault.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.folder + "/"));

		const commands = await Promise.all(files.map(async (file) => {
			const content = await this.app.vault.read(file);
			const meta = this.app.metadataCache.getFileCache(file)?.frontmatter;
			return {
				title: file.basename,
				content: this.stripFrontmatter(content),
				showInContextMenu: meta?.["command-context-menu"] !== false,
				order: meta?.["command-order"] ?? 0,
			};
		}));

		this.cache = commands.sort((a, b) => a.order - b.order);
		return this.cache;
	}

	getCachedCommands(): CustomCommand[] {
		return this.cache;
	}

	/** 创建命令 */
	async createCommand(title: string, content: string): Promise<void> {
		await this.ensureFolder();
		const path = `${this.folder}/${title}.md`;
		const body = `---\ncommand-context-menu: true\ncommand-order: ${this.cache.length * 10}\n---\n${content}`;
		await this.app.vault.create(path, body);
		await this.fetchCommands();
	}

	/** 更新命令 */
	async updateCommand(title: string, content: string): Promise<void> {
		const file = this.getFile(title);
		if (file) {
			const existing = await this.app.vault.read(file);
			const frontmatter = this.extractFrontmatter(existing);
			const body = frontmatter ? `${frontmatter}\n${content}` : content;
			await this.app.vault.modify(file, body);
			await this.fetchCommands();
		}
	}

	/** 删除命令 */
	async deleteCommand(title: string): Promise<void> {
		const file = this.getFile(title);
		if (file) {
			await this.app.vault.trash(file, true);
			await this.fetchCommands();
		}
	}

	/** 获取命令内容 */
	async getCommandContent(title: string): Promise<string | null> {
		const file = this.getFile(title);
		if (!file) return null;
		const raw = await this.app.vault.read(file);
		return this.stripFrontmatter(raw);
	}

	private getFile(title: string): TFile | null {
		const path = `${this.folder}/${title}.md`;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !("stat" in file)) return null;
		return file as TFile;
	}

	private stripFrontmatter(content: string): string {
		const match = content.match(/^---\n[\s\S]*?\n---\n/);
		return match ? content.slice(match[0].length) : content;
	}

	private extractFrontmatter(content: string): string | null {
		const match = content.match(/^(---\n[\s\S]*?\n---)\n/);
		return match ? match[1] : null;
	}
}
