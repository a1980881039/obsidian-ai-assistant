/**
 * IndexingService — 嵌入、索引、检索。
 * 封装 EmbeddingManager、VaultIndexer、HybridRetriever。
 */

import type { App } from "obsidian";
import { EmbeddingManager } from "../embedding/EmbeddingManager";
import { VaultIndexer } from "../search/VaultIndexer";
import { HybridRetriever } from "../search/hybridRetriever";
import type { AIChatSettings } from "../types";

export class IndexingService {
	readonly embeddingManager: EmbeddingManager;
	readonly vaultIndexer: VaultIndexer;
	readonly retriever: HybridRetriever;

	constructor(app: App, settings: AIChatSettings) {
		this.embeddingManager = new EmbeddingManager(settings);
		this.vaultIndexer = new VaultIndexer(app, this.embeddingManager, settings);
		this.retriever = new HybridRetriever(app);
		this.retriever.setVaultIndexer(this.vaultIndexer);
	}

	/** 全库索引（BM25 + 向量） */
	async indexVault(embeddingApiKey: string): Promise<number> {
		const bm25Count = await this.retriever.indexVault();
		if (embeddingApiKey) {
			try { await this.vaultIndexer.indexVault(); } catch { /* 降级为纯 BM25 */ }
		}
		return bm25Count;
	}

	// ── 设置更新 ──

	updateSettings(settings: AIChatSettings): void {
		this.embeddingManager.updateSettings(settings);
		this.vaultIndexer.updateSettings(settings);
	}
}
