/** AI Chat 设置 — 帮助 tab */

function createSubheader(parent: HTMLElement, text: string): void {
	parent.createEl("div", { text, cls: "gz-ai-chat-settings-subheader" });
}

export function renderHelp(el: HTMLElement): void {
	el.addClass("gz-ai-chat-settings-help");

	createSubheader(el, "🚀 快速开始");
	const quickStart = el.createEl("ol");
	quickStart.createEl("li", { text: "在「模型」tab 添加 Provider，填入 API Key 和 Base URL" });
	quickStart.createEl("li", { text: "在「模型」tab 中「获取模型」，启用需要的模型" });
	quickStart.createEl("li", { text: "打开 AI Chat 侧边栏，开始对话！" });

	createSubheader(el, "💬 对话方式");
	const modes = el.createEl("ul");
	modes.createEl("li").innerHTML = "<strong>普通聊天</strong> — 直接输入问题与 AI 对话";
	modes.createEl("li").innerHTML = "<strong>附加上下文</strong> — 拖拽笔记/文件夹到输入框，或选中编辑器文本自动引用";
	modes.createEl("li").innerHTML = "<strong>@ 提及</strong> — 在输入框中输入 <code>@笔记名</code> 引用笔记内容";
	modes.createEl("li").innerHTML = "<strong>Agent 模式</strong> — AI 自动调用工具完成复杂任务（由模型能力决定）";

	createSubheader(el, "📎 上下文引用");
	const ctx = el.createEl("ul");
	ctx.createEl("li").innerHTML = "<strong>拖拽</strong> — 从文件列表拖拽笔记或文件夹到输入框";
	ctx.createEl("li").innerHTML = "<strong>选中文本</strong> — 在编辑器中选中文本，自动作为引用出现在输入框上方";
	ctx.createEl("li").innerHTML = "<strong>@ 提及</strong> — 输入 <code>@</code> 弹出补全菜单，模糊搜索笔记";
	ctx.createEl("li").innerHTML = "<strong>粘贴路径</strong> — 粘贴笔记路径自动识别为引用";

	createSubheader(el, "✏️ 编辑器命令");
	el.createEl("p", { text: "选中文本后可通过命令面板调用：", cls: "setting-item-description" });
	const editorCmds = el.createEl("ul");
	editorCmds.createEl("li").innerHTML = "<strong>Quick Ask</strong> — 对选中文本快速提问";
	editorCmds.createEl("li").innerHTML = "<strong>总结 / 翻译 / 解释 / 改写</strong> — 常用文本处理";

	createSubheader(el, "🧩 自定义命令与系统提示词");
	const custom = el.createEl("ul");
	custom.createEl("li").innerHTML =
		"<strong>系统提示词</strong> — 在「功能」tab 指定的文件夹中创建 .md 文件，可在会话设置中切换";
	custom.createEl("li").innerHTML =
		"<strong>自定义命令</strong> — 在指定文件夹中创建 .md 模板，支持 <code>{{selection}}</code>、<code>{{note}}</code> 等变量";

	createSubheader(el, "🤖 Agent 工具");
	el.createEl("p", { text: "Agent 模式下可自动调用以下工具（可在「功能 → Agent 设置」中开关）：", cls: "setting-item-description" });
	const tools = el.createEl("ul");
	const toolGroups = [
		["笔记读写", "read_note、write_note、append_to_note、replace_in_file、delete_note、rename_note"],
		["笔记属性", "get_note_properties、update_note_properties"],
		["搜索浏览", "local_search、get_file_tree、list_folder、list_tags"],
		["网络工具", "fetch_url、web_search、youtube_transcript"],
		["实用工具", "get_time"],
	];
	for (const [group, desc] of toolGroups) {
		tools.createEl("li").innerHTML = `<strong>${group}</strong> — ${desc}`;
	}

	createSubheader(el, "🔍 语义索引与 QA");
	const qa = el.createEl("ul");
	qa.createEl("li", { text: "在「索引 & 高级」tab 中配置嵌入模型和 API Key" });
	qa.createEl("li", { text: "点击「重建索引」对全库笔记进行向量化" });
	qa.createEl("li", { text: "开启「自动索引」后，笔记变更会自动更新索引" });

	createSubheader(el, "💾 对话管理");
	const conv = el.createEl("ul");
	conv.createEl("li").innerHTML = "<strong>自动保存</strong> — 消息变化后自动保存（可在「功能」tab 关闭）";
	conv.createEl("li").innerHTML = "<strong>历史记录</strong> — 点击工具栏时钟图标浏览和加载过往对话";
	conv.createEl("li").innerHTML = "<strong>编辑消息</strong> — 点击用户消息的编辑按钮可修改并重新生成 AI 回复";

	createSubheader(el, "⌨️ 快捷键");
	const keys = el.createEl("ul");
	keys.createEl("li").innerHTML = "<strong>Enter</strong> — 发送消息";
	keys.createEl("li").innerHTML = "<strong>Shift + Enter</strong> — 换行";
	keys.createEl("li").innerHTML = "<strong>Ctrl/Cmd + L</strong> — 打开 AI Chat 侧边栏";
	keys.createEl("li").innerHTML = "<strong>Ctrl/Cmd + Shift + L</strong> — 将选中文本发送到 AI Chat";
	keys.createEl("li").innerHTML = "<strong>Esc</strong> — 停止当前生成";
}
