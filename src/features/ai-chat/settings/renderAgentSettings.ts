import { SecretComponent, Setting } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings } from "../types";
import type { ChatManager } from "../core/ChatManager";

/** 工具中文显示名称与描述 */
const TOOL_I18N: Record<string, { label: string; desc: string }> = {
	local_search:       { label: "本地搜索",     desc: "允许 AI 搜索你的笔记库，找到与问题相关的笔记" },
	read_note:          { label: "读取笔记",     desc: "允许 AI 打开并阅读指定笔记的完整内容" },
	write_note:         { label: "写入笔记",     desc: "允许 AI 创建新笔记或修改已有笔记的内容" },
	get_current_time:   { label: "获取时间",     desc: "允许 AI 获取当前日期和时间，用于日记、提醒等场景" },
	list_tags:          { label: "列出标签",     desc: "允许 AI 查看笔记库中所有标签及使用次数" },
	get_file_tree:      { label: "文件列表",     desc: "允许 AI 浏览笔记库的文件结构，了解你有哪些笔记" },
	replace_in_file:    { label: "替换文本",     desc: "允许 AI 精确替换笔记中的部分内容，而不是覆盖整篇" },
	web_search:         { label: "网络搜索",     desc: "允许 AI 联网搜索，回答需要最新信息的问题" },
	youtube_transcript: { label: "YouTube 字幕", desc: "允许 AI 提取 YouTube 视频字幕，用于总结视频内容" },
	save_memory:        { label: "保存记忆",     desc: "允许 AI 记住你的偏好和重要信息，下次对话时自动参考" },
	read_memories:      { label: "读取记忆",     desc: "允许 AI 回顾之前保存的记忆，提供更个性化的回复" },
	append_to_note:     { label: "追加内容",     desc: "允许 AI 在已有笔记末尾追加新内容，而不覆盖原有内容" },
	delete_note:        { label: "删除笔记",     desc: "允许 AI 将指定笔记移入回收站" },
	rename_note:        { label: "重命名笔记",   desc: "允许 AI 重命名或移动笔记到新路径" },
	get_note_properties:    { label: "读取属性",     desc: "允许 AI 读取笔记的 frontmatter 属性（标签、日期等）" },
	update_note_properties: { label: "更新属性",     desc: "允许 AI 修改笔记的 frontmatter 属性" },
	list_folder:        { label: "列出文件夹",   desc: "允许 AI 查看指定文件夹下的所有文件和子文件夹" },
	fetch_url:          { label: "抓取网页",     desc: "允许 AI 抓取指定 URL 的网页内容并提取正文文本" },
};

export function renderAgentSettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
	chatManager?: ChatManager,
): void {
	new Setting(el)
		.setName("Tavily API Key")
		.setDesc("填写后「网络搜索」工具会使用 Tavily 搜索，效果更好。不填则自动用 DuckDuckGo。可在 tavily.com 免费申请（1000 次/月）")
		.addComponent((c) => new SecretComponent(plugin.app, c)
			.setValue(s.tavilyApiKey || "")
			.onChange(async (value: string) => {
				s.tavilyApiKey = value;
				await plugin.saveSettings();
			}));

	new Setting(el)
		.setName("最大迭代次数")
		.setDesc("AI 单次回复中最多可连续调用工具的轮数。数值越大 AI 能做的事越多，但也会消耗更多 token")
		.addSlider((slider) =>
			slider.setLimits(1, 30, 1).setValue(s.agentMaxIterations).setDynamicTooltip()
				.onChange(async (value) => { s.agentMaxIterations = value; await plugin.saveSettings(); }),
		);

	// Tool enable/disable toggles
	if (chatManager) {
		el.createEl("h6", { text: "工具开关" });
		const allTools = chatManager.toolRegistry.getAllIncludingDisabled();
		for (const toolDef of allTools) {
			const i18n = TOOL_I18N[toolDef.name];
			new Setting(el)
				.setName(i18n?.label ?? toolDef.name)
				.setDesc(i18n?.desc ?? toolDef.description.slice(0, 80))
				.addToggle((toggle) =>
					toggle.setValue(toolDef.enabled).onChange(async (value) => {
						chatManager.toolRegistry.setEnabled(toolDef.name, value);
						s.enabledTools[toolDef.name] = value;
						await plugin.saveSettings();
					}),
				);
		}
	}
}
