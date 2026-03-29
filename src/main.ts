import { Plugin } from "obsidian";
import type { PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import { AISettingTab } from "./settings";
import type { Feature } from "./features/Feature";
import { applyMigration } from "./features/ai-chat/providers/settingsMigration";
import { initSecretService } from "./features/ai-chat/providers/encryptionService";

// Feature imports
import { AIChatFeature } from "./features/ai-chat/index";
import { AIAgentFeature } from "./features/ai-agent/index";

export default class AIPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private settingsChangeCallbacks: Array<() => void> = [];
	private features: Feature[] = [];

	async onload() {
		initSecretService(this.app);
		await this.loadSettings();

		this.features = [
			new AIChatFeature(),
			new AIAgentFeature(),
		];

		await Promise.all(this.features.map((f) => f.load(this)));

		this.addSettingTab(new AISettingTab(this.app, this, this.features));
	}

	onunload() {
		this.settingsChangeCallbacks = [];
		for (const feature of this.features) {
			feature.unload();
		}
		this.features = [];
	}

	// ── 设置管理 ──

	async loadSettings() {
		const data = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// 深层合并嵌套对象，使新增子字段自动获得默认值
		for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof PluginSettings)[]) {
			const defaultVal = DEFAULT_SETTINGS[key];
			if (defaultVal !== null && typeof defaultVal === "object" && !Array.isArray(defaultVal)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(this.settings as any)[key] = Object.assign(
					{}, defaultVal,
					(data as Record<string, unknown> | null)?.[key] ?? {},
				);
			}
		}

		// 自动迁移旧版 CustomModel[] → Provider + ModelConfig
		if (applyMigration(this.settings.aiChat)) {
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		for (const cb of this.settingsChangeCallbacks) cb();
	}

	onSettingsChange(callback: () => void): void {
		this.settingsChangeCallbacks.push(callback);
	}

	/** 按 id 获取 Feature 实例 */
	getFeature<T extends Feature>(id: string): T | undefined {
		return this.features.find((f) => f.id === id) as T | undefined;
	}
}
