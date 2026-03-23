import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { requestUrl } from "obsidian";
import type { ToolDefInput } from "./ToolRegistry";
import { decryptKey } from "../providers/encryptionService";

/**
 * Web 搜索工具 — Tavily API 为主，DuckDuckGo Lite HTML 解析为备选。
 */
export function createWebSearchTool(getApiKey: () => string): ToolDefInput {
	const schema = z.object({
		query: z.string().describe("The search query"),
		maxResults: z.number().optional().describe("Max results to return (default 5)"),
	});

	const tool = new DynamicStructuredTool({
		name: "web_search",
		description: "Search the web for current information. Use when the user asks about recent events, facts you're unsure about, or anything requiring up-to-date information.",
		schema,
		func: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
			const max = maxResults ?? 5;
			const rawKey = getApiKey();
			const apiKey = rawKey ? await decryptKey(rawKey) : "";

			if (apiKey) {
				return tavilySearch(query, apiKey, max);
			}
			return ddgSearch(query, max);
		},
	} as any);

	return { name: "web_search", description: tool.description, tool };
}

async function tavilySearch(query: string, apiKey: string, maxResults: number): Promise<string> {
	const resp = await requestUrl({
		url: "https://api.tavily.com/search",
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			api_key: apiKey,
			query,
			max_results: maxResults,
			include_answer: true,
		}),
	});
	const data = resp.json;
	const parts: string[] = [];
	if (data.answer) parts.push(`**Summary:** ${data.answer}\n`);
	for (const r of data.results || []) {
		parts.push(`### ${r.title}\n${r.url}\n${r.content || ""}`);
	}
	return parts.join("\n\n") || "No results found.";
}

async function ddgSearch(query: string, maxResults: number): Promise<string> {
	try {
		const encoded = encodeURIComponent(query);
		const resp = await requestUrl({
			url: `https://lite.duckduckgo.com/lite/?q=${encoded}`,
			method: "GET",
			headers: { "User-Agent": "Mozilla/5.0" },
		});
		const html = resp.text;
		// Parse result snippets from DDG Lite HTML
		const results: string[] = [];
		const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
		const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
		const links: Array<{ url: string; title: string }> = [];
		let m: RegExpExecArray | null;
		while ((m = linkRegex.exec(html)) !== null) {
			links.push({ url: m[1], title: m[2].trim() });
		}
		const snippets: string[] = [];
		while ((m = snippetRegex.exec(html)) !== null) {
			snippets.push(m[1].replace(/<[^>]*>/g, "").trim());
		}
		for (let i = 0; i < Math.min(links.length, maxResults); i++) {
			results.push(`### ${links[i].title}\n${links[i].url}\n${snippets[i] || ""}`);
		}
		return results.length > 0 ? results.join("\n\n") : "No results found.";
	} catch {
		return "Web search failed. No Tavily API key configured and DuckDuckGo fallback failed.";
	}
}
