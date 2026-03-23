import type { App, TFile } from "obsidian";
import type { EmbeddingManager } from "../embedding/EmbeddingManager";
import { VectorStore, type VectorDoc } from "./vectorStore";
import { splitText } from "./chunker";
import { parsePaths, isPathInScope } from "./pathFilter";
import type { AIChatSettings } from "../types";

/**
 * 全库索引编排器 — 批量嵌入、增量更新、vault 事件监听自动索引。
 */
export class VaultIndexer {
	private app: App;
	private embeddingManager: EmbeddingManager;
	private vectorStore: VectorStore;
	private settings: AIChatSettings;
	private isIndexing = false;
	private indexedPaths = new Set<string>();

	constructor(app: App, embeddingManager: EmbeddingManager, settings: AIChatSettings) {
		this.app = app;
		this.embeddingManager = embeddingManager;
		this.settings = settings;
		this.vectorStore = new VectorStore(app);
	}

	getVectorStore(): VectorStore {
		return this.vectorStore;
	}

	getIsIndexing(): boolean {
		return this.isIndexing;
	}

	getIndexedCount(): number {
		return this.indexedPaths.size;
	}

	updateSettings(settings: AIChatSettings): void {
		this.settings = settings;
	}

	/** 全库索引 */
	async indexVault(onProgress?: (current: number, total: number) => void): Promise<number> {
		if (this.isIndexing) return 0;
		this.isIndexing = true;

		try {
			// 先尝试嵌入一条测试文本获取维度
			const testEmb = await this.embeddingManager.embed("test");
			const dims = testEmb.length;
			this.vectorStore = new VectorStore(this.app, dims);
			await this.vectorStore.initialize();
			this.indexedPaths.clear();

			const files = this.getFilteredFiles();
			const total = files.length;
			let processed = 0;

			// 批量处理
			const batchSize = this.settings.indexBatchSize || 50;
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize);
				await this.indexBatch(batch);
				processed += batch.length;
				onProgress?.(processed, total);
			}

			await this.vectorStore.persist();
			return this.indexedPaths.size;
		} finally {
			this.isIndexing = false;
		}
	}
	/** 增量更新单个文件 */
	async updateFile(file: TFile): Promise<void> {
		if (!this.shouldIndex(file)) return;
		try {
			await this.vectorStore.removeByPath(file.path);
			this.indexedPaths.delete(file.path);
			await this.indexBatch([file]);
			await this.vectorStore.persist();
		} catch {
			// 单文件更新失败不阻塞
		}
	}

	/** 删除文件索引 */
	async removeFile(path: string): Promise<void> {
		await this.vectorStore.removeByPath(path);
		this.indexedPaths.delete(path);
	}

	/** 向量搜索 */
	async search(query: string, maxResults: number = 10) {
		const queryEmbedding = await this.embeddingManager.embed(query);
		return this.vectorStore.searchSimilar(queryEmbedding, maxResults);
	}

	private async indexBatch(files: TFile[]): Promise<void> {
		const allChunks: Array<{ file: TFile; text: string; chunkIndex: number; tags: string[] }> = [];

		const fileResults = await Promise.all(files.map(async (file) => {
			try {
				const content = await this.app.vault.cachedRead(file);
				const cache = this.app.metadataCache.getFileCache(file);
				const tags = (cache?.tags?.map((t) => t.tag) || [])
					.concat(cache?.frontmatter?.tags || []);

				const chunks = splitText(content, {
					chunkSize: this.settings.chunkSize,
					chunkOverlap: this.settings.chunkOverlap,
				});

				return chunks.map((chunk) => ({ file, text: chunk.text, chunkIndex: chunk.index, tags }));
			} catch {
				return [];
			}
		}));

		for (const chunks of fileResults) {
			allChunks.push(...chunks);
		}

		if (allChunks.length === 0) return;

		// 批量嵌入
		const texts = allChunks.map((c) => c.text);
		const embeddings = await this.embeddingManager.embedBatch(texts);

		// 写入向量存储
		const docs: VectorDoc[] = allChunks.map((c, i) => ({
			id: `${c.file.path}#${c.chunkIndex}`,
			path: c.file.path,
			title: c.file.basename,
			content: c.text,
			embedding: embeddings[i],
			chunkIndex: c.chunkIndex,
			tags: c.tags.join(","),
		}));

		await this.vectorStore.addDocuments(docs);
		for (const file of files) {
			this.indexedPaths.add(file.path);
		}
	}

	private getScope() {
		return {
			inclusions: parsePaths(this.settings.qaInclusionPaths),
			exclusions: parsePaths(this.settings.qaExclusionPaths),
		};
	}

	private getFilteredFiles(): TFile[] {
		const scope = this.getScope();
		return this.app.vault.getMarkdownFiles()
			.filter((f) => isPathInScope(f.path, scope));
	}

	private shouldIndex(file: TFile): boolean {
		return file.extension === "md" && isPathInScope(file.path, this.getScope());
	}
}
