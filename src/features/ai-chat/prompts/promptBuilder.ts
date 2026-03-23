import { DEFAULT_SYSTEM_PROMPT } from "../constants";
import type { SystemPromptManager } from "./SystemPromptManager";

/**
 * 构建最终的系统提示词。
 * 优先级：用户自定义 > 默认内置。
 */
export async function buildSystemPrompt(
	manager: SystemPromptManager,
	activeTitle: string,
): Promise<string> {
	if (!activeTitle) return DEFAULT_SYSTEM_PROMPT;

	const content = await manager.getPromptContent(activeTitle);
	if (!content) return DEFAULT_SYSTEM_PROMPT;

	// 将内置提示词与用户自定义组合
	return `${DEFAULT_SYSTEM_PROMPT}\n\n<user_custom_instructions>\n${content}\n</user_custom_instructions>`;
}

/**
 * 处理命令模板中的变量。
 * 支持：{selection} — 当前选中文本
 *       {activeNote} — 当前笔记内容
 *       {input} — 用户输入
 */
export function processCommandTemplate(
	template: string,
	vars: { selection?: string; activeNote?: string; input?: string },
): string {
	let result = template;
	if (vars.selection !== undefined) {
		result = result.replace(/\{selection\}/g, vars.selection);
	}
	if (vars.activeNote !== undefined) {
		result = result.replace(/\{activeNote\}/g, vars.activeNote);
	}
	if (vars.input !== undefined) {
		result = result.replace(/\{input\}/g, vars.input);
	}
	return result;
}
