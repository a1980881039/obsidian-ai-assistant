/**
 * MessageService — 消息生命周期管理。
 * 封装 MessageRepository、MessageEditor、ChatSessionManager、ChatPersistence。
 */

import type { App, TFile } from "obsidian";
import { MessageRepository } from "../core/MessageRepository";
import { MessageEditor } from "../core/MessageEditor";
import { ChatSessionManager } from "../core/ChatSessionManager";
import { ChatPersistence } from "../core/ChatPersistence";
import { AutoCompactor } from "../core/AutoCompactor";
import type { CustomCommandManager } from "../prompts/customCommands";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { USER_SENDER, AI_SENDER, type AIChatSettings, type ChatMessage, type ImageAttachment } from "../types";

export class MessageService {
	readonly messageRepo: MessageRepository;
	readonly persistence: ChatPersistence;
	private readonly sessionManager: ChatSessionManager;
	private readonly messageEditor: MessageEditor;
	private titleGenerated = false;

	constructor(
		app: App,
		settings: AIChatSettings,
		customCommandManager: CustomCommandManager,
		private readonly notifyMessagesChanged: () => void,
	) {
		this.messageRepo = new MessageRepository();
		this.persistence = new ChatPersistence(app);
		this.sessionManager = new ChatSessionManager(
			this.messageRepo, this.persistence, settings, notifyMessagesChanged,
		);
		this.messageEditor = new MessageEditor(
			this.messageRepo, customCommandManager, notifyMessagesChanged,
		);
	}

	// ── 消息操作 ──

	addUserMessage(text: string, contextItems?: { path: string; displayName: string; type: string }[], images?: ImageAttachment[]): void {
		this.messageRepo.addMessage(text, USER_SENDER, { contextItems, images });
		this.notifyMessagesChanged();
	}

	addAIMessage(message: string, opts?: { reasoningSteps?: ChatMessage["reasoningSteps"]; citations?: ChatMessage["citations"]; isErrorMessage?: boolean }): void {
		this.messageRepo.addMessage(message, AI_SENDER, opts);
		this.notifyMessagesChanged();
	}

	getDisplayMessages(): ChatMessage[] {
		return this.messageRepo.getDisplayMessages();
	}

	deleteMessage(id: string): void {
		this.messageEditor.deleteMessage(id);
	}

	editMessage(id: string, newText: string): void {
		this.messageEditor.editMessage(id, newText);
	}

	prepareRegenerate(): string | null {
		return this.messageEditor.prepareRegenerate();
	}

	async resolveCommand(commandTitle: string, vars?: { selection?: string; activeNote?: string; input?: string }): Promise<string | null> {
		return this.messageEditor.resolveCommand(commandTitle, vars);
	}

	truncateAfterAndDelete(id: string): void {
		this.messageRepo.truncateAfterMessageId(id);
		this.messageRepo.deleteMessage(id);
		this.notifyMessagesChanged();
	}

	// ── Auto-compact ──

	async autoCompactIfNeeded(threshold: number, chatModel: BaseChatModel): Promise<void> {
		if (threshold <= 0) return;
		const currentMessages = this.messageRepo.getDisplayMessages();
		if (!AutoCompactor.needsCompaction(currentMessages, threshold)) return;

		try {
			const compacted = await AutoCompactor.compact(currentMessages, chatModel);
			this.messageRepo.clear();
			for (const msg of compacted) {
				this.messageRepo.addMessage(msg.message, msg.sender);
			}
			this.notifyMessagesChanged();
		} catch { /* Compaction failed, continue with full history */ }
	}

	// ── 会话生命周期 (委托 SessionManager) ──

	async newChat(): Promise<void> {
		this.titleGenerated = false;
		return this.sessionManager.newChat();
	}

	async saveCurrentChat(modelKey: string): Promise<void> {
		return this.sessionManager.saveCurrentChat(modelKey);
	}

	async loadChat(file: TFile): Promise<string> {
		this.titleGenerated = true;
		return this.sessionManager.loadChat(file);
	}

	async getChatHistory(sort?: "recent" | "created" | "name", page?: number, pageSize?: number) {
		return this.sessionManager.getChatHistory(sort, page, pageSize);
	}

	async deleteChatHistory(file: TFile): Promise<void> {
		return this.sessionManager.deleteChatHistory(file);
	}

	async renameChatHistory(file: TFile, newTopic: string): Promise<void> {
		return this.sessionManager.renameChatHistory(file, newTopic);
	}

	scheduleAutoSave(modelKey: string): void {
		this.sessionManager.scheduleAutoSave(modelKey);
	}

	getCurrentChatFile(): TFile | null {
		return this.sessionManager.getCurrentChatFile();
	}

	// ── 标题生成 ──

	shouldGenerateTitle(): boolean {
		if (this.titleGenerated) return false;
		this.titleGenerated = true;
		return true;
	}

	async generateTitle(messages: ChatMessage[], invoke: (prompt: string) => Promise<string>): Promise<string> {
		return this.persistence.generateAITitle(messages, invoke);
	}

	// ── 设置 & 销毁 ──

	updateSettings(settings: AIChatSettings): void {
		this.sessionManager.updateSettings(settings);
	}

	destroy(): void {
		this.sessionManager.destroy();
	}
}
