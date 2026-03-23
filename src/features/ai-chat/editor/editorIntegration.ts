import type { App, Editor } from "obsidian";
import type { ChatManager } from "../core/ChatManager";

/**
 * 编辑器集成 — 快速提问和右键菜单。
 */
export class EditorIntegration {
	private app: App;
	private chatManager: ChatManager;

	constructor(app: App, chatManager: ChatManager) {
		this.app = app;
		this.chatManager = chatManager;
	}

	/** 用选中文本快速提问 */
	async quickAsk(editor: Editor, prompt: string, modelKey: string): Promise<void> {
		const selection = editor.getSelection();
		if (!selection) return;

		const fullPrompt = prompt
			? `${prompt}\n\n${selection}`
			: selection;

		await this.chatManager.sendMessage(fullPrompt, modelKey);
	}

	/** 总结选中文本 */
	async summarizeSelection(editor: Editor, modelKey: string): Promise<void> {
		await this.quickAsk(editor, "请总结以下内容：", modelKey);
	}

	/** 翻译选中文本 */
	async translateSelection(editor: Editor, modelKey: string, targetLang: string = "英文"): Promise<void> {
		await this.quickAsk(editor, `请将以下内容翻译为${targetLang}：`, modelKey);
	}

	/** 解释选中文本 */
	async explainSelection(editor: Editor, modelKey: string): Promise<void> {
		await this.quickAsk(editor, "请解释以下内容：", modelKey);
	}

	/** 改写选中文本 */
	async rewriteSelection(editor: Editor, modelKey: string): Promise<void> {
		await this.quickAsk(editor, "请改写以下内容，使其更加清晰流畅：", modelKey);
	}
}
