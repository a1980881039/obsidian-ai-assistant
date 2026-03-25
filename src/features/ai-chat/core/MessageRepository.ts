import { USER_SENDER, AI_SENDER, type ChatMessage, type StoredMessage, type ReasoningStep, type CitationSource, type ImageAttachment } from "../types";
import { generateMessageId } from "../constants";

/**
 * 消息仓库 — 聊天消息的单一数据源。
 * 参考 copilot MessageRepository，简化为 Phase 1 所需的最小实现。
 */
export class MessageRepository {
	private messages: (StoredMessage & { contextItems?: { path: string; displayName: string; type: string }[] })[] = [];
	private displayCache: ChatMessage[] | null = null;

	private invalidateCache(): void {
		this.displayCache = null;
	}

	addMessage(displayText: string, sender: typeof USER_SENDER | typeof AI_SENDER, opts?: {
		id?: string;
		isVisible?: boolean;
		isErrorMessage?: boolean;
		contextItems?: { path: string; displayName: string; type: string }[];
		reasoningSteps?: ReasoningStep[];
		citations?: CitationSource[];
		images?: ImageAttachment[];
	}): string {
		const id = opts?.id || generateMessageId();
		const message: StoredMessage & { contextItems?: { path: string; displayName: string; type: string }[] } = {
			id,
			displayText,
			sender,
			timestamp: new Date().toISOString(),
			isVisible: opts?.isVisible !== false,
			isErrorMessage: opts?.isErrorMessage,
			reasoningSteps: opts?.reasoningSteps,
			citations: opts?.citations,
			contextItems: opts?.contextItems,
			images: opts?.images,
		};
		this.messages.push(message);
		this.invalidateCache();
		return id;
	}

	editMessage(id: string, newText: string): boolean {
		const msg = this.messages.find((m) => m.id === id);
		if (!msg) return false;
		msg.displayText = newText;
		this.invalidateCache();
		return true;
	}

	deleteMessage(id: string): boolean {
		const idx = this.messages.findIndex((m) => m.id === id);
		if (idx === -1) return false;
		this.messages.splice(idx, 1);
		this.invalidateCache();
		return true;
	}

	clear(): void {
		this.messages = [];
		this.invalidateCache();
	}

	truncateAfterMessageId(messageId: string): void {
		const idx = this.messages.findIndex((m) => m.id === messageId);
		if (idx !== -1) {
			this.messages = this.messages.slice(0, idx + 1);
			this.invalidateCache();
		}
	}

	/** 获取用于 UI 显示的消息列表（带缓存） */
	getDisplayMessages(): ChatMessage[] {
		if (this.displayCache) return this.displayCache;
		this.displayCache = this.messages
			.filter((m) => m.isVisible)
			.map((m) => ({
				id: m.id,
				message: m.displayText,
				sender: m.sender,
				timestamp: m.timestamp,
				isVisible: true,
				isErrorMessage: m.isErrorMessage,
				reasoningSteps: m.reasoningSteps,
				citations: m.citations,
				contextItems: m.contextItems,
				images: m.images,
			}));
		return this.displayCache;
	}

	/** 获取用于 LLM 对话历史的消息（最近 N 轮） */
	getHistoryMessages(maxTurns: number): Array<{ role: string; content: string }> {
		const visible = this.messages.filter((m) => m.isVisible && !m.isErrorMessage);
		const sliced = visible.slice(-maxTurns * 2);
		return sliced.map((m) => ({
			role: m.sender === USER_SENDER ? "user" : "assistant",
			content: m.displayText,
		}));
	}

	getMessageCount(): number {
		return this.messages.filter((m) => m.isVisible).length;
	}
}
