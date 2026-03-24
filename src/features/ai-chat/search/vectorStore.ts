import { create, insert, search, remove, save, load, type AnyOrama } from "@orama/orama";
import type { App } from "obsidian";
import { AI_ROOT_FOLDER, AI_DATA_FOLDER } from "../constants";

const INDEX_PATH = `${AI_DATA_FOLDER}/vector-index.json`;

export interface VectorDoc {
	id: string;
	path: string;
	title: string;
	content: string;
	embedding: number[];
	chunkIndex: number;
	tags: string;
}

export interface VectorSearchResult {
	path: string;
	title: string;
	content: string;
	score: number;
	chunkIndex: number;
}

/**
 * Orama 向量存储封装 — 管理向量索引的创建、搜索、持久化。
 */
export class VectorStore {
	private db: AnyOrama | null = null;
	private app: App;
	private dimensions: number;

	constructor(app: App, dimensions: number = 1536) {
		this.app = app;
		this.dimensions = dimensions;
	}

	async initialize(): Promise<void> {
		this.db = await create({
			schema: {
				id: "string",
				path: "string",
				title: "string",
				content: "string",
				embedding: `vector[${this.dimensions}]`,
				chunkIndex: "number",
				tags: "string",
			} as any,
		});
	}
	/** 添加文档 */
	async addDocument(doc: VectorDoc): Promise<void> {
		if (!this.db) await this.initialize();
		await insert(this.db!, doc as any);
	}

	/** 批量添加 */
	async addDocuments(docs: VectorDoc[]): Promise<void> {
		if (!this.db) await this.initialize();
		for (const doc of docs) {
			await insert(this.db!, doc as any);
		}
	}

	/** 删除路径下所有 chunks */
	async removeByPath(path: string): Promise<void> {
		if (!this.db) return;
		// 搜索该路径的所有文档并删除
		const results = await search(this.db, {
			term: path,
			properties: ["path"],
			limit: 1000,
		});
		for (const hit of results.hits) {
			await remove(this.db, hit.id as string);
		}
	}

	/** 向量相似度搜索 */
	async searchSimilar(queryEmbedding: number[], maxResults: number = 10): Promise<VectorSearchResult[]> {
		if (!this.db) return [];
		const results = await search(this.db, {
			mode: "vector",
			vector: { value: queryEmbedding, property: "embedding" },
			limit: maxResults,
			similarity: 0.3,
		} as any);

		return results.hits.map((hit: any) => ({
			path: hit.document.path,
			title: hit.document.title,
			content: hit.document.content,
			score: hit.score,
			chunkIndex: hit.document.chunkIndex,
		}));
	}

	/** 持久化到 vault */
	async persist(): Promise<void> {
		if (!this.db) return;
		try {
			const data = await save(this.db);
			const json = JSON.stringify(data);
			const folder = this.app.vault.getAbstractFileByPath(AI_DATA_FOLDER);
			if (!folder) {
				if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
					await this.app.vault.createFolder(AI_ROOT_FOLDER);
				}
				await this.app.vault.createFolder(AI_DATA_FOLDER);
			}
			const file = this.app.vault.getAbstractFileByPath(INDEX_PATH);
			if (file && "stat" in file) {
				await this.app.vault.modify(file as any, json);
			} else {
				await this.app.vault.create(INDEX_PATH, json);
			}
		} catch (e) {
			console.warn("[AI Chat] 向量索引持久化失败:", e);
		}
	}

	/** 从 vault 加载 */
	async loadFromDisk(): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(INDEX_PATH);
			if (!file || !("stat" in file)) return false;
			const raw = await this.app.vault.read(file as any);
			const data = JSON.parse(raw);
			await this.initialize();
			load(this.db!, data);
			return this.getDocCount() > 0;
		} catch {
			return false;
		}
	}

	/** 清空索引 */
	async clear(): Promise<void> {
		await this.initialize();
	}

	getDocCount(): number {
		return this.db ? (this.db as any).data?.docs?.count ?? 0 : 0;
	}
}
