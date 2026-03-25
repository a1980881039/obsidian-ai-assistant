import type { App, TFile } from "obsidian";

const MAX_DEPTH = 3;

/** 不可作为文本读取的二进制/媒体文件扩展名 */
const BINARY_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "tif",
	"mp3", "wav", "ogg", "flac", "m4a", "aac",
	"mp4", "webm", "mkv", "avi", "mov",
	"pdf", "zip", "rar", "7z", "gz", "tar",
	"doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

/** 图片扩展名（占位符中区分 image vs generic file） */
const IMAGE_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "tif",
]);

function isBinaryFile(file: TFile): boolean {
	return BINARY_EXTENSIONS.has(file.extension.toLowerCase());
}

/**
 * 递归展开 ![[note]] / ![[note#heading]] / ![[note^blockid]] 嵌入。
 * 最大深度 3，循环引用检测。
 * 二进制文件（图片、PDF 等）不读取内容，替换为描述性占位符。
 */
export async function expandNoteContent(
	app: App,
	content: string,
	depth = 0,
	visited = new Set<string>(),
): Promise<string> {
	if (depth >= MAX_DEPTH) return content;

	const embedRegex = /!\[\[([^\]]+)\]\]/g;
	let result = content;
	let match: RegExpExecArray | null;
	const replacements: Array<{ full: string; replacement: string }> = [];

	// Reset regex
	embedRegex.lastIndex = 0;
	while ((match = embedRegex.exec(content)) !== null) {
		const ref = match[1].trim();
		const full = match[0];

		// Parse note#heading or note^blockid
		let noteName = ref;
		let heading = "";
		let blockId = "";
		if (ref.includes("^")) {
			[noteName, blockId] = ref.split("^", 2);
		} else if (ref.includes("#")) {
			[noteName, heading] = ref.split("#", 2);
		}

		if (visited.has(noteName)) {
			replacements.push({ full, replacement: `[circular: ${noteName}]` });
			continue;
		}

		const file = app.metadataCache.getFirstLinkpathDest(noteName, "");
		if (!file) {
			replacements.push({ full, replacement: full });
			continue;
		}

		// 二进制文件（图片、PDF 等）不读取内容，替换为描述性占位符（含完整路径供 AI 调工具读取）
		if (isBinaryFile(file)) {
			const isImage = IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
			const label = isImage ? "Embedded image" : "Embedded file";
			replacements.push({ full, replacement: `[${label}: ${file.name} (path: ${file.path})]` });
			continue;
		}

		visited.add(noteName);
		let noteContent = await app.vault.cachedRead(file);

		// Extract heading section
		if (heading) {
			noteContent = extractHeadingSection(noteContent, heading);
		} else if (blockId) {
			noteContent = extractBlock(noteContent, blockId);
		}

		// Recursively expand
		noteContent = await expandNoteContent(app, noteContent, depth + 1, new Set(visited));
		replacements.push({ full, replacement: noteContent });
	}

	for (const { full, replacement } of replacements) {
		result = result.replace(full, replacement);
	}
	return result;
}

function extractHeadingSection(content: string, heading: string): string {
	const lines = content.split("\n");
	let start = -1;
	let level = 0;

	for (let i = 0; i < lines.length; i++) {
		const hMatch = lines[i].match(/^(#{1,6})\s+(.+)/);
		if (hMatch && hMatch[2].trim() === heading) {
			start = i;
			level = hMatch[1].length;
			break;
		}
	}

	if (start < 0) return content;

	const result = [lines[start]];
	for (let i = start + 1; i < lines.length; i++) {
		const hMatch = lines[i].match(/^(#{1,6})\s/);
		if (hMatch && hMatch[1].length <= level) break;
		result.push(lines[i]);
	}
	return result.join("\n");
}

function extractBlock(content: string, blockId: string): string {
	const lines = content.split("\n");
	for (const line of lines) {
		if (line.includes(`^${blockId}`)) {
			return line.replace(`^${blockId}`, "").trim();
		}
	}
	return content;
}
