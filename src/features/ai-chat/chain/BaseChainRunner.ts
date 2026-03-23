import type { ChatModelManager } from "../providers/chatModelManager";
import type { MessageRepository } from "../core/MessageRepository";
import type { AIChatSettings, ChatMessage, ReasoningStep } from "../types";
import { AI_SENDER } from "../types";

export interface ChainRunnerCallbacks {
	onToken: (fullText: string) => void;
	onComplete: (message: ChatMessage) => void;
	onError: (error: Error) => void;
	onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
	onToolResult?: (toolName: string, result: string) => void;
	onReasoningStep?: (step: ReasoningStep) => void;
}

/**
 * Chain Runner 基类。
 * 定义了运行链的接口和通用的错误处理。
 */
export abstract class BaseChainRunner {
	constructor(
		protected chatModelManager: ChatModelManager,
		protected messageRepo: MessageRepository,
		protected settings: AIChatSettings,
	) {}

	abstract run(
		userMessage: string,
		callbacks: ChainRunnerCallbacks,
		abortController: AbortController,
	): Promise<string>;

	protected handleError(error: Error, callbacks: ChainRunnerCallbacks): void {
		const msg = error.message || String(error);
		const isAuthError =
			msg.includes("401") ||
			msg.toLowerCase().includes("api key") ||
			msg.toLowerCase().includes("unauthorized") ||
			msg.toLowerCase().includes("authentication");

		let userMessage: string;
		if (isAuthError) {
			userMessage = "API key 验证失败，请检查设置中的 API Key 是否正确。";
		} else {
			userMessage = `发生错误: ${msg}`;
		}

		callbacks.onError(new Error(userMessage));
	}
}
