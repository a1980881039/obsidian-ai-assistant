import type { App, TFile } from "obsidian";
import type { ImageAttachment } from "../types";
import { expandNoteContent } from "../context/noteExpander";
import { buildFolderContext } from "../context/folderContext";

export interface ContextItem {
	type: "active-note" | "note" | "folder" | "selection";
	path: string;
	displayName: string;
	selectionContent?: string;
}

export interface MessageContext {
	/** 编辑器中选中的文本 */
	selectedText?: string;
	/** @提及的笔记 */
	mentionedNotes: Array<{ path: string; content: string }>;
	/** 附加图片 */
	images?: ImageAttachment[];
	/** 通过上下文菜单/自动跟踪添加的内容（含活跃笔记） */
	contextItemContents: Array<{ path: string; type: string; content: string }>;
}

/**
 * 上下文管理器 — 收集当前笔记、选中文本、@提及笔记等上下文信息。
 */
export class ContextManager {
	constructor(private app: App) {}

	/** 获取当前活跃笔记的内容 */
	async getActiveNoteContext(): Promise<{ path: string; content: string } | undefined> {
		const file = this.app.workspace.getActiveFile();
		if (!file) return undefined;
		const content = await this.app.vault.cachedRead(file);
		return { path: file.path, content };
	}

	/** 获取编辑器中选中的文本 */
	getSelectedText(): string | undefined {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) return undefined;
		const selection = editor.getSelection();
		return selection || undefined;
	}

	/** 解析 @提及的笔记路径并读取内容 */
	async resolveMentions(text: string): Promise<Array<{ path: string; content: string }>> {
		const mentionRegex = /@\[\[([^\]]+)\]\]/g;
		const results: Array<{ path: string; content: string }> = [];
		const seen = new Set<string>();

		let match: RegExpExecArray | null;
		while ((match = mentionRegex.exec(text)) !== null) {
			const noteName = match[1].trim();
			if (seen.has(noteName)) continue;
			seen.add(noteName);

			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				const content = await this.app.vault.cachedRead(file);
				results.push({ path: file.path, content });
			}
		}
		return results;
	}

	/** 解析上下文菜单添加的项目，读取实际内容 */
	async resolveContextItems(items: ContextItem[]): Promise<Array<{ path: string; type: string; content: string }>> {
		const results: Array<{ path: string; type: string; content: string }> = [];
		const seen = new Set<string>();

		for (const item of items) {
			if (item.type === "selection") {
				if (item.selectionContent) {
					results.push({ path: item.path, type: "selection", content: item.selectionContent });
				}
				continue;
			}

			if (seen.has(item.path)) continue;
			seen.add(item.path);

			if (item.type === "folder") {
				const content = await buildFolderContext(this.app, item.path);
				results.push({ path: item.path, type: "folder", content });
			} else {
				// "active-note" or "note" → read and expand embeds
				const file = this.app.metadataCache.getFirstLinkpathDest(item.path, "") ??
					this.app.vault.getAbstractFileByPath(item.path) as TFile | null;
				if (file && "stat" in file) {
					let content = await this.app.vault.cachedRead(file as TFile);
					content = await expandNoteContent(this.app, content);
					results.push({ path: item.path, type: "note", content });
				}
			}
		}
		return results;
	}

	/** 构建完整的消息上下文 */
	async buildContext(userMessage: string, images?: ImageAttachment[], contextItems?: ContextItem[]): Promise<MessageContext> {
		const [selectedText, mentionedNotes, contextItemContents] = await Promise.all([
			Promise.resolve(this.getSelectedText()),
			this.resolveMentions(userMessage),
			contextItems?.length ? this.resolveContextItems(contextItems) : Promise.resolve([]),
		]);

		// 去重：如果 contextItems 已包含某笔记，@提及中就不再重复
		const contextPaths = new Set(contextItemContents.map(c => c.path));
		const dedupedMentions = mentionedNotes.filter(m => !contextPaths.has(m.path));

		return { selectedText, mentionedNotes: dedupedMentions, images, contextItemContents };
	}

	/** 将上下文格式化为系统提示词片段 */
	formatContextForPrompt(ctx: MessageContext): string {
		const parts: string[] = [];

		if (ctx.selectedText) {
			parts.push(`<selected_text>\n${ctx.selectedText}\n</selected_text>`);
		}

		for (const item of ctx.contextItemContents) {
			if (item.type === "folder") {
				parts.push(`<context_folder path="${item.path}">\n${item.content}\n</context_folder>`);
			} else if (item.type === "selection") {
				const pathAttr = item.path && item.path !== "selection" ? ` source="${item.path}"` : "";
				parts.push(`<selected_text${pathAttr}>\n${item.content}\n</selected_text>`);
			} else {
				parts.push(`<context_note path="${item.path}">\n${item.content}\n</context_note>`);
			}
		}

		for (const note of ctx.mentionedNotes) {
			parts.push(`<mentioned_note path="${note.path}">\n${note.content}\n</mentioned_note>`);
		}

		if (ctx.images && ctx.images.length > 0) {
			parts.push(`<images count="${ctx.images.length}">[${ctx.images.length} image(s) attached]</images>`);
		}

		return parts.join("\n\n");
	}
}
