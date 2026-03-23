import type { App, TFile } from "obsidian";
import MiniSearch from "minisearch";

export interface IndexedNote {
	id: string;
	path: string;
	title: string;
	content: string;
	tags: string[];
	mtime: number;
}

export interface SearchResult {
	path: string;
	title: string;
	content: string;
	score: number;
	tags: string[];
}

/**
 * 笔记库索引管理器 — 使用 MiniSearch 进行 BM25 全文检索。
 */
export class IndexManager {
	private index: MiniSearch<IndexedNote>;
	private noteMap = new Map<string, IndexedNote>();
	private isIndexing = false;

	constructor(private app: App) {
		this.index = this.createIndex();
	}

	private createIndex(): MiniSearch<IndexedNote> {
		return new MiniSearch<IndexedNote>({
			fields: ["title", "content", "tags"],
			storeFields: ["path", "title", "content", "tags"],
			searchOptions: {
				boost: { title: 5, tags: 3, content: 1 },
				fuzzy: 0.2,
				prefix: true,
			},
		});
	}

	/** 索引整个笔记库 */
	async indexVault(): Promise<number> {
		if (this.isIndexing) return 0;
		this.isIndexing = true;

		try {
			this.index = this.createIndex();
			this.noteMap.clear();

			const files = this.app.vault.getMarkdownFiles();
			const docs: IndexedNote[] = [];

			for (const file of files) {
				const doc = await this.indexFile(file);
				if (doc) docs.push(doc);
			}

			if (docs.length > 0) {
				this.index.addAll(docs);
			}

			return docs.length;
		} finally {
			this.isIndexing = false;
		}
	}
	private async indexFile(file: TFile): Promise<IndexedNote | null> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = (cache?.tags?.map((t) => t.tag) || [])
				.concat(cache?.frontmatter?.tags || []);

			const doc: IndexedNote = {
				id: file.path,
				path: file.path,
				title: file.basename,
				content: content.slice(0, 10000), // Limit content size
				tags,
				mtime: file.stat.mtime,
			};

			this.noteMap.set(file.path, doc);
			return doc;
		} catch {
			return null;
		}
	}

	/** 增量更新单个文件 */
	async updateFile(file: TFile): Promise<void> {
		// Remove old entry
		if (this.noteMap.has(file.path)) {
			this.index.discard(file.path);
			this.noteMap.delete(file.path);
		}

		const doc = await this.indexFile(file);
		if (doc) {
			this.index.add(doc);
		}
	}

	/** 删除文件索引 */
	removeFile(path: string): void {
		if (this.noteMap.has(path)) {
			this.index.discard(path);
			this.noteMap.delete(path);
		}
	}

	/** 搜索笔记 */
	search(query: string, maxResults: number = 10): SearchResult[] {
		if (!query.trim()) return [];

		const results = this.index.search(query).slice(0, maxResults);
		return results.map((r) => ({
			path: r.path as string,
			title: r.title as string,
			content: (r.content as string || "").slice(0, 2000),
			score: r.score,
			tags: r.tags as string[] || [],
		}));
	}

	/** 获取索引的笔记数量 */
	getIndexedCount(): number {
		return this.noteMap.size;
	}

	/** 是否正在索引 */
	getIsIndexing(): boolean {
		return this.isIndexing;
	}

	/** 清空索引 */
	clear(): void {
		this.index = this.createIndex();
		this.noteMap.clear();
	}
}
