import { Setting } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings } from "../types";

export function renderChatSettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
): void {
	new Setting(el)
		.setName("自动保存对话")
		.setDesc("消息变化后自动保存对话")
		.addToggle((toggle) =>
			toggle.setValue(s.autosaveEnabled).onChange(async (value) => {
				s.autosaveEnabled = value;
				await plugin.saveSettings();
			}),
		);

}
