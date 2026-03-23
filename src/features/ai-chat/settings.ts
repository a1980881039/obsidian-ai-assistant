import type SuperPlugin from "../../main";
import type { SettingsRenderContext } from "../Feature";
import type { AIChatSettings } from "./types";
import type { ChatManager } from "./core/ChatManager";
import { renderModelGlobalSettings, renderModelTable } from "./settings/renderModelSettings";
import { renderPromptSettings } from "./settings/renderPromptSettings";
import { renderQASettings } from "./settings/renderQASettings";
import { renderAgentSettings } from "./settings/renderAgentSettings";
import { renderChatSettings } from "./settings/renderChatSettings";
import { renderAdvancedSettings } from "./settings/renderAdvancedSettings";
import { renderHelp } from "./settings/settingsHelp";

/** 记住当前激活的 tab，redisplay 后恢复 */
let activeTabId = "model";

interface TabDef {
	id: string;
	label: string;
	render: (panel: HTMLElement) => void;
}

/** 在 tab 面板内创建子区域标题 */
function createSubheader(parent: HTMLElement, text: string): void {
	parent.createEl("div", { text, cls: "gz-ai-chat-settings-subheader" });
}

/**
 * AI Chat 设置 UI — 横向 4-tab 布局。
 */
export function renderAIChatSettings(
	content: HTMLElement,
	plugin: SuperPlugin,
	ctx: SettingsRenderContext,
	chatManager?: ChatManager,
): void {
	const s = plugin.settings.aiChat;

	const tabs: TabDef[] = [
		{
			id: "model",
			label: "⚙️ 模型",
			render: (panel) => {
				const globalContainer = panel.createDiv();
				const refreshGlobal = () => {
					globalContainer.empty();
					renderModelGlobalSettings(globalContainer, plugin, s);
				};
				refreshGlobal();
				createSubheader(panel, "模型管理");
				renderModelTable(panel, plugin, s, ctx, refreshGlobal);
			},
		},
		{
			id: "feature",
			label: "💬 功能",
			render: (panel) => {
				createSubheader(panel, "聊天设置");
				renderChatSettings(panel, plugin, s);
				createSubheader(panel, "提示词 & 自定义命令");
				renderPromptSettings(panel, plugin, s);
				createSubheader(panel, "Agent 设置");
				renderAgentSettings(panel, plugin, s, chatManager);
			},
		},
		{
			id: "index",
			label: "🔍 索引 & 高级",
			render: (panel) => {
				createSubheader(panel, "QA & 索引");
				renderQASettings(panel, plugin, s, chatManager);
				createSubheader(panel, "高级设置");
				renderAdvancedSettings(panel, plugin, s);
			},
		},
		{
			id: "help",
			label: "📖 帮助",
			render: (panel) => renderHelp(panel),
		},
	];

	// ── Tab bar ──
	const tabBar = content.createDiv({ cls: "gz-ai-chat-settings-tabs" });
	const panels: HTMLElement[] = [];

	for (const tab of tabs) {
		const btn = tabBar.createEl("button", {
			text: tab.label,
			cls: "gz-ai-chat-settings-tab-btn",
		});
		const panel = content.createDiv({ cls: "gz-ai-chat-settings-panel" });
		tab.render(panel);
		panels.push(panel);

		if (tab.id === activeTabId) {
			btn.addClass("is-active");
			panel.addClass("is-active");
		}

		btn.addEventListener("click", () => {
			activeTabId = tab.id;
			tabBar.querySelectorAll(".gz-ai-chat-settings-tab-btn").forEach((b) => b.classList.remove("is-active"));
			for (const p of panels) p.removeClass("is-active");
			btn.addClass("is-active");
			panel.addClass("is-active");
		});
	}
}
