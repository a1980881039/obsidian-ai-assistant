import type { Plugin } from "obsidian";

/**
 * 统一功能模块接口。
 * 每个功能（html-preview、auto-link、bookmark 等）实现此接口，
 * 由 main.ts 统一注册和管理生命周期。
 */
export interface Feature {
	/** 唯一标识符，如 "html-preview"、"auto-link" */
	readonly id: string;

	/** 插件加载时调用，注册命令、视图、事件等 */
	load(plugin: Plugin): void | Promise<void>;

	/** 插件卸载时调用，清理资源 */
	unload(): void;

	/** 可选：在设置面板中渲染本功能的设置 UI */
	renderSettings?(containerEl: HTMLElement, ctx: SettingsRenderContext): void;
}

/**
 * 设置渲染上下文，由 settings.ts 编排器传入。
 */
export interface SettingsRenderContext {
	plugin: Plugin;
	createSection(
		parent: HTMLElement,
		opts: {
			title: string;
			icon: string;
			defaultOpen: boolean;
			render: (contentEl: HTMLElement) => void;
			/** 可选：在折叠行右侧显示开关 */
			toggle?: {
				value: boolean;
				onChange: (value: boolean) => Promise<void>;
			};
		},
	): void;
	createCategoryHeader(parent: HTMLElement, title: string, icon: string): void;
	redisplay(): void;
}
