import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { requestUrl } from "obsidian";
import type { ToolDefInput } from "./ToolRegistry";

/**
 * URL 内容抓取工具 — 获取网页/API 内容。
 * 使用 Obsidian requestUrl 绕过 CORS。
 * 移植自 agent-workbench 的 fetch_url 工具。
 */
export function createFetchUrlTool(): ToolDefInput {
	const schema = z.object({
		url: z.string().describe("The URL to fetch"),
		max_length: z.number().optional().describe("Max characters to return (default 10000)"),
	});

	const tool = new DynamicStructuredTool({
		name: "fetch_url",
		description: "Fetch the content of a URL. Supports HTTP/HTTPS. HTML pages are converted to plain text. Use this to read web pages, documentation, or API responses.",
		schema,
		func: async ({ url, max_length }: { url: string; max_length?: number }) => {
			const maxLen = max_length ?? 10000;

			// 验证 URL
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				return `Invalid URL: ${url}`;
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return `Unsupported protocol: ${parsed.protocol}`;
			}

			try {
				const resp = await requestUrl({
					url,
					method: "GET",
					headers: {
						"User-Agent": "Mozilla/5.0 (compatible; ObsidianBot/1.0)",
						"Accept": "text/html,application/json,text/plain,*/*",
					},
				});

				if (resp.status >= 400) {
					return `HTTP error ${resp.status}`;
				}

				let text = resp.text;

				// HTML → 纯文本
				if (text.includes("<html") || text.includes("<HTML") || text.includes("<!DOCTYPE") || text.includes("<!doctype")) {
					// 移除 script 和 style 标签及内容
					text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
					text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
					// 移除所有 HTML 标签
					text = text.replace(/<[^>]+>/g, " ");
					// HTML 实体
					text = text.replace(/&nbsp;/g, " ")
						.replace(/&amp;/g, "&")
						.replace(/&lt;/g, "<")
						.replace(/&gt;/g, ">")
						.replace(/&quot;/g, '"')
						.replace(/&#39;/g, "'");
					// 压缩空白
					text = text.replace(/\s+/g, " ").trim();
				}

				if (text.length > maxLen) {
					text = text.slice(0, maxLen) + "\n\n[内容已截断]";
				}
				return text || "(empty response)";
			} catch (err) {
				return `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
			}
		},
	} as any);

	return { name: "fetch_url", description: tool.description, tool };
}
