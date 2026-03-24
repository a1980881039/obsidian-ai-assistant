/**
 * ContextService — 上下文构建与提示词组装。
 * 封装 ContextManager、SystemPromptManager、UserMemoryManager、CustomCommandManager。
 */

import type { App } from "obsidian";
import { ContextManager, type ContextItem } from "../core/ContextManager";
import { SystemPromptManager } from "../prompts/SystemPromptManager";
import { CustomCommandManager } from "../prompts/customCommands";
import { UserMemoryManager } from "../memory/UserMemoryManager";
import { buildSystemPrompt } from "../prompts/promptBuilder";
import type { ImageAttachment, AIChatSettings } from "../types";
import type { ProjectManager } from "../project/ProjectManager";

export class ContextService {
	readonly systemPromptManager: SystemPromptManager;
	readonly customCommandManager: CustomCommandManager;
	readonly userMemoryManager: UserMemoryManager;
	private readonly contextManager: ContextManager;

	constructor(app: App, settings: AIChatSettings) {
		this.contextManager = new ContextManager(app);
		this.systemPromptManager = new SystemPromptManager(app, settings.systemPromptsFolder);
		this.customCommandManager = new CustomCommandManager(app, settings.customCommandsFolder);
		this.userMemoryManager = new UserMemoryManager(app);
	}

	/** 构建完整的消息上下文 */
	async buildContext(userMessage: string, images?: ImageAttachment[], contextItems?: ContextItem[]) {
		return this.contextManager.buildContext(userMessage, images, contextItems);
	}

	/** 将上下文格式化为系统提示词片段 */
	formatContextForPrompt(ctx: Awaited<ReturnType<ContextManager["buildContext"]>>): string {
		return this.contextManager.formatContextForPrompt(ctx);
	}

	/** 组装完整系统提示词（含内存） */
	async buildFullSystemPrompt(projectManager: ProjectManager, activePromptTitle: string): Promise<string> {
		const activeProject = projectManager.getActiveProject();
		const promptTitle = activeProject?.systemPromptTitle || activePromptTitle;
		let systemPrompt = await buildSystemPrompt(this.systemPromptManager, promptTitle);

		const memoryPrompt = await this.userMemoryManager.formatForPrompt();
		if (memoryPrompt) systemPrompt += "\n\n" + memoryPrompt;

		return systemPrompt;
	}

	// ── 设置更新 ──

	updateSettings(settings: AIChatSettings): void {
		this.systemPromptManager.updateFolder(settings.systemPromptsFolder);
		this.customCommandManager.updateFolder(settings.customCommandsFolder);
	}
}
