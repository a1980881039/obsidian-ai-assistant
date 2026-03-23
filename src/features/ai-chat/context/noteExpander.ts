import type { App } from "obsidian";

const MAX_DEPTH = 3;

/**
 * 递归展开 ![[note]] / ![[note#heading]] / ![[note^blockid]] 嵌入。
 * 最大深度 3，循环引用检测。
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
