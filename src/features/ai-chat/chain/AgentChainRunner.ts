import { BaseChainRunner, type ChainRunnerCallbacks } from "./BaseChainRunner";
import { AI_SENDER, type ReasoningStep, type ImageAttachment } from "../types";
import { DEFAULT_SYSTEM_PROMPT, generateMessageId } from "../constants";
import type { ToolRegistry } from "../tools/ToolRegistry";
import {
	HumanMessage,
	AIMessage,
	SystemMessage,
	ToolMessage,
	AIMessageChunk,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

const AGENT_SYSTEM_SUFFIX = `

You are an AI assistant with access to the following tools. Use them proactively when the user's request can benefit from them.
When you have enough information, provide a final answer directly.
Always respond in the same language as the user's message.`;

/** 根据已启用工具列表生成工具说明 */
function buildToolListPrompt(toolRegistry: ToolRegistry): string {
	const tools = toolRegistry.getAll();
	if (tools.length === 0) return "";
	const lines = tools.map(t => `- **${t.name}**: ${t.description}`);
	return `\n\nAvailable tools:\n${lines.join("\n")}`;
}

/**
 * Agent 链 — ReAct 循环，流式输出 + 工具调用。
 * 模型可以调用工具，观察结果，再决定下一步。
 */
export class AgentChainRunner extends BaseChainRunner {
	private toolRegistry: ToolRegistry;
	private contextPrompt: string;
	private customSystemPrompt: string;
	private images: ImageAttachment[] | undefined;

	constructor(
		...args: [
			...ConstructorParameters<typeof BaseChainRunner>,
			ToolRegistry,
			string?,
			string?,
			ImageAttachment[]?,
		]
	) {
		super(args[0], args[1], args[2]);
		this.toolRegistry = args[3];
		this.contextPrompt = args[4] || "";
		this.customSystemPrompt = args[5] || "";
		this.images = args[6];
	}

	async run(
		userMessage: string,
		callbacks: ChainRunnerCallbacks,
		abortController: AbortController,
	): Promise<string> {
		try {
			const chatModel = this.chatModelManager.getChatModel();
			const tools = this.toolRegistry.getLangChainTools();
			const maxIterations = this.settings.agentMaxIterations || 10;

			if (tools.length === 0) {
				callbacks.onError(new Error("没有可用的工具，请在设置中启用至少一个工具。"));
				return "";
			}

			// 绑定工具到模型（需要模型支持 function calling）
			let boundModel: any;
			try {
				boundModel = (chatModel as any).bindTools(tools);
			} catch (err) {
				// 模型可能不支持 bindTools，尝试直接传递
				console.warn("[Agent] bindTools failed, model may not support tool calling:", err);
				callbacks.onError(new Error(
					"当前模型不支持工具调用 (function calling)。请切换到支持工具调用的模型（如 GPT-4o、Claude 3.5 等）。"
				));
				return "";
			}

			let systemPrompt = (this.customSystemPrompt || DEFAULT_SYSTEM_PROMPT) + AGENT_SYSTEM_SUFFIX;
			systemPrompt += buildToolListPrompt(this.toolRegistry);
			if (this.contextPrompt) {
				systemPrompt += "\n\n" + this.contextPrompt;
			}

			const messages: BaseMessage[] = [new SystemMessage(systemPrompt)];
			const history = this.messageRepo.getHistoryMessages(this.settings.contextTurns);
			for (const h of history) {
				messages.push(h.role === "user" ? new HumanMessage(h.content) : new AIMessage(h.content));
			}

			// 确保当前用户消息在 messages 中，并在有图片时构建多模态消息
			const lastH = history[history.length - 1];
			const isCurrentMsgInHistory = lastH?.content === userMessage && lastH?.role === "user";
			if (this.images && this.images.length > 0) {
				const multimodalMsg = new HumanMessage({
					content: [
						{ type: "text", text: userMessage },
						...this.images.map(img => ({
							type: "image_url" as const,
							image_url: { url: img.data },
						})),
					],
				});
				if (isCurrentMsgInHistory) {
					messages[messages.length - 1] = multimodalMsg;
				} else {
					messages.push(multimodalMsg);
				}
			} else if (!isCurrentMsgInHistory) {
				messages.push(new HumanMessage(userMessage));
			}

			let fullText = "";
			const reasoningSteps: ReasoningStep[] = [];

			for (let i = 0; i < maxIterations; i++) {
				if (abortController.signal.aborted) break;

				// Stream the model response
				const { text, toolCalls, aiMsg } = await this.streamIteration(
					boundModel, messages, callbacks, abortController, fullText,
				);

				messages.push(aiMsg);
				fullText += text;

				if (!toolCalls || toolCalls.length === 0) {
					break;
				}

				// Execute tool calls
				for (const tc of toolCalls) {
					if (abortController.signal.aborted) break;
					const startMs = Date.now();

					const step: ReasoningStep = {
						type: "tool_call",
						toolName: tc.name,
						toolArgs: tc.args as Record<string, unknown>,
					};
					callbacks.onReasoningStep?.(step);
					callbacks.onToolCall?.(tc.name, tc.args as Record<string, unknown>);

					const toolDef = this.toolRegistry.get(tc.name);
					if (!toolDef) {
						messages.push(new ToolMessage({ tool_call_id: tc.id || tc.name, content: `Tool "${tc.name}" not found.` }));
						continue;
					}

					try {
						const result = await toolDef.tool.invoke(tc.args);
						const resultStr = typeof result === "string" ? result : JSON.stringify(result);
						messages.push(new ToolMessage({ tool_call_id: tc.id || tc.name, content: resultStr }));

						const resultStep: ReasoningStep = {
							type: "tool_result",
							toolName: tc.name,
							result: resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr,
							durationMs: Date.now() - startMs,
						};
						reasoningSteps.push(step, resultStep);
						callbacks.onReasoningStep?.(resultStep);
						callbacks.onToolResult?.(tc.name, resultStr);
					} catch (err) {
						const errMsg = err instanceof Error ? err.message : String(err);
						messages.push(new ToolMessage({ tool_call_id: tc.id || tc.name, content: `Error: ${errMsg}` }));
					}
				}
			}

			callbacks.onComplete({
				id: generateMessageId(),
				message: fullText,
				sender: AI_SENDER,
				timestamp: new Date().toISOString(),
				isVisible: true,
				reasoningSteps: reasoningSteps.length > 0 ? reasoningSteps : undefined,
			});
			return fullText;
		} catch (error: unknown) {
			this.handleError(error instanceof Error ? error : new Error(String(error)), callbacks);
			return "";
		}
	}

	/** Stream a single model iteration, accumulating text and tool calls */
	private async streamIteration(
		boundModel: any,
		messages: BaseMessage[],
		callbacks: ChainRunnerCallbacks,
		abortController: AbortController,
		existingText: string,
	): Promise<{ text: string; toolCalls: any[] | undefined; aiMsg: AIMessage }> {
		let text = "";
		let accumulated: AIMessageChunk | null = null;

		try {
			const stream = await boundModel.stream(messages, { signal: abortController.signal });
			for await (const chunk of stream) {
				if (abortController.signal.aborted) break;
				accumulated = accumulated ? accumulated.concat(chunk) : chunk;
				const contentPart = typeof chunk.content === "string" ? chunk.content : "";
				if (contentPart) {
					text += contentPart;
					callbacks.onToken(existingText + text);
				}
			}
		} catch (err: unknown) {
			// If aborted, use what we have
			if (!abortController.signal.aborted) throw err;
		}

		const toolCalls = accumulated?.tool_calls;
		const aiMsg = new AIMessage({
			content: accumulated?.content ?? text,
			tool_calls: toolCalls as any,
		});

		return { text, toolCalls, aiMsg };
	}
}
