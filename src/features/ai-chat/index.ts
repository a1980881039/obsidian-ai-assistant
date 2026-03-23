import type { Feature, SettingsRenderContext } from "../Feature";
import type SuperPlugin from "../../main";
import { AIChatView } from "./views/ChatView";
import { ChatManager } from "./core/ChatManager";
import { EditorIntegration } from "./editor/editorIntegration";
import { VIEW_TYPE_AI_CHAT } from "./constants";
import { renderAIChatSettings } from "./settings";
import { createQuickAskExtension, showQuickAskEffect } from "./editor/quickAskExtension";
import { EditorView } from "@codemirror/view";
import { getFirstEnabledModelKey, getFirstEnabledModelConfigId } from "./types";

/**
 * AI Chat 功能模块。
 * 注册聊天侧边栏视图和相关命令。
 */
export class AIChatFeature implements Feature {
	readonly id = "ai-chat";
	private plugin!: SuperPlugin;
	private chatManager!: ChatManager;
	private editorIntegration!: EditorIntegration;
	private autoIndexTimer: ReturnType<typeof setTimeout> | null = null;

	load(plugin: SuperPlugin): void {
		this.plugin = plugin;
		this.chatManager = new ChatManager(plugin.app, plugin.settings.aiChat);

		// Listen for settings changes
		plugin.onSettingsChange(() => {
			this.chatManager.updateSettings(plugin.settings.aiChat);
		});

		// Register the chat view
		plugin.registerView(
			VIEW_TYPE_AI_CHAT,
			(leaf) => new AIChatView(leaf, this.chatManager),
		);

		// Register commands
		plugin.addCommand({
			id: "open-ai-chat",
			name: "打开 AI 聊天",
			callback: () => this.activateChatView(),
		});

		plugin.addCommand({
			id: "new-ai-chat",
			name: "新建 AI 对话",
			callback: async () => {
				await this.chatManager.newChat();
				this.activateChatView();
			},
		});

		plugin.addCommand({
			id: "save-ai-chat",
			name: "保存当前 AI 对话",
			callback: () => {
				const settings = plugin.settings.aiChat;
				const modelKey = this.getDefaultModelKey(settings);
				this.chatManager.saveCurrentChat(modelKey);
			},
		});

		// Load and register custom commands
		this.registerCustomCommands();

		// Editor integration
		this.editorIntegration = new EditorIntegration(plugin.app, this.chatManager);
		this.registerEditorCommands();
		this.registerQuickAskExtension();

		// Auto-index vault events (Phase 1)
		this.registerAutoIndexListeners();
	}

	unload(): void {
		if (this.autoIndexTimer) {
			clearTimeout(this.autoIndexTimer);
			this.autoIndexTimer = null;
		}
		this.chatManager.destroy();
		this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
	}

	renderSettings(containerEl: HTMLElement, ctx: SettingsRenderContext): void {
		ctx.createSection(containerEl, {
			title: "AI 聊天",
			icon: "message-square",
			defaultOpen: false,
			toggle: {
				value: this.plugin.settings.aiChat.enabled,
				onChange: async (value) => {
					this.plugin.settings.aiChat.enabled = value;
					await this.plugin.saveSettings();
				},
			},
			render: (content) => renderAIChatSettings(content, this.plugin, ctx, this.chatManager),
		});
	}

	private async activateChatView(): Promise<void> {
		if (!this.plugin.settings.aiChat.enabled) return;
		const { workspace } = this.plugin.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_AI_CHAT,
					active: true,
				});
				leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT)[0];
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	private async registerCustomCommands(): Promise<void> {
		try {
			const commands = await this.chatManager.customCommandManager.fetchCommands();
			for (const cmd of commands) {
				this.plugin.addCommand({
					id: `ai-cmd-${cmd.title.replace(/\s+/g, "-").toLowerCase()}`,
					name: `AI: ${cmd.title}`,
					editorCallback: async (editor) => {
						const selection = editor.getSelection();
						const settings = this.plugin.settings.aiChat;
						await this.activateChatView();
						await this.chatManager.executeCommand(
							cmd.title,
							this.getDefaultModelKey(settings),
							{ selection },
						);
					},
				});
			}
		} catch {
			// Commands folder may not exist yet
		}
	}

	private registerAutoIndexListeners(): void {
		const settings = this.plugin.settings.aiChat;
		if (!settings.enabled || !settings.enableAutoIndex) return;

		const vaultIndexer = this.chatManager.vaultIndexer;
		const debounceMs = 2000;
		const debouncedUpdate = (file: import("obsidian").TFile) => {
			if (this.autoIndexTimer) clearTimeout(this.autoIndexTimer);
			this.autoIndexTimer = setTimeout(() => vaultIndexer.updateFile(file), debounceMs);
		};

		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof this.plugin.app.vault.constructor || !("extension" in file)) return;
				if ((file as import("obsidian").TFile).extension === "md") {
					debouncedUpdate(file as import("obsidian").TFile);
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", (file) => {
				if ("extension" in file && (file as import("obsidian").TFile).extension === "md") {
					debouncedUpdate(file as import("obsidian").TFile);
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", (file) => {
				if ("extension" in file) {
					vaultIndexer.removeFile(file.path);
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", (file, oldPath) => {
				if ("extension" in file && (file as import("obsidian").TFile).extension === "md") {
					vaultIndexer.removeFile(oldPath);
					debouncedUpdate(file as import("obsidian").TFile);
				}
			}),
		);
	}

	private registerEditorCommands(): void {
		const getModelKeyFn = () => this.getDefaultModelKey(this.plugin.settings.aiChat);

		this.plugin.addCommand({
			id: "ai-quick-ask",
			name: "AI: Quick Ask",
			editorCallback: (editor, ctx) => {
				const selection = editor.getSelection();
				if (!selection) return;

				// Access CM6 EditorView from Obsidian's editor (internal API)
				const cmEditor = (editor as any).cm as EditorView | undefined;
				if (!cmEditor) return;

				const from = cmEditor.state.selection.main.from;
				const to = cmEditor.state.selection.main.to;
				cmEditor.dispatch({ effects: showQuickAskEffect.of({ from, to }) });
			},
		});

		this.plugin.addCommand({
			id: "ai-summarize-selection",
			name: "AI: 总结选中文本",
			editorCallback: async (editor) => {
				await this.activateChatView();
				await this.editorIntegration.summarizeSelection(editor, getModelKeyFn());
			},
		});

		this.plugin.addCommand({
			id: "ai-translate-selection",
			name: "AI: 翻译选中文本",
			editorCallback: async (editor) => {
				await this.activateChatView();
				await this.editorIntegration.translateSelection(editor, getModelKeyFn());
			},
		});

		this.plugin.addCommand({
			id: "ai-explain-selection",
			name: "AI: 解释选中文本",
			editorCallback: async (editor) => {
				await this.activateChatView();
				await this.editorIntegration.explainSelection(editor, getModelKeyFn());
			},
		});

		this.plugin.addCommand({
			id: "ai-rewrite-selection",
			name: "AI: 改写选中文本",
			editorCallback: async (editor) => {
				await this.activateChatView();
				await this.editorIntegration.rewriteSelection(editor, getModelKeyFn());
			},
		});
	}

	private registerQuickAskExtension(): void {
		const getModelKeyFn = () => this.getDefaultModelKey(this.plugin.settings.aiChat);

		const quickAskExt = createQuickAskExtension(async (prompt, selectedText) => {
			await this.activateChatView();
			await this.chatManager.sendMessage(
				`${prompt}\n\n${selectedText}`,
				getModelKeyFn(),
			);
		});

		this.plugin.registerEditorExtension(quickAskExt);
	}

	/** 获取默认模型 key：优先使用新 ModelConfig，回退旧 activeModels */
	private getDefaultModelKey(settings: import("./types").AIChatSettings): string {
		// New system: use defaultModelId or first enabled ModelConfig
		if (settings.modelConfigs?.length > 0) {
			return settings.defaultModelId || getFirstEnabledModelConfigId(settings.modelConfigs);
		}
		// Legacy fallback
		return getFirstEnabledModelKey(settings.activeModels);
	}
}