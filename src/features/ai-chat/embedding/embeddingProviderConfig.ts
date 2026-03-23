import { EmbeddingProvider } from "../types";

/**
 * 嵌入 provider 配置 — 定义各 provider 的 API 调用方式。
 */
export interface EmbeddingProviderConfig {
	label: string;
	defaultModel: string;
	requiresKey: boolean;
	defaultBaseUrl?: string;
}

export const EMBEDDING_PROVIDER_CONFIGS: Record<EmbeddingProvider, EmbeddingProviderConfig> = {
	[EmbeddingProvider.OPENAI]: {
		label: "OpenAI",
		defaultModel: "text-embedding-3-small",
		requiresKey: true,
	},
	[EmbeddingProvider.COHERE]: {
		label: "Cohere",
		defaultModel: "embed-multilingual-v3.0",
		requiresKey: true,
	},
	[EmbeddingProvider.GOOGLE]: {
		label: "Google",
		defaultModel: "text-embedding-004",
		requiresKey: true,
	},
	[EmbeddingProvider.OPENAI_FORMAT]: {
		label: "自定义 (OpenAI 兼容)",
		defaultModel: "",
		requiresKey: false,
	},
};
