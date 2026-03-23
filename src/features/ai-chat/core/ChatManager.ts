import type { App, TFile } from "obsidian";
import { MessageRepository } from "./MessageRepository";
import { ContextManager } from "./ContextManager";
import { ChatPersistence } from "./ChatPersistence";
import { ChatSessionManager } from "./ChatSessionManager";
import { MessageEditor } from "./MessageEditor";
import { ChatModelManager } from "../providers/chatModelManager";
import { AgentChainRunner } from "../chain/AgentChainRunner";
import { HybridRetriever } from "../search/hybridRetriever";
import { SystemPromptManager } from "../prompts/SystemPromptManager";
import { CustomCommandManager } from "../prompts/customCommands";
import { buildSystemPrompt } from "../prompts/promptBuilder";
import { ToolRegistry } from "../tools/ToolRegistry";
import { registerBuiltinTools } from "../tools/builtinTools";
import { createMemoryTools } from "../tools/memoryTool";
import { UserMemoryManager } from "../memory/UserMemoryManager";
import { ProjectManager } from "../project/ProjectManager";
import { EmbeddingManager } from "../embedding/EmbeddingManager";
import { VaultIndexer } from "../search/VaultIndexer";
import { AutoCompactor } from "./AutoCompactor";
import { USER_SENDER, AI_SENDER, type AIChatSettings, type ChatMessage, type ReasoningStep } from "../types";

export interface ChatManagerCallbacks {
	onMessagesChanged: (messages: ChatMessage[]) => void;
	onStreamingToken: (fullText: string) => void;
	onLoadingChanged: (loading: boolean) => void;
	onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
	onToolResult?: (toolName: string, result: string) => void;
	onReasoningStep?: (step: ReasoningStep) => void;
}

/**
 * 聊天业务协调器 — 统一管理消息、上下文、记忆、持久化。
 */
export class ChatManager {
	readonly messageRepo: MessageRepository;
	readonly contextManager: ContextManager;
	readonly persistence: ChatPersistence;
	readonly chatModelManager: ChatModelManager;
	readonly retriever: HybridRetriever;
	readonly systemPromptManager: SystemPromptManager;
	readonly customCommandManager: CustomCommandManager;
	readonly toolRegistry: ToolRegistry;
	readonly userMemoryManager: UserMemoryManager;
	readonly projectManager: ProjectManager;
	readonly embeddingManager: EmbeddingManager;
	readonly vaultIndexer: VaultIndexer;

	private readonly sessionManager: ChatSessionManager;
	private readonly messageEditor: MessageEditor;

	private app: App;
	private settings: AIChatSettings;
	private callbacks: ChatManagerCallbacks | null = null;
	private abortController: AbortController | null = null;
	private titleGenerated = false;

	constructor(app: App, settings: AIChatSettings) {
		this.app = app;
		this.settings = settings;
		this.messageRepo = new MessageRepository();
		this.contextManager = new ContextManager(app);
		this.persistence = new ChatPersistence(app);
		this.chatModelManager = new ChatModelManager(settings);
		this.retriever = new HybridRetriever(app);
		this.systemPromptManager = new SystemPromptManager(app, settings.systemPromptsFolder);
		this.customCommandManager = new CustomCommandManager(app, settings.customCommandsFolder);
		this.toolRegistry = new ToolRegistry();
		registerBuiltinTools(this.toolRegistry, app, () => this.settings.tavilyApiKey);
		this.userMemoryManager = new UserMemoryManager(app);
		this.projectManager = new ProjectManager(app);
		this.embeddingManager = new EmbeddingManager(settings);
		this.vaultIndexer = new VaultIndexer(app, this.embeddingManager, settings);
		this.retriever.setVaultIndexer(this.vaultIndexer);

		this.sessionManager = new ChatSessionManager(
			this.messageRepo, this.persistence, settings, () => this.notifyMessagesChanged(),
		);
		this.messageEditor = new MessageEditor(
			this.messageRepo, this.customCommandManager, () => this.notifyMessagesChanged(),
		);

		for (const t of createMemoryTools(this.userMemoryManager)) {
			this.toolRegistry.register(t);
		}
		if (Object.keys(settings.enabledTools).length > 0) {
			this.toolRegistry.syncEnabledState(settings.enabledTools);
		}
	}

	setCallbacks(cb: ChatManagerCallbacks): void {
		this.callbacks = cb;
	}

	private static readonly WRITE_TOOLS = ["write_note", "append_to_note", "replace_in_file", "delete_note", "rename_note", "update_note_properties"];

	setFileWriteAllowed(allowed: boolean): void {
		for (const name of ChatManager.WRITE_TOOLS) {
			this.toolRegistry.setEnabled(name, allowed);
		}
	}

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
		this.chatModelManager.updateSettings(settings);
		this.systemPromptManager.updateFolder(settings.systemPromptsFolder);
		this.customCommandManager.updateFolder(settings.customCommandsFolder);
		this.embeddingManager.updateSettings(settings);
		this.vaultIndexer.updateSettings(settings);
		this.sessionManager.updateSettings(settings);
		this.toolRegistry.syncEnabledState(settings.enabledTools);
	}

	getDisplayMessages(): ChatMessage[] { return this.messageRepo.getDisplayMessages(); }
	getSettings(): AIChatSettings { return this.settings; }

	/** 索引笔记库（用于嵌入/语义搜索） */
	async indexVault(): Promise<number> {
		const bm25Count = await this.retriever.indexVault();
		if (this.settings.embeddingApiKey) {
			try { await this.vaultIndexer.indexVault(); } catch { /* 降级为纯 BM25 */ }
		}
		return bm25Count;
	}

	/** 发送消息 */
	async sendMessage(text: string, modelKey: string, contextItems?: { path: string; displayName: string; type: string; selectionContent?: string }[]): Promise<void> {
		if (!text.trim() || this.abortController) return;

		const context = await this.contextManager.buildContext(text, undefined, contextItems as any);
		const contextPrompt = this.contextManager.formatContextForPrompt(context);

		this.messageRepo.addMessage(text, USER_SENDER, { contextItems });
		this.notifyMessagesChanged();
		this.callbacks?.onLoadingChanged(true);

		// 初始化模型（只初始化一次，auto-compact 和后续推理共用）
		try {
			await this.chatModelManager.initModel(modelKey);
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err);
			this.messageRepo.addMessage(errMsg, AI_SENDER, { isErrorMessage: true });
			this.notifyMessagesChanged();
			this.callbacks?.onLoadingChanged(false);
			return;
		}

		// Auto-compact if needed
		if (this.settings.autoCompactThreshold > 0) {
			const currentMessages = this.messageRepo.getDisplayMessages();
			if (AutoCompactor.needsCompaction(currentMessages, this.settings.autoCompactThreshold)) {
				try {
					const chatModel = this.chatModelManager.getChatModel();
					const compacted = await AutoCompactor.compact(currentMessages, chatModel);
					this.messageRepo.clear();
					for (const msg of compacted) {
						this.messageRepo.addMessage(msg.message, msg.sender);
					}
					this.notifyMessagesChanged();
				} catch { /* Compaction failed, continue with full history */ }
			}
		}

		this.abortController = new AbortController();

		// 构建系统提示词
		const activeProject = this.projectManager.getActiveProject();
		const promptTitle = activeProject?.systemPromptTitle || this.settings.activeSystemPromptTitle;
		let systemPrompt = await buildSystemPrompt(this.systemPromptManager, promptTitle);

		const memoryPrompt = await this.userMemoryManager.formatForPrompt();
		if (memoryPrompt) systemPrompt += "\n\n" + memoryPrompt;

		const runner = new AgentChainRunner(this.chatModelManager, this.messageRepo, this.settings, this.toolRegistry, contextPrompt, systemPrompt);

		await runner.run(text, {
			onToken: (fullText: string) => { this.callbacks?.onStreamingToken(fullText); },
			onComplete: async (msg: ChatMessage) => {
				this.callbacks?.onStreamingToken("");
				this.messageRepo.addMessage(msg.message, AI_SENDER, {
					reasoningSteps: msg.reasoningSteps,
					citations: msg.citations,
				});
				this.notifyMessagesChanged();
				this.callbacks?.onLoadingChanged(false);
				this.abortController = null;
				this.sessionManager.scheduleAutoSave(modelKey);

				// Auto-generate title on first AI reply (fire-and-forget)
				if (!this.titleGenerated) {
					this.titleGenerated = true;
					this.autoGenerateTitle(modelKey).catch(() => {});
				}
			},
			onError: (error: Error) => {
				this.callbacks?.onStreamingToken("");
				this.messageRepo.addMessage(error.message, AI_SENDER, { isErrorMessage: true });
				this.notifyMessagesChanged();
				this.callbacks?.onLoadingChanged(false);
				this.abortController = null;
			},
		}, this.abortController);
	}

	stopGeneration(): void {
		if (this.abortController) { this.abortController.abort(); this.abortController = null; }
	}

	/** 清理资源（插件卸载时调用） */
	destroy(): void {
		this.stopGeneration();
		this.sessionManager.destroy();
	}

	// ── 委托给 ChatSessionManager ──
	async newChat(): Promise<void> { this.titleGenerated = false; return this.sessionManager.newChat(); }
	async saveCurrentChat(modelKey: string): Promise<void> { return this.sessionManager.saveCurrentChat(modelKey); }
	async loadChat(file: TFile): Promise<string> { this.titleGenerated = true; return this.sessionManager.loadChat(file); }
	async getChatHistory(sort?: "recent" | "created" | "name", page?: number, pageSize?: number) { return this.sessionManager.getChatHistory(sort, page, pageSize); }
	async deleteChatHistory(file: TFile): Promise<void> { return this.sessionManager.deleteChatHistory(file); }
	async renameChatHistory(file: TFile, newTopic: string): Promise<void> { return this.sessionManager.renameChatHistory(file, newTopic); }

	async generateTitleForChat(file: TFile): Promise<string> {
		const chatData = await this.persistence.loadChat(file);
		if (!chatData || chatData.messages.length === 0) return "新对话";

		try {
			// Ensure model is initialized (it may not be if user opens history without chatting)
			await this.chatModelManager.initModel(chatData.modelKey);
			const chatModel = this.chatModelManager.getChatModel();
			const invoke = async (prompt: string) => {
				const result = await chatModel.invoke(prompt);
				return typeof result.content === "string" ? result.content : String(result.content);
			};
			return await this.persistence.generateAITitle(chatData.messages, invoke);
		} catch {
			const firstUser = chatData.messages.find(m => m.sender === "user");
			return firstUser?.message.slice(0, 40).trim() || "新对话";
		}
	}

	/** 首次 AI 回复后自动生成标题，写入已保存的文件 */
	private async autoGenerateTitle(modelKey: string): Promise<void> {
		// Wait for autoSave to finish first (1s debounce + write time)
		await new Promise(r => setTimeout(r, 2000));

		const file = this.sessionManager.getCurrentChatFile();
		if (!file) return;

		const messages = this.messageRepo.getDisplayMessages();
		if (messages.length < 2) return;

		try {
			const chatModel = this.chatModelManager.getChatModel();
			const invoke = async (prompt: string) => {
				const result = await chatModel.invoke(prompt);
				return typeof result.content === "string" ? result.content : String(result.content);
			};
			const title = await this.persistence.generateAITitle(messages, invoke);
			if (title && title !== "新对话") {
				await this.persistence.renameChat(file, title);
				this.persistence.invalidateCache();
			}
		} catch {
			// Non-critical: title generation failed silently
		}
	}

	// ── 委托给 MessageEditor ──
	deleteMessage(id: string): void { this.messageEditor.deleteMessage(id); }
	editMessage(id: string, newText: string): void { this.messageEditor.editMessage(id, newText); }

	/** 编辑消息后删除后续消息并重新生成 AI 回复 */
	async editAndRegenerate(id: string, newText: string, modelKey: string): Promise<void> {
		this.messageRepo.truncateAfterMessageId(id);
		this.messageRepo.deleteMessage(id);
		this.notifyMessagesChanged();
		await this.sendMessage(newText, modelKey);
	}

	async regenerateLastMessage(modelKey: string): Promise<void> {
		const userMsg = this.messageEditor.prepareRegenerate();
		if (userMsg) await this.sendMessage(userMsg, modelKey);
	}

	async executeCommand(commandTitle: string, modelKey: string, vars?: { selection?: string; activeNote?: string; input?: string }): Promise<void> {
		const processed = await this.messageEditor.resolveCommand(commandTitle, vars);
		if (processed) await this.sendMessage(processed, modelKey);
	}

	private notifyMessagesChanged(): void {
		this.callbacks?.onMessagesChanged(this.messageRepo.getDisplayMessages());
	}
}
