/**
 * 模型连通性测试服务。
 * 对齐 agent-workbench 的模型测试机制，支持 OpenAI 和 Anthropic 两种格式。
 * 使用 Obsidian 的 requestUrl API 绕过 CORS。
 */

import { requestUrl } from "obsidian";
import type { ModelConfig, Provider } from "../types";
import { detectApiFormat } from "./modelCapabilities";
import { resolveSecret } from "./encryptionService";

export interface TestResult {
	ok: boolean;
	latency: number;
	error?: string;
}

/**
 * 测试单个模型的连通性。
 * 发送最小化请求（max_tokens: 1），测量 RTT。
 */
export async function testModelConnection(
	mc: ModelConfig,
	provider: Provider,
): Promise<TestResult> {
	const start = Date.now();

	try {
		const apiKey = resolveSecret(provider.apiKey || mc.apiKey);
		const baseUrl = (mc.baseUrl || provider.baseUrl).replace(/\/+$/, "");
		const format = detectApiFormat(mc.model, mc.provider, "none");

		let url: string;
		let headers: Record<string, string>;
		let body: string;

		if (format === "anthropic") {
			const apiBase = baseUrl.endsWith("/v1") ? baseUrl.replace(/\/v1$/, "") : baseUrl;
			url = `${apiBase}/v1/messages`;
			headers = {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			};
			body = JSON.stringify({
				model: mc.model,
				max_tokens: 1,
				messages: [{ role: "user", content: "hi" }],
			});
		} else {
			const apiBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
			url = `${apiBase}/chat/completions`;
			headers = {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			};
			body = JSON.stringify({
				model: mc.model,
				messages: [{ role: "user", content: "hi" }],
				max_tokens: 1,
			});
		}

		const response = await requestUrl({ url, method: "POST", headers, body });
		const latency = Date.now() - start;

		if (response.status >= 200 && response.status < 300) {
			return { ok: true, latency };
		}
		return { ok: false, latency, error: `HTTP ${response.status}` };
	} catch (err) {
		return {
			ok: false,
			latency: Date.now() - start,
			error: err instanceof Error ? err.message : "连接失败",
		};
	}
}

/**
 * 批量测试所有模型的连通性。
 * 并行执行，通过回调实时报告每个结果。
 */
export async function testAllModels(
	models: ModelConfig[],
	provider: Provider,
	onResult?: (modelId: string, result: TestResult) => void,
): Promise<Record<string, TestResult>> {
	const results: Record<string, TestResult> = {};

	await Promise.all(
		models.map(async (mc) => {
			const result = await testModelConnection(mc, provider);
			results[mc.id] = result;
			onResult?.(mc.id, result);
		}),
	);

	return results;
}
