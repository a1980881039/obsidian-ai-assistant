/**
 * 智能模型识别与能力检测模块
 * 移植自 agent-workbench，适配 Obsidian 插件环境。
 * 通过模型名称（ID）自动识别模型家族、推理能力、API 格式等。
 */

// ────────────────── 模型家族定义 ──────────────────

export type ModelFamily =
	| "claude" | "gpt" | "o-series" | "deepseek"
	| "qwen" | "gemini" | "grok" | "mistral"
	| "llama" | "doubao" | "glm" | "hunyuan"
	| "kimi" | "minimax" | "step" | "unknown";

export type ApiFormat = "openai" | "anthropic";

// ────────────────── 辅助方法 ──────────────────

function normalize(modelId: string): string {
	return modelId
		.toLowerCase()
		.replace(/^anthropic\./, "")
		.replace(/-v\d+:\d+$/, "")
		.replace(/@[\w-]+$/, "")
		.trim();
}

// ────────────────── 模型家族检测 ──────────────────

export function detectModelFamily(modelId: string): ModelFamily {
	const id = normalize(modelId);

	if (id.includes("claude")) return "claude";
	if (/^o[1-9][-.]/.test(id)) return "o-series";
	if (id.includes("gpt-5") || id.includes("gpt5")) return "gpt";
	if (id.includes("gpt")) return "gpt";
	if (id.includes("deepseek")) return "deepseek";
	if (/^qwen|^qwq|^qvq/.test(id)) return "qwen";
	if (id.includes("gemini")) return "gemini";
	if (id.includes("grok")) return "grok";
	if (id.includes("mistral") || id.includes("mixtral") || id.includes("codestral")) return "mistral";
	if (id.includes("llama")) return "llama";
	if (id.includes("doubao") || id.includes("seed-")) return "doubao";
	if (id.includes("glm")) return "glm";
	if (id.includes("hunyuan")) return "hunyuan";
	if (id.includes("kimi") || id.includes("moonshot")) return "kimi";
	if (id.includes("minimax") || id.includes("abab")) return "minimax";
	if (id.includes("step-")) return "step";

	return "unknown";
}

// ────────────────── 推理模型检测 ──────────────────

export function isReasoningModel(modelId: string): boolean {
	const id = normalize(modelId);
	const family = detectModelFamily(modelId);

	switch (family) {
		case "claude": return isClaudeReasoning(id);
		case "o-series": return true;
		case "gpt": return /gpt-?5/.test(id);
		case "deepseek": return isDeepSeekReasoning(id);
		case "qwen": return isQwenReasoning(id);
		case "gemini": return isGeminiReasoning(id);
		case "grok": return isGrokReasoning(id);
		case "glm": return id.includes("glm-zero") || /glm-[4-9]/.test(id);
		case "hunyuan": return id.includes("hunyuan-t1") || id.includes("hunyuan-a13b");
		case "kimi": return id.includes("thinking") || id.includes("k2.5") || id.includes("k2-5");
		case "minimax": return /minimax-m[2-9]/.test(id);
		case "step": return id.includes("step-3") || id.includes("step-r1");
		case "doubao": return id.includes("thinking") || id.includes("seed-");
		default: return /\b(reason|thinking|think)\b/i.test(id) && !/non-reason/i.test(id);
	}
}

function isClaudeReasoning(id: string): boolean {
	if (/claude-3[.-]7/.test(id)) return true;
	if (/claude-(sonnet|opus|haiku)-[4-9]/.test(id)) return true;
	return false;
}

function isDeepSeekReasoning(id: string): boolean {
	if (id.includes("deepseek-r1")) return true;
	if (id.includes("deepseek-reasoner")) return true;
	if (/deepseek-v3[.-][1-9]/.test(id)) return true;
	return false;
}

function isQwenReasoning(id: string): boolean {
	if (id.includes("qwq") || id.includes("qvq")) return true;
	if (/^qwen3/.test(id)) return true;
	if (id.includes("thinking")) return true;
	return false;
}

function isGeminiReasoning(id: string): boolean {
	if (id.includes("thinking")) return true;
	if (/gemini-2\.5/.test(id)) return true;
	if (/gemini-3/.test(id)) return true;
	return false;
}

function isGrokReasoning(id: string): boolean {
	if (id.includes("grok-3-mini")) return true;
	if (/grok-[4-9]/.test(id) && !id.includes("non-reasoning")) return true;
	return false;
}

// ────────────────── 视觉模型检测 ──────────────────

export function isVisionModel(modelId: string): boolean {
	const id = normalize(modelId);
	if (/vision|vl\b|image/i.test(id)) return true;
	// 主流多模态模型默认支持视觉
	const family = detectModelFamily(modelId);
	if (family === "gpt" && (id.includes("gpt-4o") || id.includes("gpt-5"))) return true;
	if (family === "claude" && /claude-(3|sonnet|opus|haiku)-/.test(id)) return true;
	if (family === "gemini") return true;
	return false;
}

// ────────────────── 自动能力检测 ──────────────────

export function detectCapabilities(modelId: string): { reasoning: boolean; vision: boolean; websearch: boolean } {
	return {
		reasoning: isReasoningModel(modelId),
		vision: isVisionModel(modelId),
		websearch: false, // websearch 需用户手动配置
	};
}

// ────────────────── API 格式检测 ──────────────────

export function detectApiFormat(
	modelId: string,
	providerType: string,
	reasoningEffort: string,
): ApiFormat {
	if (providerType === "anthropic") return "anthropic";
	if (providerType && providerType !== "anthropic") return "openai";

	const family = detectModelFamily(modelId);
	if (family === "claude") {
		const id = normalize(modelId);
		const wantsThinking = reasoningEffort && reasoningEffort !== "none";
		if (isClaudeReasoning(id) && wantsThinking) return "anthropic";
	}

	return "openai";
}
