import { Notice, SecretComponent, Setting } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings } from "../types";
import { EmbeddingProvider } from "../types";
import { EMBEDDING_PROVIDER_CONFIGS } from "../embedding/embeddingProviderConfig";
import type { ChatManager } from "../core/ChatManager";

export function renderQASettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
	chatManager?: ChatManager,
): void {
	new Setting(el)
		.setName("嵌入模型 Provider")
		.setDesc("用于语义搜索的嵌入模型提供商")
		.addDropdown((dropdown) => {
			for (const [key, config] of Object.entries(EMBEDDING_PROVIDER_CONFIGS)) {
				dropdown.addOption(key, config.label);
			}
			dropdown.setValue(s.embeddingProvider);
			dropdown.onChange(async (value) => {
				s.embeddingProvider = value as EmbeddingProvider;
				const config = EMBEDDING_PROVIDER_CONFIGS[s.embeddingProvider];
				if (config.defaultModel && !s.embeddingModel) {
					s.embeddingModel = config.defaultModel;
				}
				await plugin.saveSettings();
			});
		});

	new Setting(el)
		.setName("嵌入模型名称")
		.setDesc("嵌入模型 ID")
		.addText((text) =>
			text.setPlaceholder("text-embedding-3-small").setValue(s.embeddingModel).onChange(async (value) => {
				s.embeddingModel = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("嵌入 API Key")
		.setDesc("嵌入模型使用的 API Key")
		.addComponent((c) => new SecretComponent(plugin.app, c)
			.setValue(s.embeddingApiKey || "")
			.onChange(async (value: string) => {
				s.embeddingApiKey = value;
				await plugin.saveSettings();
			}));

	new Setting(el)
		.setName("排除路径")
		.setDesc("不索引的文件夹路径，逗号分隔")
		.addText((text) =>
			text.setPlaceholder("Templates, .trash").setValue(s.qaExclusionPaths).onChange(async (value) => {
				s.qaExclusionPaths = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("包含路径")
		.setDesc("仅索引这些文件夹（留空索引全库），逗号分隔")
		.addText((text) =>
			text.setPlaceholder("").setValue(s.qaInclusionPaths).onChange(async (value) => {
				s.qaInclusionPaths = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("自动索引")
		.setDesc("笔记变更时自动更新索引")
		.addToggle((toggle) =>
			toggle.setValue(s.enableAutoIndex).onChange(async (value) => {
				s.enableAutoIndex = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("重建索引")
		.setDesc("清除并重新索引全库")
		.addButton((btn) =>
			btn.setButtonText("重建索引").onClick(async () => {
				if (!chatManager) return;
				new Notice("开始重建索引...");
				try {
					const count = await chatManager.indexVault();
					new Notice(`索引完成，共 ${count} 篇笔记`);
				} catch (err) {
					new Notice(`索引失败: ${err}`);
				}
			}),
		);
}
