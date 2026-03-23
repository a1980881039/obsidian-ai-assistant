/**
 * 从 Provider 的 /models 端点动态获取可用模型列表。
 * 使用 Obsidian 的 requestUrl API 绕过 CORS 限制。
 */

import { requestUrl } from "obsidian";
import type { Provider } from "../types";

export interface FetchModelsResult {
	models: string[];
	error?: string;
}

/**
 * 从 Provider API 获取可用模型列表。
 *
 * 支持格式:
 * - OpenAI 标准: { data: [{ id: "..." }] }
 * - 简易数组: [{ id: "..." }] 或 ["model-name"]
 * - Anthropic: { models: [{ id: "..." }] }
 */
export async function fetchAvailableModels(provider: Provider): Promise<FetchModelsResult> {
	const baseUrl = provider.baseUrl.replace(/\/+$/, "");
	const modelsUrl = baseUrl.endsWith("/v1")
		? `${baseUrl}/models`
		: `${baseUrl}/v1/models`;

	try {
		const response = await requestUrl({
			url: modelsUrl,
			method: "GET",
			headers: buildHeaders(provider),
		});

		if (response.status !== 200) {
			return { models: [], error: `HTTP ${response.status}: ${response.text?.slice(0, 200)}` };
		}

		const data = response.json;
		const rawList = Array.isArray(data)
			? data
			: (data.data ?? data.models ?? []);

		const models: string[] = rawList
			.map((m: unknown) => typeof m === "string" ? m : (m as { id?: string }).id)
			.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
			.filter((id: string, idx: number, arr: string[]) => arr.indexOf(id) === idx)
			.sort();

		return { models };
	} catch (err) {
		return {
			models: [],
			error: err instanceof Error ? err.message : "获取模型列表失败",
		};
	}
}

function buildHeaders(provider: Provider): Record<string, string> {
	const headers: Record<string, string> = {
		"Accept": "application/json",
		"Content-Type": "application/json",
	};

	if (provider.apiKey) {
		// Anthropic 使用不同的 header
		if (provider.type === "anthropic") {
			headers["x-api-key"] = provider.apiKey;
			headers["anthropic-version"] = "2023-06-01";
		} else {
			headers["Authorization"] = `Bearer ${provider.apiKey}`;
		}
	}

	return headers;
}
