import { Notice } from "obsidian";
import type { MessageRepository } from "./MessageRepository";
import type { CustomCommandManager } from "../prompts/customCommands";
import { processCommandTemplate } from "../prompts/promptBuilder";
import { AI_SENDER, USER_SENDER } from "../types";

/**
 * 消息操作 — 删除、编辑、重新生成、执行自定义命令。
 */
export class MessageEditor {
	constructor(
		private readonly messageRepo: MessageRepository,
		private readonly customCommandManager: CustomCommandManager,
		private readonly notifyMessagesChanged: () => void,
	) {}

	/** 删除消息 */
	deleteMessage(id: string): void {
		this.messageRepo.deleteMessage(id);
		this.notifyMessagesChanged();
	}

	/** 编辑消息 */
	editMessage(id: string, newText: string): void {
		this.messageRepo.editMessage(id, newText);
		this.notifyMessagesChanged();
	}

	/**
	 * 重新生成最后一条 AI 消息。
	 * 返回需要重新发送的用户消息文本，由 ChatManager 调用 sendMessage。
	 */
	prepareRegenerate(): string | null {
		const messages = this.messageRepo.getDisplayMessages();
		let lastAiIdx = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].sender === AI_SENDER && !messages[i].isErrorMessage) {
				lastAiIdx = i;
				break;
			}
		}
		if (lastAiIdx < 0) return null;

		let userMsg = "";
		for (let i = lastAiIdx - 1; i >= 0; i--) {
			if (messages[i].sender === USER_SENDER) {
				userMsg = messages[i].message;
				break;
			}
		}
		if (!userMsg) return null;

		this.messageRepo.deleteMessage(messages[lastAiIdx].id);
		this.notifyMessagesChanged();
		return userMsg;
	}

	/** 执行自定义命令，返回处理后的文本 */
	async resolveCommand(
		commandTitle: string,
		vars?: { selection?: string; activeNote?: string; input?: string },
	): Promise<string | null> {
		const content = await this.customCommandManager.getCommandContent(commandTitle);
		if (!content) {
			new Notice(`命令 "${commandTitle}" 未找到`);
			return null;
		}
		return processCommandTemplate(content, vars || {});
	}
}
