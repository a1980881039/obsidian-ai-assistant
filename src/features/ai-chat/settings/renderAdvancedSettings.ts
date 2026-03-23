import { Setting } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings } from "../types";

export function renderAdvancedSettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
): void {
	new Setting(el)
		.setName("工具超时 (ms)")
		.setDesc("单个工具调用的超时时间")
		.addText((text) =>
			text.setPlaceholder("30000").setValue(String(s.agentToolTimeout)).onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num > 0) { s.agentToolTimeout = num; await plugin.saveSettings(); }
			}),
		);

	new Setting(el)
		.setName("嵌入 Base URL")
		.setDesc("自定义嵌入 API 端点（可选）")
		.addText((text) =>
			text.setPlaceholder("https://api.openai.com/v1").setValue(s.embeddingBaseUrl).onChange(async (value) => {
				s.embeddingBaseUrl = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("Chunk 大小")
		.setDesc("文本分块大小（字符数）")
		.addText((text) =>
			text.setPlaceholder("1000").setValue(String(s.chunkSize)).onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num > 0) { s.chunkSize = num; await plugin.saveSettings(); }
			}),
		);

	new Setting(el)
		.setName("Chunk 重叠")
		.setDesc("相邻分块的重叠字符数")
		.addText((text) =>
			text.setPlaceholder("200").setValue(String(s.chunkOverlap)).onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num >= 0) { s.chunkOverlap = num; await plugin.saveSettings(); }
			}),
		);

	new Setting(el)
		.setName("Auto-compact 阈值")
		.setDesc("对话 token 超过此值时自动压缩历史（0 = 禁用）")
		.addText((text) =>
			text.setPlaceholder("128000").setValue(String(s.autoCompactThreshold)).onChange(async (value) => {
				const num = parseInt(value, 10);
				if (!isNaN(num) && num >= 0) { s.autoCompactThreshold = num; await plugin.saveSettings(); }
			}),
		);
}
