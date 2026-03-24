import type { TFile } from "obsidian";
import { Notice } from "obsidian";
import type { MessageRepository } from "./MessageRepository";
import type { ChatPersistence } from "./ChatPersistence";
import type { AIChatSettings } from "../types";

/**
 * 对话生命周期管理 — 新建、保存、加载、删除、重命名、自动保存。
 */
export class ChatSessionManager {
	private currentChatFile: TFile | null = null;
	private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private autoSaveModelKey = "";

	constructor(
		private readonly messageRepo: MessageRepository,
		private readonly persistence: ChatPersistence,
		private settings: AIChatSettings,
		private readonly notifyMessagesChanged: () => void,
	) {}

	getCurrentChatFile(): TFile | null {
		return this.currentChatFile;
	}

	/** 新建对话 */
	async newChat(): Promise<void> {
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}
		this.messageRepo.clear();
		this.currentChatFile = null;
		this.notifyMessagesChanged();
	}

	/** 保存当前对话 */
	async saveCurrentChat(modelKey: string): Promise<void> {
		const messages = this.messageRepo.getDisplayMessages();
		if (messages.length === 0) {
			new Notice("没有消息可保存");
			return;
		}

		try {
			if (this.currentChatFile) {
				await this.persistence.updateChat(this.currentChatFile, messages, modelKey);
			} else {
				this.currentChatFile = await this.persistence.saveChat(messages, modelKey);
			}
			this.persistence.invalidateCache();
			new Notice("对话已保存");
		} catch (err) {
			new Notice(`保存失败: ${err}`);
		}
	}

	/** 加载历史对话 */
	async loadChat(file: TFile): Promise<string> {
		const { messages, modelKey } = await this.persistence.loadChat(file);
		this.messageRepo.clear();

		for (const msg of messages) {
			this.messageRepo.addMessage(msg.message, msg.sender);
		}

		this.currentChatFile = file;
		this.notifyMessagesChanged();
		return modelKey;
	}

	/** 获取历史对话列表（分页） */
	async getChatHistory(sort?: "recent" | "created" | "name", page?: number, pageSize?: number) {
		return this.persistence.getChatHistoryFiles(sort, page, pageSize);
	}

	/** 删除历史对话 */
	async deleteChatHistory(file: TFile): Promise<void> {
		if (this.currentChatFile?.path === file.path) {
			this.currentChatFile = null;
		}
		await this.persistence.deleteChat(file);
		this.persistence.invalidateCache();
	}

	/** 重命名历史对话 */
	async renameChatHistory(file: TFile, newTopic: string): Promise<void> {
		await this.persistence.renameChat(file, newTopic);
		this.persistence.invalidateCache();
	}

	/** 触发自动保存（debounce 1s） */
	scheduleAutoSave(modelKey: string): void {
		if (!this.settings.autosaveEnabled) return;
		this.autoSaveModelKey = modelKey;
		if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = setTimeout(async () => {
			this.autoSaveTimer = null;
			const messages = this.messageRepo.getDisplayMessages();
			if (messages.length === 0) return;
			try {
				if (this.currentChatFile) {
					await this.persistence.updateChat(this.currentChatFile, messages, this.autoSaveModelKey);
				} else {
					this.currentChatFile = await this.persistence.saveChat(messages, this.autoSaveModelKey);
				}
				this.persistence.invalidateCache();
			} catch (e) {
				console.warn("[AI Chat] 自动保存失败:", e);
			}
		}, 1000);
	}

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
	}

	/** 清理定时器资源 */
	destroy(): void {
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}
	}
}
