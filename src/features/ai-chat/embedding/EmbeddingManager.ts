import { EmbeddingProvider, type AIChatSettings } from "../types";
import { decryptKey } from "../providers/encryptionService";
import { requestUrl } from "obsidian";

/**
 * 嵌入模型管理器 — 统一封装 OpenAI/Ollama/Cohere/Google/OpenAI-compatible 嵌入 API。
 * 不依赖 LangChain Embeddings，直接调用 REST API 以减少依赖。
 */
export class EmbeddingManager {
	private settings: AIChatSettings;
	private dimensions: number | undefined;

	constructor(settings: AIChatSettings) {
		this.settings = settings;
	}

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
	}

	getDimensions(): number | undefined {
		return this.dimensions;
	}

	/** 嵌入单条文本 */
	async embed(text: string): Promise<number[]> {
		const results = await this.embedBatch([text]);
		return results[0];
	}

	/** 批量嵌入 */
	async embedBatch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const provider = this.settings.embeddingProvider;
		const model = this.settings.embeddingModel;
		const apiKey = this.settings.embeddingApiKey
			? await decryptKey(this.settings.embeddingApiKey)
			: "";

		switch (provider) {
			case EmbeddingProvider.OPENAI:
			case EmbeddingProvider.OPENAI_FORMAT:
				return this.embedOpenAI(texts, model, apiKey);
			case EmbeddingProvider.COHERE:
				return this.embedCohere(texts, model, apiKey);
			case EmbeddingProvider.GOOGLE:
				return this.embedGoogle(texts, model, apiKey);
			default:
				throw new Error(`Unsupported embedding provider: ${provider}`);
		}
	}
	private async embedOpenAI(texts: string[], model: string, apiKey: string): Promise<number[][]> {
		const baseUrl = this.settings.embeddingBaseUrl || "https://api.openai.com/v1";
		try {
			const resp = await requestUrl({
				url: `${baseUrl}/embeddings`,
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
				body: JSON.stringify({ model, input: texts }),
			});
			const data = resp.json;
			const embeddings: number[][] = data.data
				.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
				.map((d: { embedding: number[] }) => d.embedding);
			if (embeddings.length > 0) this.dimensions = embeddings[0].length;
			return embeddings;
		} catch (e) {
			throw new Error(`OpenAI embedding 请求失败: ${e instanceof Error ? e.message : e}`);
		}
	}

	private async embedCohere(texts: string[], model: string, apiKey: string): Promise<number[][]> {
		try {
			const resp = await requestUrl({
				url: "https://api.cohere.ai/v1/embed",
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
				body: JSON.stringify({ model, texts, input_type: "search_document", truncate: "END" }),
			});
			const embeddings: number[][] = resp.json.embeddings;
			if (embeddings.length > 0) this.dimensions = embeddings[0].length;
			return embeddings;
		} catch (e) {
			throw new Error(`Cohere embedding 请求失败: ${e instanceof Error ? e.message : e}`);
		}
	}

	private async embedGoogle(texts: string[], model: string, apiKey: string): Promise<number[][]> {
		const results: number[][] = [];
		try {
			await Promise.all(texts.map(async (text) => {
				const resp = await requestUrl({
					url: `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent?key=${apiKey}`,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ content: { parts: [{ text }] } }),
				});
				results.push(resp.json.embedding.values);
			}));
		} catch (e) {
			throw new Error(`Google embedding 请求失败: ${e instanceof Error ? e.message : e}`);
		}
		if (results.length > 0) this.dimensions = results[0].length;
		return results;
	}
}
