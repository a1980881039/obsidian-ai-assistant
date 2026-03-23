import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { App, TFile } from "obsidian";
import type { ToolDefInput, ToolRegistry } from "./ToolRegistry";
import { createWebSearchTool } from "./webSearchTool";
import { createReplaceInFileTool } from "./replaceInFileTool";
import { createYoutubeTranscriptTool } from "./youtubeTranscriptTool";
import { createFetchUrlTool } from "./fetchUrlTool";
import {
	createAppendToNoteTool,
	createDeleteNoteTool,
	createRenameNoteTool,
	createGetNotePropertiesTool,
	createUpdateNotePropertiesTool,
	createListFolderTool,
} from "./vaultTools";

/** 注册所有内置工具 */
export function registerBuiltinTools(
	registry: ToolRegistry,
	app: App,
	getTavilyKey?: () => string,
): void {
	// 笔记读写
	registry.register(createReadNoteTool(app));
	registry.register(createWriteNoteTool(app));
	registry.register(createAppendToNoteTool(app));
	registry.register(createReplaceInFileTool(app));
	registry.register(createDeleteNoteTool(app));
	registry.register(createRenameNoteTool(app));

	// 笔记属性
	registry.register(createGetNotePropertiesTool(app));
	registry.register(createUpdateNotePropertiesTool(app));

	// 搜索与浏览
	registry.register(createLocalSearchTool(app));
	registry.register(createGetFileTreeTool(app));
	registry.register(createListFolderTool(app));
	registry.register(createListTagsTool(app));

	// 网络与外部
	registry.register(createFetchUrlTool());
	registry.register(createWebSearchTool(getTavilyKey || (() => "")));
	registry.register(createYoutubeTranscriptTool());

	// 实用工具
	registry.register(createGetTimeTool());
}

function makeTool(
	name: string,
	description: string,
	schema: any,
	func: (args: any) => Promise<string>,
): ToolDefInput {
	const t = new DynamicStructuredTool({ name, description, schema, func } as any);
	return { name, description, tool: t };
}

function createLocalSearchTool(app: App): ToolDefInput {
	return makeTool(
		"local_search",
		"Search the user's note vault for notes matching a query.",
		z.object({ query: z.string().describe("The search query") }),
		async ({ query }) => {
			const files = app.vault.getMarkdownFiles();
			const results: string[] = [];
			const lq = query.toLowerCase();
			for (const file of files) {
				if (results.length >= 10) break;
				if (file.basename.toLowerCase().includes(lq)) {
					const c = await app.vault.cachedRead(file);
					results.push(`## ${file.path}\n${c.slice(0, 1000)}`);
					continue;
				}
				const c = await app.vault.cachedRead(file);
				if (c.toLowerCase().includes(lq)) {
					results.push(`## ${file.path}\n${c.slice(0, 1000)}`);
				}
			}
			return results.length > 0
				? results.join("\n\n---\n\n")
				: `No notes found matching "${query}"`;
		},
	);
}

function createReadNoteTool(app: App): ToolDefInput {
	return makeTool(
		"read_note",
		"Read the full content of a note by its file path.",
		z.object({ path: z.string().describe("The file path, e.g. 'folder/note.md'") }),
		async ({ path }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file || !("stat" in file)) return `File not found: ${path}`;
			const content = await app.vault.read(file as TFile);
			return content.length > 8000 ? content.slice(0, 8000) + "\n\n...(truncated)" : content;
		},
	);
}

function createWriteNoteTool(app: App): ToolDefInput {
	return makeTool(
		"write_note",
		"Create or overwrite a note with the given content.",
		z.object({
			path: z.string().describe("The file path for the note"),
			content: z.string().describe("The markdown content to write"),
		}),
		async ({ path, content }) => {
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing && "stat" in existing) {
				await app.vault.modify(existing as TFile, content);
				return `Updated: ${path}`;
			}
			await app.vault.create(path, content);
			return `Created: ${path}`;
		},
	);
}

function createGetTimeTool(): ToolDefInput {
	return makeTool(
		"get_current_time",
		"Get the current date and time.",
		z.object({}),
		async () => new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
	);
}

function createListTagsTool(app: App): ToolDefInput {
	return makeTool(
		"list_tags",
		"List all tags used in the vault with their counts.",
		z.object({}),
		async () => {
			const tags = new Map<string, number>();
			for (const file of app.vault.getMarkdownFiles()) {
				const cache = app.metadataCache.getFileCache(file);
				if (cache?.tags) {
					for (const tag of cache.tags) {
						tags.set(tag.tag, (tags.get(tag.tag) || 0) + 1);
					}
				}
			}
			const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
			return sorted.map(([tag, count]) => `${tag} (${count})`).join("\n") || "No tags found";
		},
	);
}

function createGetFileTreeTool(app: App): ToolDefInput {
	return makeTool(
		"get_file_tree",
		"List markdown files in the vault, optionally filtered by folder path.",
		z.object({ folder: z.string().optional().describe("Optional folder path to filter by") }),
		async ({ folder }) => {
			const files = app.vault.getMarkdownFiles()
				.filter((f: TFile) => !folder || f.path.startsWith(folder))
				.map((f: TFile) => f.path)
				.sort();
			return files.length > 0
				? files.slice(0, 200).join("\n")
				: `No files found${folder ? ` in ${folder}` : ""}`;
		},
	);
}
