import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { USER_SENDER, AI_SENDER, type ChatMessage } from "../types";

const KEEP_RECENT_TURNS = 4; // Keep last N user+AI pairs uncompacted

/**
 * Auto-compact: when conversation token count exceeds threshold,
 * compress older messages into a summary while keeping recent turns intact.
 */
export class AutoCompactor {
	/**
	 * 估算 token 数量。
	 * 中日韩字符约 1 token/字，拉丁字符约 4 chars/token。
	 */
	private static readonly CJK_REGEX = /[\u4E00-\u9FFF\u3000-\u30FF\uAC00-\uD7AF\uFF00-\uFFEF]/g;

	static estimateTokens(messages: ChatMessage[]): number {
		let tokens = 0;
		for (const m of messages) {
			if (!m.isVisible) continue;
			const text = m.message;
			const cjkMatches = text.match(AutoCompactor.CJK_REGEX);
			const cjk = cjkMatches ? cjkMatches.length : 0;
			const latin = text.length - cjk;
			tokens += cjk + Math.ceil(latin / 4);
		}
		return tokens;
	}

	/**
	 * Check if compaction is needed.
	 */
	static needsCompaction(messages: ChatMessage[], threshold: number): boolean {
		return this.estimateTokens(messages) > threshold;
	}

	/**
	 * Compact older messages into a summary using the LLM.
	 * Returns a new message array: [summary message, ...recent messages].
	 */
	static async compact(
		messages: ChatMessage[],
		chatModel: BaseChatModel,
	): Promise<ChatMessage[]> {
		const visible = messages.filter(m => m.isVisible);
		if (visible.length <= KEEP_RECENT_TURNS * 2) return messages;

		// Split: older messages to summarize, recent to keep
		const cutoff = visible.length - KEEP_RECENT_TURNS * 2;
		const toSummarize = visible.slice(0, cutoff);
		const toKeep = visible.slice(cutoff);

		// Build summary prompt
		const conversationText = toSummarize
			.map(m => `${m.sender}: ${m.message.slice(0, 500)}`)
			.join("\n");

		const summaryPrompt = [
			new SystemMessage("You are a conversation summarizer. Summarize the key points, decisions, and context from the conversation below. Be concise but preserve important details. Reply in the same language as the conversation."),
			new HumanMessage(`Summarize this conversation:\n\n${conversationText}`),
		];

		let summaryText: string;
		try {
			const result = await chatModel.invoke(summaryPrompt);
			summaryText = typeof result.content === "string"
				? result.content
				: JSON.stringify(result.content);
		} catch {
			// If summarization fails, just truncate
			summaryText = toSummarize
				.slice(-4)
				.map(m => `${m.sender}: ${m.message.slice(0, 200)}`)
				.join("\n");
		}

		const summaryMessage: ChatMessage = {
			id: `compact-${Date.now()}`,
			message: `[历史摘要]\n${summaryText}`,
			sender: AI_SENDER,
			timestamp: new Date().toISOString(),
			isVisible: true,
		};

		return [summaryMessage, ...toKeep];
	}
}
