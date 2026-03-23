import { App, PluginSettingTab, setIcon } from "obsidian";
import type AIPlugin from "./main";
import type { Feature, SettingsRenderContext } from "./features/Feature";

/**
 * 设置面板编排器。
 * 按分类遍历 Feature 数组，调用各自的 renderSettings()。
 */
export class AISettingTab extends PluginSettingTab {
	declare plugin: AIPlugin;
	private features: Feature[];

	constructor(app: App, plugin: AIPlugin, features: Feature[]) {
		super(app, plugin);
		this.features = features;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("gz-settings-root");

		const ctx: SettingsRenderContext = {
			plugin: this.plugin,
			createSection: (parent, opts) => this.createSection(parent, opts),
			createCategoryHeader: (parent, title, icon) => this.createCategoryHeader(parent, title, icon),
			redisplay: () => this.display(),
		};

		this.createCategoryHeader(containerEl, "AI 功能", "bot");
		this.renderFeatures(containerEl, ctx, ["ai-chat", "ai-agent"]);

		this.createSection(containerEl, {
			title: "关于插件",
			icon: "info",
			defaultOpen: false,
			render: (content) => this.renderAbout(content),
		});
	}

	private renderFeatures(containerEl: HTMLElement, ctx: SettingsRenderContext, ids: string[]): void {
		for (const id of ids) {
			const feature = this.features.find((f) => f.id === id);
			feature?.renderSettings?.(containerEl, ctx);
		}
	}

	private renderAbout(content: HTMLElement): void {
		content.createEl("p", {
			text: "AI 助手 — Obsidian AI 对话与 Agent 工作流插件。",
		});
		content.createEl("p", {
			text: "包含 AI 聊天、智能体工作流等功能模块，各模块可独立开关。",
			cls: "setting-item-description",
		});
	}

	// ── UI 辅助 ──

	private createCategoryHeader(parent: HTMLElement, title: string, iconId: string): void {
		const header = parent.createDiv({ cls: "gz-category-header" });
		const titleEl = header.createSpan({ cls: "gz-category-title" });
		const iconEl = titleEl.createSpan({ cls: "gz-category-icon" });
		setIcon(iconEl, iconId);
		titleEl.createSpan({ text: title });
	}

	private createSection(
		parent: HTMLElement,
		opts: {
			title: string;
			icon: string;
			defaultOpen: boolean;
			render: (contentEl: HTMLElement) => void;
			toggle?: {
				value: boolean;
				onChange: (value: boolean) => Promise<void>;
			};
		},
	): void {
		const section = parent.createDiv({ cls: "gz-settings-section" });

		const header = section.createDiv({
			cls: `gz-settings-section-header${opts.defaultOpen ? "" : " is-collapsed"}`,
		});
		header.createSpan({ cls: "gz-settings-section-arrow" });
		const iconEl = header.createSpan({ cls: "gz-settings-section-icon" });
		setIcon(iconEl, opts.icon);
		header.createSpan({ text: opts.title, cls: "gz-settings-section-title" });

		// 开关按钮（可选）
		if (opts.toggle) {
			const toggleWrapper = header.createDiv({ cls: "gz-settings-section-toggle" });
			const toggleEl = toggleWrapper.createDiv({
				cls: `checkbox-container${opts.toggle.value ? " is-enabled" : ""}`,
			});
			toggleEl.addEventListener("click", (e) => {
				e.stopPropagation();
				const newValue = !toggleEl.hasClass("is-enabled");
				toggleEl.toggleClass("is-enabled", newValue);
				opts.toggle!.onChange(newValue);
			});
		}

		const content = section.createDiv({
			cls: `gz-settings-section-content${opts.defaultOpen ? "" : " is-collapsed"}`,
		});
		const inner = content.createDiv({ cls: "gz-section-inner" });

		opts.render(inner);

		header.addEventListener("click", () => {
			const collapsed = content.hasClass("is-collapsed");
			content.toggleClass("is-collapsed", !collapsed);
			header.toggleClass("is-collapsed", !collapsed);
		});
	}
}
