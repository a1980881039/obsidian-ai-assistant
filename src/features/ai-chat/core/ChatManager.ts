import type { App, TFile } from "obsidian";
import { ChatModelManager } from "../providers/chatModelManager";
import { ToolRegistry } from "../tools/ToolRegistry";
import { registerBuiltinTools } from "../tools/builtinTools";
import { createMemoryTools } from "../tools/memoryTool";
import { ProjectManager } from "../project/ProjectManager";
import { AgentChainRunner } from "../chain/AgentChainRunner";
import { MessageService } from "../services/MessageService";
import { ContextService } from "../services/ContextService";
import { IndexingService } from "../services/IndexingService";
import type { ChatEngineAPI } from "../ChatEngineAPI";
import { USER_SENDER, AI_SENDER, type AIChatSettings, type ChatMessage, type ReasoningStep, type ImageAttachment } from "../types";

export interface ChatManagerCallbacks {
	onMessagesChanged: (messages: ChatMessage[]) => void;
	onStreamingToken: (fullText: string) => void;
	onLoadingChanged: (loading: boolean) => void;
	onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
	onToolResult?: (toolName: string, result: string) => void;
	onReasoningStep?: (step: ReasoningStep) => void;
}

/**
 * 聊天业务协调器 — 通过服务层组合消息、上下文、模型、索引。
 * 实现 ChatEngineAPI 以供外部 Feature 访问。
 */
export class ChatManager implements ChatEngineAPI {
	// ── 服务层 ──
	private readonly messageService: MessageService;
	private readonly contextService: ContextService;
	private readonly indexingService: IndexingService;

	// ── 直接持有（简单到不需要额外 Service 封装） ──
	readonly chatModelManager: ChatModelManager;
	readonly toolRegistry: ToolRegistry;
	readonly projectManager: ProjectManager;

	// ── 暴露给 View 层的只读子管理器（委托到服务） ──
	get systemPromptManager() { return this.contextService.systemPromptManager; }
	get customCommandManager() { return this.contextService.customCommandManager; }
	get userMemoryManager() { return this.contextService.userMemoryManager; }
	get vaultIndexer() { return this.indexingService.vaultIndexer; }
	get embeddingManager() { return this.indexingService.embeddingManager; }
	get retriever() { return this.indexingService.retriever; }
	get messageRepo() { return this.messageService.messageRepo; }
	get persistence() { return this.messageService.persistence; }

	private app: App;
	private settings: AIChatSettings;
	private callbacks: ChatManagerCallbacks | null = null;
	private abortController: AbortController | null = null;

	constructor(app: App, settings: AIChatSettings) {
		this.app = app;
		this.settings = settings;

		// 初始化服务层
		this.contextService = new ContextService(app, settings);
		this.messageService = new MessageService(
			app, settings, this.contextService.customCommandManager,
			() => this.notifyMessagesChanged(),
		);
		this.indexingService = new IndexingService(app, settings);

		// 直接持有的简单模块
		this.chatModelManager = new ChatModelManager(settings);
		this.toolRegistry = new ToolRegistry();
		this.projectManager = new ProjectManager(app);

		// 注册工具
		registerBuiltinTools(this.toolRegistry, app, () => this.settings.tavilyApiKey);
		for (const t of createMemoryTools(this.contextService.userMemoryManager)) {
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
		this.contextService.updateSettings(settings);
		this.indexingService.updateSettings(settings);
		this.messageService.updateSettings(settings);
		this.toolRegistry.syncEnabledState(settings.enabledTools);
	}

	getDisplayMessages(): ChatMessage[] { return this.messageService.getDisplayMessages(); }
	getSettings(): AIChatSettings { return this.settings; }

	/** 索引笔记库 */
	async indexVault(): Promise<number> {
		return this.indexingService.indexVault(this.settings.embeddingApiKey);
	}

	/** 发送消息 — 核心编排方法 */
	async sendMessage(text: string, modelKey: string, contextItems?: { path: string; displayName: string; type: string; selectionContent?: string }[], images?: ImageAttachment[]): Promise<void> {
		if (!text.trim() || this.abortController) return;

		// 1. 构建上下文
		const context = await this.contextService.buildContext(text, images, contextItems as any);
		const contextPrompt = this.contextService.formatContextForPrompt(context);

		// 2. 记录用户消息
		this.messageService.addUserMessage(text, contextItems, images);
		this.callbacks?.onLoadingChanged(true);

		// 3. 初始化模型
		try {
			await this.chatModelManager.initModel(modelKey);
		} catch (err: unknown) {
			this.messageService.addAIMessage(
				err instanceof Error ? err.message : String(err),
				{ isErrorMessage: true },
			);
			this.callbacks?.onLoadingChanged(false);
			return;
		}

		// 4. Auto-compact
		await this.messageService.autoCompactIfNeeded(
			this.settings.autoCompactThreshold,
			this.chatModelManager.getChatModel(),
		);

		// 5. 构建系统提示词
		this.abortController = new AbortController();
		const systemPrompt = await this.contextService.buildFullSystemPrompt(
			this.projectManager,
			this.settings.activeSystemPromptTitle,
		);

		// 6. 运行 Agent 链
		const runner = new AgentChainRunner(
			this.chatModelManager, this.messageService.messageRepo, this.settings,
			this.toolRegistry, contextPrompt, systemPrompt, images,
		);

		await runner.run(text, {
			onToken: (fullText: string) => { this.callbacks?.onStreamingToken(fullText); },
			onComplete: async (msg: ChatMessage) => {
				this.callbacks?.onStreamingToken("");
				this.messageService.addAIMessage(msg.message, {
					reasoningSteps: msg.reasoningSteps,
					citations: msg.citations,
				});
				this.callbacks?.onLoadingChanged(false);
				this.abortController = null;
				this.messageService.scheduleAutoSave(modelKey);

				if (this.messageService.shouldGenerateTitle()) {
					this.autoGenerateTitle(modelKey).catch(() => {});
				}
			},
			onError: (error: Error) => {
				this.callbacks?.onStreamingToken("");
				this.messageService.addAIMessage(error.message, { isErrorMessage: true });
				this.callbacks?.onLoadingChanged(false);
				this.abortController = null;
			},
		}, this.abortController);
	}

	stopGeneration(): void {
		if (this.abortController) { this.abortController.abort(); this.abortController = null; }
	}

	destroy(): void {
		this.stopGeneration();
		this.messageService.destroy();
	}

	// ── 委托给 MessageService ──
	async newChat(): Promise<void> { return this.messageService.newChat(); }
	async saveCurrentChat(modelKey: string): Promise<void> { return this.messageService.saveCurrentChat(modelKey); }
	async loadChat(file: TFile): Promise<string> { return this.messageService.loadChat(file); }
	async getChatHistory(sort?: "recent" | "created" | "name", page?: number, pageSize?: number) { return this.messageService.getChatHistory(sort, page, pageSize); }
	async deleteChatHistory(file: TFile): Promise<void> { return this.messageService.deleteChatHistory(file); }
	async renameChatHistory(file: TFile, newTopic: string): Promise<void> { return this.messageService.renameChatHistory(file, newTopic); }

	async generateTitleForChat(file: TFile): Promise<string> {
		const chatData = await this.messageService.persistence.loadChat(file);
		if (!chatData || chatData.messages.length === 0) return "新对话";

		try {
			await this.chatModelManager.initModel(chatData.modelKey);
			const chatModel = this.chatModelManager.getChatModel();
			const invoke = async (prompt: string) => {
				const result = await chatModel.invoke(prompt);
				return typeof result.content === "string" ? result.content : String(result.content);
			};
			return await this.messageService.generateTitle(chatData.messages, invoke);
		} catch {
			const firstUser = chatData.messages.find(m => m.sender === "user");
			return firstUser?.message.slice(0, 40).trim() || "新对话";
		}
	}

	private async autoGenerateTitle(modelKey: string): Promise<void> {
		await new Promise(r => setTimeout(r, 2000));

		const file = this.messageService.getCurrentChatFile();
		if (!file) return;

		const messages = this.messageService.getDisplayMessages();
		if (messages.length < 2) return;

		try {
			const chatModel = this.chatModelManager.getChatModel();
			const invoke = async (prompt: string) => {
				const result = await chatModel.invoke(prompt);
				return typeof result.content === "string" ? result.content : String(result.content);
			};
			const title = await this.messageService.generateTitle(messages, invoke);
			if (title && title !== "新对话") {
				await this.messageService.persistence.renameChat(file, title);
				this.messageService.persistence.invalidateCache();
			}
		} catch { /* title generation failed silently */ }
	}

	// ── 委托给 MessageEditor ──
	deleteMessage(id: string): void { this.messageService.deleteMessage(id); }
	editMessage(id: string, newText: string): void { this.messageService.editMessage(id, newText); }

	async editAndRegenerate(id: string, newText: string, modelKey: string): Promise<void> {
		this.messageService.truncateAfterAndDelete(id);
		await this.sendMessage(newText, modelKey);
	}

	async regenerateLastMessage(modelKey: string): Promise<void> {
		const userMsg = this.messageService.prepareRegenerate();
		if (userMsg) await this.sendMessage(userMsg, modelKey);
	}

	async executeCommand(commandTitle: string, modelKey: string, vars?: { selection?: string; activeNote?: string; input?: string }): Promise<void> {
		const processed = await this.messageService.resolveCommand(commandTitle, vars);
		if (processed) await this.sendMessage(processed, modelKey);
	}

	private notifyMessagesChanged(): void {
		this.callbacks?.onMessagesChanged(this.messageService.getDisplayMessages());
	}
}
