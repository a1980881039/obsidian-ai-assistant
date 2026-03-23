import type { App } from "obsidian";

const MAX_FILES = 20;
const MAX_CHARS_PER_FILE = 2000;

/**
 * 构建文件夹上下文 — 列出 md 文件，每文件截断 2000 字符，最多 20 文件。
 */
export async function buildFolderContext(app: App, folderPath: string): Promise<string> {
	const folder = app.vault.getAbstractFileByPath(folderPath);
	if (!folder || !("children" in folder)) return `[Folder not found: ${folderPath}]`;

	const files = app.vault.getMarkdownFiles()
		.filter(f => f.path.startsWith(folderPath + "/"))
		.slice(0, MAX_FILES);

	if (files.length === 0) return `[No markdown files in ${folderPath}]`;

	const parts: string[] = [`Folder: ${folderPath} (${files.length} files)`];

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const truncated = content.length > MAX_CHARS_PER_FILE
			? content.slice(0, MAX_CHARS_PER_FILE) + "\n...[truncated]"
			: content;
		parts.push(`--- ${file.path} ---\n${truncated}`);
	}

	return parts.join("\n\n");
}
