import { Setting } from "obsidian";
import type SuperPlugin from "../../main";
import type { SettingsRenderContext } from "../Feature";

/**
 * AI Agent 综合体设置渲染。
 */
export function renderAIAgentSettings(
	content: HTMLElement,
	plugin: SuperPlugin,
	ctx: SettingsRenderContext,
): void {
	const settings = plugin.settings.aiAgent;

	new Setting(content)
		.setName("工作流最大步数")
		.setDesc("单次工作流执行的最大 Agent 步数")
		.addText((text) =>
			text
				.setValue(String(settings.defaultWorkflowMaxSteps))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						settings.defaultWorkflowMaxSteps = num;
						await plugin.saveSettings();
					}
				}),
		);
}
