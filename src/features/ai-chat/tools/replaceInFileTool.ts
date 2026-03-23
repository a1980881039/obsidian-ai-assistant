import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { App, TFile } from "obsidian";
import type { ToolDefInput } from "./ToolRegistry";

/**
 * 文件块级替换工具 — SEARCH/REPLACE 模式，避免全量覆盖。
 */
export function createReplaceInFileTool(app: App): ToolDefInput {
	const schema = z.object({
		path: z.string().describe("The file path, e.g. 'folder/note.md'"),
		search: z.string().describe("The exact text to search for in the file"),
		replace: z.string().describe("The text to replace it with"),
	});

	const tool = new DynamicStructuredTool({
		name: "replace_in_file",
		description: "Replace a specific text block in a file. Use this instead of write_note when you only need to change part of a file. The search text must match exactly.",
		schema,
		func: async ({ path, search, replace }: { path: string; search: string; replace: string }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file || !("stat" in file)) return `File not found: ${path}`;

			const content = await app.vault.read(file as TFile);
			if (!content.includes(search)) {
				return `Search text not found in ${path}. Make sure the search text matches exactly (including whitespace and newlines).`;
			}

			const newContent = content.replace(search, replace);
			await app.vault.modify(file as TFile, newContent);
			return `Replaced text in ${path}`;
		},
	} as any);

	return { name: "replace_in_file", description: tool.description, tool };
}
