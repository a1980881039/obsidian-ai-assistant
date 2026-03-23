import { Setting } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings } from "../types";

export function renderPromptSettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
): void {
	new Setting(el)
		.setName("系统提示词文件夹")
		.setDesc("在该文件夹下创建 .md 文件即可作为系统提示词。可在聊天界面顶部切换使用哪个提示词")
		.addText((text) =>
			text.setPlaceholder("Super Enhance/AI System Prompts").setValue(s.systemPromptsFolder).onChange(async (value) => {
				s.systemPromptsFolder = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("自定义命令文件夹")
		.setDesc("在该文件夹下创建 .md 文件即可作为自定义命令。聊天时输入 / 可快速调用")
		.addText((text) =>
			text.setPlaceholder("Super Enhance/AI Custom Commands").setValue(s.customCommandsFolder).onChange(async (value) => {
				s.customCommandsFolder = value;
				await plugin.saveSettings();
			}),
		);

	new Setting(el)
		.setName("当前系统提示词")
		.setDesc("填写上方文件夹中的提示词文件名（不含 .md），AI 会按该提示词回复。留空则使用内置默认提示词")
		.addText((text) =>
			text.setPlaceholder("（默认）").setValue(s.activeSystemPromptTitle).onChange(async (value) => {
				s.activeSystemPromptTitle = value;
				await plugin.saveSettings();
			}),
		);
}
