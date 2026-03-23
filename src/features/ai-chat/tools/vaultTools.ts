import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { App, TFile, TFolder } from "obsidian";
import type { ToolDefInput } from "./ToolRegistry";

function makeTool(
	name: string,
	description: string,
	schema: z.ZodObject<any>,
	func: (args: any) => Promise<string>,
): ToolDefInput {
	const t = new DynamicStructuredTool({ name, description, schema, func } as any);
	return { name, description, tool: t };
}

/**
 * 追加内容到笔记末尾，而不是覆盖整个文件。
 */
export function createAppendToNoteTool(app: App): ToolDefInput {
	return makeTool(
		"append_to_note",
		"Append content to the end of an existing note. Creates the note if it doesn't exist. Use this when you want to add content without replacing existing text.",
		z.object({
			path: z.string().describe("The file path, e.g. 'folder/note.md'"),
			content: z.string().describe("The markdown content to append"),
		}),
		async ({ path, content }) => {
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing && "stat" in existing) {
				const current = await app.vault.read(existing as TFile);
				const separator = current.endsWith("\n") ? "\n" : "\n\n";
				await app.vault.modify(existing as TFile, current + separator + content);
				return `Appended to: ${path}`;
			}
			await app.vault.create(path, content);
			return `Created: ${path}`;
		},
	);
}

/**
 * 删除笔记。
 */
export function createDeleteNoteTool(app: App): ToolDefInput {
	return makeTool(
		"delete_note",
		"Delete a note from the vault. The file will be moved to the system trash.",
		z.object({
			path: z.string().describe("The file path to delete, e.g. 'folder/note.md'"),
		}),
		async ({ path }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file) return `File not found: ${path}`;
			await app.vault.trash(file, true);
			return `Deleted: ${path}`;
		},
	);
}

/**
 * 重命名/移动笔记。
 */
export function createRenameNoteTool(app: App): ToolDefInput {
	return makeTool(
		"rename_note",
		"Rename or move a note to a new path. Parent folders will be created automatically.",
		z.object({
			oldPath: z.string().describe("Current file path"),
			newPath: z.string().describe("New file path"),
		}),
		async ({ oldPath, newPath }) => {
			const file = app.vault.getAbstractFileByPath(oldPath);
			if (!file) return `File not found: ${oldPath}`;

			// 确保目标目录存在
			const parentPath = newPath.substring(0, newPath.lastIndexOf("/"));
			if (parentPath) {
				const parent = app.vault.getAbstractFileByPath(parentPath);
				if (!parent) {
					await app.vault.createFolder(parentPath);
				}
			}

			await app.fileManager.renameFile(file, newPath);
			return `Renamed: ${oldPath} → ${newPath}`;
		},
	);
}

/**
 * 读取笔记的 frontmatter 属性。
 */
export function createGetNotePropertiesTool(app: App): ToolDefInput {
	return makeTool(
		"get_note_properties",
		"Get the frontmatter/properties of a note. Returns YAML frontmatter data including tags, aliases, dates, and custom fields.",
		z.object({
			path: z.string().describe("The file path, e.g. 'folder/note.md'"),
		}),
		async ({ path }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file || !("stat" in file)) return `File not found: ${path}`;
			const cache = app.metadataCache.getFileCache(file as TFile);
			if (!cache?.frontmatter) return `No frontmatter found in: ${path}`;
			return JSON.stringify(cache.frontmatter, null, 2);
		},
	);
}

/**
 * 更新笔记的 frontmatter 属性。
 */
export function createUpdateNotePropertiesTool(app: App): ToolDefInput {
	return makeTool(
		"update_note_properties",
		"Update or add frontmatter properties in a note. Merges with existing frontmatter. Use JSON format for the properties object.",
		z.object({
			path: z.string().describe("The file path"),
			properties: z.string().describe("JSON string of properties to set, e.g. '{\"tags\":[\"ai\"],\"status\":\"done\"}'"),
		}),
		async ({ path, properties }) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!file || !("stat" in file)) return `File not found: ${path}`;

			let props: Record<string, unknown>;
			try {
				props = JSON.parse(properties);
			} catch {
				return "Invalid JSON for properties. Please provide valid JSON.";
			}

			const content = await app.vault.read(file as TFile);
			const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
			const match = content.match(fmRegex);

			let existingProps: Record<string, unknown> = {};
			let body = content;

			if (match) {
				// 解析已有 frontmatter
				body = content.slice(match[0].length);
				const lines = match[1].split("\n");
				for (const line of lines) {
					const colonIdx = line.indexOf(":");
					if (colonIdx > 0) {
						const key = line.slice(0, colonIdx).trim();
						const val = line.slice(colonIdx + 1).trim();
						existingProps[key] = val;
					}
				}
			}

			// 合并属性
			const merged = { ...existingProps, ...props };
			const fmLines = Object.entries(merged).map(([k, v]) => {
				if (Array.isArray(v)) {
					return `${k}:\n${v.map((i) => `  - ${i}`).join("\n")}`;
				}
				return `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`;
			});
			const newContent = `---\n${fmLines.join("\n")}\n---\n${body}`;
			await app.vault.modify(file as TFile, newContent);
			return `Updated properties in: ${path}`;
		},
	);
}

/**
 * 列出指定目录下的所有文件和子目录（不限 markdown）。
 */
export function createListFolderTool(app: App): ToolDefInput {
	return makeTool(
		"list_folder",
		"List all files and subfolders in a directory. Folder names end with /. Pass empty string or '/' to list root.",
		z.object({
			path: z.string().describe("Folder path to list, e.g. 'projects' or '' for root"),
		}),
		async ({ path }) => {
			const folderPath = path.replace(/^\/+|\/+$/g, "");
			const folder = folderPath
				? app.vault.getAbstractFileByPath(folderPath)
				: app.vault.getRoot();

			if (!folder) return `Folder not found: ${path}`;
			if (!("children" in folder)) return `Not a folder: ${path}`;

			const children = (folder as TFolder).children;
			const entries: string[] = children
				.map((child) => "children" in child ? `${child.name}/` : child.name)
				.sort();
			return entries.length > 0
				? entries.join("\n")
				: `(empty folder: ${path})`;
		},
	);
}
