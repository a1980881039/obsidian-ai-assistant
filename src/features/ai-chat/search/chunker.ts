/**
 * 递归字符分割器 — 按段落→句子→词边界切分文本为 chunks。
 */
export interface ChunkOptions {
	chunkSize: number;
	chunkOverlap: number;
}

export interface TextChunk {
	text: string;
	index: number;
}

const SEPARATORS = ["\n\n", "\n", "。", ".", "！", "!", "？", "?", "；", ";", " "];

/**
 * 递归字符分割：尝试按最大分隔符切分，递归处理过长片段。
 */
export function splitText(text: string, opts: ChunkOptions): TextChunk[] {
	const { chunkSize, chunkOverlap } = opts;
	if (!text.trim()) return [];

	const chunks: string[] = [];
	recursiveSplit(text, SEPARATORS, chunkSize, chunks);

	// 合并过短的 chunks 并添加 overlap
	const merged = mergeWithOverlap(chunks, chunkSize, chunkOverlap);
	return merged.map((t, i) => ({ text: t, index: i }));
}

function recursiveSplit(text: string, separators: string[], chunkSize: number, result: string[]): void {
	if (text.length <= chunkSize) {
		if (text.trim()) result.push(text.trim());
		return;
	}

	// 找到能切分的最大分隔符
	for (const sep of separators) {
		if (!text.includes(sep)) continue;
		const parts = text.split(sep);
		let current = "";
		for (const part of parts) {
			const candidate = current ? current + sep + part : part;
			if (candidate.length > chunkSize && current) {
				if (current.trim()) result.push(current.trim());
				current = part;
			} else {
				current = candidate;
			}
		}
		if (current.trim()) {
			if (current.length > chunkSize) {
				// 用下一级分隔符继续切
				const nextSeps = separators.slice(separators.indexOf(sep) + 1);
				if (nextSeps.length > 0) {
					recursiveSplit(current, nextSeps, chunkSize, result);
				} else {
					// 硬切
					for (let i = 0; i < current.length; i += chunkSize) {
						const slice = current.slice(i, i + chunkSize).trim();
						if (slice) result.push(slice);
					}
				}
			} else {
				result.push(current.trim());
			}
		}
		return;
	}

	// 无分隔符可用，硬切
	for (let i = 0; i < text.length; i += chunkSize) {
		const slice = text.slice(i, i + chunkSize).trim();
		if (slice) result.push(slice);
	}
}

function mergeWithOverlap(chunks: string[], chunkSize: number, overlap: number): string[] {
	if (chunks.length <= 1) return chunks;
	const result: string[] = [];
	for (let i = 0; i < chunks.length; i++) {
		let chunk = chunks[i];
		// 添加前一个 chunk 的尾部作为 overlap
		if (i > 0 && overlap > 0) {
			const prev = chunks[i - 1];
			const overlapText = prev.slice(-overlap);
			chunk = overlapText + " " + chunk;
			if (chunk.length > chunkSize * 1.5) {
				chunk = chunk.slice(0, Math.round(chunkSize * 1.2));
			}
		}
		result.push(chunk);
	}
	return result;
}
