import type { App, TFile } from "obsidian";
import { IndexManager, type SearchResult } from "./indexManager";
import { isPathInScope, type PathScope } from "./pathFilter";
import type { VaultIndexer } from "./VaultIndexer";

export interface RetrievalResult {
	path: string;
	title: string;
	content: string;
	score: number;
	source: "search" | "mention" | "tag" | "vector";
}

/**
 * 混合检索器 — 结合 BM25 全文搜索、确定性匹配（标题、标签）和向量语义搜索。
 * 使用 RRF (Reciprocal Rank Fusion, k=60) 融合多路结果。
 */
export class HybridRetriever {
	private indexManager: IndexManager;
	private vaultIndexer: VaultIndexer | null = null;
	private scope: PathScope = { inclusions: [], exclusions: [] };

	constructor(private app: App) {
		this.indexManager = new IndexManager(app);
	}

	getIndexManager(): IndexManager {
		return this.indexManager;
	}

	setVaultIndexer(indexer: VaultIndexer): void {
		this.vaultIndexer = indexer;
	}

	/** 设置检索范围（项目级过滤） */
	setScope(inclusions: string[], exclusions: string[]): void {
		this.scope = { inclusions, exclusions };
	}

	/** 索引笔记库 */
	async indexVault(): Promise<number> {
		return this.indexManager.indexVault();
	}

	/** 混合检索 */
	async retrieve(query: string, maxResults: number = 10): Promise<RetrievalResult[]> {
		const results: RetrievalResult[] = [];
		const seenPaths = new Set<string>();

		// 1. 确定性匹配：提取 [[笔记名]] 引用
		const titleMatches = await this.extractTitleMatches(query);
		for (const match of titleMatches) {
			if (!seenPaths.has(match.path) && this.inScope(match.path)) {
				seenPaths.add(match.path);
				results.push({ ...match, score: 1.0, source: "mention" });
			}
		}
		// 2. 确定性匹配：提取 #标签
		const tagMatches = await this.extractTagMatches(query);
		for (const match of tagMatches) {
			if (!seenPaths.has(match.path) && this.inScope(match.path)) {
				seenPaths.add(match.path);
				results.push({ ...match, score: 0.9, source: "tag" });
			}
		}

		// 3. BM25 全文搜索
		const bm25Results = this.indexManager.search(query, maxResults * 2);
		const bm25Filtered = bm25Results.filter((sr) => this.inScope(sr.path));

		// 4. 向量语义搜索（如果可用）
		let vectorResults: RetrievalResult[] = [];
		if (this.vaultIndexer) {
			try {
				const vResults = await this.vaultIndexer.search(query, maxResults * 2);
				vectorResults = vResults
					.filter((vr) => this.inScope(vr.path))
					.map((vr) => ({
						path: vr.path,
						title: vr.title,
						content: vr.content,
						score: vr.score,
						source: "vector" as const,
					}));
			} catch {
				// 向量搜索失败，降级为纯 BM25
			}
		}

		// 5. RRF 融合 BM25 + 向量结果
		if (vectorResults.length > 0) {
			const fused = this.rrfFusion(bm25Filtered, vectorResults, 60);
			for (const item of fused) {
				if (!seenPaths.has(item.path)) {
					seenPaths.add(item.path);
					results.push(item);
				}
			}
		} else {
			// 无向量结果，直接用 BM25
			for (const sr of bm25Filtered) {
				if (!seenPaths.has(sr.path)) {
					seenPaths.add(sr.path);
					results.push({ ...sr, source: "search" });
				}
			}
		}

		return results.slice(0, maxResults);
	}

	/** RRF (Reciprocal Rank Fusion) 融合两路排序结果 */
	private rrfFusion(
		bm25: SearchResult[],
		vector: RetrievalResult[],
		k: number = 60,
	): RetrievalResult[] {
		const scoreMap = new Map<string, { result: RetrievalResult; score: number }>();

		// BM25 排名分数
		bm25.forEach((item, rank) => {
			const rrfScore = 1 / (k + rank + 1);
			const existing = scoreMap.get(item.path);
			const result: RetrievalResult = { ...item, source: "search" };
			if (existing) {
				existing.score += rrfScore;
			} else {
				scoreMap.set(item.path, { result, score: rrfScore });
			}
		});

		// 向量排名分数
		vector.forEach((item, rank) => {
			const rrfScore = 1 / (k + rank + 1);
			const existing = scoreMap.get(item.path);
			if (existing) {
				existing.score += rrfScore;
				existing.result.source = "vector"; // 标记为混合来源
			} else {
				scoreMap.set(item.path, { result: item, score: rrfScore });
			}
		});

		return Array.from(scoreMap.values())
			.sort((a, b) => b.score - a.score)
			.map(({ result, score }) => ({ ...result, score }));
	}

	/** 格式化检索结果为 LLM 上下文 */
	formatForLLM(results: RetrievalResult[]): string {
		if (results.length === 0) return "";

		const parts = results.map((r) =>
			`<retrieved_note path="${r.path}" title="${r.title}" score="${r.score.toFixed(2)}" source="${r.source}">\n${r.content}\n</retrieved_note>`
		);

		return `以下是从笔记库中检索到的相关笔记：\n\n${parts.join("\n\n")}`;
	}

	/** 检查路径是否在检索范围内 */
	private inScope(path: string): boolean {
		return isPathInScope(path, this.scope);
	}

	private async extractTitleMatches(query: string): Promise<Array<{ path: string; title: string; content: string }>> {
		const regex = /\[\[([^\]]+)\]\]/g;
		const results: Array<{ path: string; title: string; content: string }> = [];
		let match: RegExpExecArray | null;

		while ((match = regex.exec(query)) !== null) {
			const noteName = match[1].trim();
			const file = this.app.metadataCache.getFirstLinkpathDest(noteName, "");
			if (file) {
				const content = await this.app.vault.cachedRead(file);
				results.push({
					path: file.path,
					title: file.basename,
					content: content.slice(0, 2000),
				});
			}
		}
		return results;
	}

	private async extractTagMatches(query: string): Promise<Array<{ path: string; title: string; content: string }>> {
		const tagRegex = /#([\w\u4e00-\u9fff/-]+)/g;
		const results: Array<{ path: string; title: string; content: string }> = [];
		const seenPaths = new Set<string>();
		let match: RegExpExecArray | null;

		while ((match = tagRegex.exec(query)) !== null) {
			const tag = match[1];
			const normalizedTag = tag.toLowerCase();

			// 利用 metadataCache 遍历所有文件缓存，而非只扫描前 100 个文件
			const allFiles = this.app.vault.getMarkdownFiles();
			for (const file of allFiles) {
				if (results.length >= 5) break;
				if (seenPaths.has(file.path)) continue;

				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache) continue;

				const fileTags = cache.tags?.map((t) => t.tag.replace(/^#/, "")) ?? [];
				const fmTags: string[] = cache.frontmatter?.tags ?? [];
				const allTags = [...fileTags, ...fmTags];

				if (allTags.some((t) => t === normalizedTag || t.toLowerCase() === normalizedTag || t.startsWith(tag + "/") || t.toLowerCase().startsWith(normalizedTag + "/"))) {
					seenPaths.add(file.path);
					const content = await this.app.vault.cachedRead(file);
					results.push({
						path: file.path,
						title: file.basename,
						content: content.slice(0, 2000),
					});
				}
			}
			if (results.length >= 5) break;
		}
		return results;
	}
}
