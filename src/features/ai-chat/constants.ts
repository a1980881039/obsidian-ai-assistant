import { ChatModelProvider, EmbeddingProvider, type AIChatSettings, type CustomModel } from "./types";

export const DEFAULT_SYSTEM_PROMPT =
	"You are a helpful assistant integrated into Obsidian, a note-taking application. " +
	"Answer questions concisely and helpfully. When appropriate, format your responses using Markdown.";

export const BUILTIN_CHAT_MODELS: CustomModel[] = [];

// ── 文件/文件夹路径常量 ──
export const AI_ROOT_FOLDER = "Super Enhance";
export const CHAT_FOLDER = `${AI_ROOT_FOLDER}/AI Chats`;
export const AI_DATA_FOLDER = `${AI_ROOT_FOLDER}/AI Data`;
export const MEMORY_FILE = "AI Memory.md";
export const PROJECTS_FILE = `${AI_DATA_FOLDER}/projects.json`;

// ── 工具函数 ──
export function generateMessageId(): string {
	return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const DEFAULT_AI_CHAT_SETTINGS: AIChatSettings = {
	enabled: true,

	// ── New: Provider + ModelConfig ──
	providers: [],
	modelConfigs: [],
	defaultModelId: null,

	// ── Legacy ──
	activeModels: [],
	contextTurns: 10,

	systemPromptsFolder: `${AI_ROOT_FOLDER}/AI System Prompts`,
	customCommandsFolder: `${AI_ROOT_FOLDER}/AI Custom Commands`,
	activeSystemPromptTitle: "",

	// Embedding (Phase 1)
	embeddingProvider: EmbeddingProvider.OPENAI,
	embeddingModel: "text-embedding-3-small",
	embeddingApiKey: "",
	embeddingBaseUrl: "",
	chunkSize: 1000,
	chunkOverlap: 200,
	indexBatchSize: 50,
	qaExclusionPaths: "",
	qaInclusionPaths: "",
	enableAutoIndex: true,

	// Agent (Phase 2)
	tavilyApiKey: "",
	agentMaxIterations: 10,
	agentToolTimeout: 30000,
	enabledTools: {},

	// Chat settings
	autosaveEnabled: true,
	autoCompactThreshold: 128000,

	// History (Phase 11)
	chatHistorySortStrategy: "recent",
};

export const VIEW_TYPE_AI_CHAT = "ai-chat-view";
