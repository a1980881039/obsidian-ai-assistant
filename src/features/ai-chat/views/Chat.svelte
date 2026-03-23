<script lang="ts">
	import type { App, TFile } from "obsidian";
	import type { ChatMessage, CustomModel, UserSystemPrompt, SessionOverrides } from "../types";
	import { getModelKey, getFirstEnabledModelConfigId } from "../types";
	import type { ChatManager } from "../core/ChatManager";
	import type { ContextItem } from "../types";
	import ChatMessages from "./ChatMessages.svelte";
	import ChatInput from "./ChatInput.svelte";
	import ChatSettings from "./ChatSettings.svelte";
	import ChatHistory from "./ChatHistory.svelte";
	import TokenCounter from "./TokenCounter.svelte";
	import ProjectPanel from "./ProjectPanel.svelte";
	import type { Project } from "../project/ProjectManager";
	import { createHistoryState, loadHistory, initSessionOverrides, initSessionOverridesFromConfig } from "./chatActions";

	/** 兼容 dropdown 选项类型 */
	interface ModelOption {
		key: string;
		name: string;
	}

	interface Props {
		app: App;
		chatManager: ChatManager;
	}

	let { app, chatManager }: Props = $props();

	function mgr(): ChatManager { return chatManager; }

	let messages = $state<ChatMessage[]>([]);
	let currentStreamingText = $state("");
	let isLoading = $state(false);
	let selectedModelKey = $state((() => {
		const cmm = mgr().chatModelManager;
		if (cmm.hasNewArchitecture()) {
			const configs = cmm.getEnabledModelConfigs();
			const s = mgr().getSettings();
			return s.defaultModelId || (configs[0]?.id ?? "");
		}
		const models = cmm.getEnabledModels();
		return models[0] ? getModelKey(models[0]) : "";
	})());
	let showHistory = $state(false);
	let historyState = $state(createHistoryState());
	let projects = $state<Project[]>([]);
	let activeProjectName = $state<string | null>(null);
	let showProjectPanel = $state(false);

	let showSettings = $state(false);
	let showModelPicker = $state(false);
	let canSend = $state(false);
	let allowFileWrite = $state(true);
	let chatInputRef: ChatInput | undefined = $state();
	let isDraggingOver = $state(false);
	let unifiedInputEl: HTMLDivElement | undefined = $state();
	let sessionOverrides = $state<SessionOverrides>({});
	let contextItems = $state<ContextItem[]>([]);
	let systemPrompts = $state<UserSystemPrompt[]>([]);

	/** 选中文本跟踪：冻结快照模式，避免焦点转移导致丢失 */
	let lastSelectionContent = "";
	let selectionDismissed = false;

	function syncSelection() {
		const editor = app.workspace.activeEditor?.editor;
		const sel = editor?.getSelection();
		if (!sel) return; // 选区为空时保留已有 pill，不移除

		// 用户手动关闭 pill 后，相同选区不再重新出现
		if (selectionDismissed && sel === lastSelectionContent) return;

		// 检测到新选区 → 重置 dismissed
		if (sel !== lastSelectionContent) {
			selectionDismissed = false;
			lastSelectionContent = sel;
		}
		if (selectionDismissed) return;

		const preview = sel.replace(/\n/g, " ").slice(0, 20) + (sel.length > 20 ? "…" : "");
		const item: ContextItem = { type: "selection", path: "selection", displayName: preview, selectionContent: sel };
		const oldIdx = contextItems.findIndex(c => c.type === "selection");
		if (oldIdx >= 0) {
			if (contextItems[oldIdx].selectionContent === sel) return;
			const copy = [...contextItems];
			copy[oldIdx] = item;
			contextItems = copy;
		} else {
			contextItems = [...contextItems, item];
		}
	}

	$effect(() => {
		const interval = setInterval(syncSelection, 300);
		return () => clearInterval(interval);
	});

	mgr().projectManager.loadProjects().then(p => { projects = p; });
	mgr().systemPromptManager.fetchPrompts().then(sp => { systemPrompts = sp; });

	mgr().setCallbacks({
		onMessagesChanged: (msgs) => { messages = msgs; },
		onStreamingToken: (text) => { currentStreamingText = text; },
		onLoadingChanged: (loading) => { isLoading = loading; },
	});

	messages = mgr().getDisplayMessages();

	/* ── Drag-drop: capture-phase listeners to beat Obsidian's handlers ── */
	function resolveDroppedPath(raw: string): ContextItem | null {
		if (!app) return null;
		let p = raw.trim();

		// Parse obsidian://open?vault=...&file=... URI
		if (p.startsWith("obsidian://")) {
			try {
				const url = new URL(p);
				const filePath = url.searchParams.get("file");
				const folderPath = url.searchParams.get("path");
				// "file" for files, "path" may be used for folders
				const resolved = filePath || folderPath;
				if (!resolved) return null;
				p = resolved;
			} catch { return null; }
		}

		// Strip wiki-link syntax [[...]]
		const wikiMatch = p.match(/^\[\[([^\]]+)\]\]$/);
		if (wikiMatch) p = wikiMatch[1];

		// Normalize path
		p = p.replace(/\\/g, "/").replace(/^\/+/, "");
		if (!p) return null;
		const vault = app.vault;

		// Try exact path first (works for any file type: md, pdf, images, etc.)
		const af = vault.getAbstractFileByPath(p)
			|| vault.getAbstractFileByPath(p + ".md");
		if (af) {
			if ("children" in af) {
				return { type: "folder", path: af.path, displayName: af.name || af.path };
			}
			return { type: "note", path: af.path, displayName: (af as any).basename ?? af.name };
		}

		// Fallback: try matching by basename across ALL files (not just markdown)
		const allFiles = vault.getFiles();
		const found = allFiles.find(f => f.basename === p || f.name === p || f.basename === p.replace(/\.\w+$/, ""));
		if (found) return { type: "note", path: found.path, displayName: found.basename };

		// Fallback: try matching folders by name
		const root = vault.getRoot();
		const folder = findFolderByName(root, p);
		if (folder) return { type: "folder", path: folder.path, displayName: folder.name || folder.path };

		return null;
	}

	function findFolderByName(folder: any, name: string): any {
		if (!folder.children) return null;
		for (const child of folder.children) {
			if ("children" in child) {
				if (child.name === name || child.path === name) return child;
				const sub = findFolderByName(child, name);
				if (sub) return sub;
			}
		}
		return null;
	}

	function onCaptureDrop(e: DragEvent) {
		const dt = e.dataTransfer;
		if (!dt) return;

		// Try text/plain first (Obsidian drag provides obsidian:// URI here)
		const plain = dt.getData("text/plain")?.trim();

		if (plain) {
			const lines = plain.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
			let any = false;
			for (const line of lines) {
				const resolved = resolveDroppedPath(line);
				if (resolved) { handleContextAdd(resolved); any = true; }
			}
			if (any) {
				e.preventDefault();
				e.stopPropagation();
				isDraggingOver = false;
				return;
			}
		}

		// Try text/uri-list
		const uriList = dt.getData("text/uri-list")?.trim();
		if (uriList) {
			const lines = uriList.split(/\r?\n/).filter(l => l && !l.startsWith("#"));
			let any = false;
			for (const uri of lines) {
				// file:///... URIs
				try {
					const url = new URL(uri);
					if (url.protocol === "file:") {
						const decoded = decodeURIComponent(url.pathname).replace(/^\/+/, "");
						const resolved = resolveDroppedPath(decoded);
						if (resolved) { handleContextAdd(resolved); any = true; }
					}
				} catch(_) {}
			}
			if (any) {
				e.preventDefault();
				e.stopPropagation();
				isDraggingOver = false;
				return;
			}
		}

		// Image files fallback
		if (dt.files?.length) {
			let anyImage = false;
			for (let i = 0; i < dt.files.length; i++) {
				if (dt.files[i].type.startsWith("image/") && chatInputRef) {
					chatInputRef.addImage(dt.files[i]);
					anyImage = true;
				}
			}
			if (anyImage) {
				e.preventDefault();
				e.stopPropagation();
				isDraggingOver = false;
				return;
			}
		}

		isDraggingOver = false;
	}

	function onCaptureDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
	}
	function onCaptureDragEnter(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
		isDraggingOver = true;
	}
	function onCaptureDragLeave(e: DragEvent) {
		const el = unifiedInputEl;
		if (!el) return;
		const rel = e.relatedTarget as Node | null;
		if (!rel || !el.contains(rel)) isDraggingOver = false;
	}

	$effect(() => {
		const el = unifiedInputEl;
		if (!el) return;
		el.addEventListener("drop", onCaptureDrop, true);
		el.addEventListener("dragover", onCaptureDragOver, true);
		el.addEventListener("dragenter", onCaptureDragEnter, true);
		el.addEventListener("dragleave", onCaptureDragLeave, true);
		return () => {
			el.removeEventListener("drop", onCaptureDrop, true);
			el.removeEventListener("dragover", onCaptureDragOver, true);
			el.removeEventListener("dragenter", onCaptureDragEnter, true);
			el.removeEventListener("dragleave", onCaptureDragLeave, true);
		};
	});

	function getEnabledModels(): CustomModel[] {
		return mgr().chatModelManager.getEnabledModels();
	}

	/** 获取模型选项列表（兼容新旧架构） */
	function getModelOptions(): ModelOption[] {
		const cmm = mgr().chatModelManager;
		if (cmm.hasNewArchitecture()) {
			return cmm.getEnabledModelConfigs().map(mc => ({
				key: mc.id,
				name: mc.name || mc.model,
			}));
		}
		return cmm.getEnabledModels().map(m => ({
			key: getModelKey(m),
			name: m.name,
		}));
	}

	async function handleSend(text: string) {
		const items = contextItems.length > 0 ? contextItems.map(c => {
			const mapped: { path: string; displayName: string; type: string; selectionContent?: string } = { path: c.path, displayName: c.displayName, type: c.type };
			if (c.selectionContent) mapped.selectionContent = c.selectionContent;
			return mapped;
		}) : undefined;
		await mgr().sendMessage(text, selectedModelKey, items);
	}
	function handleStop() { mgr().stopGeneration(); }

	async function handleNewChat() {
		await mgr().newChat();
		contextItems = [];
		selectionDismissed = false;
		lastSelectionContent = "";
		sessionOverrides = {};
	}

	async function refreshHistory(sort?: "recent" | "created" | "name", reset = true) {
		historyState = await loadHistory(mgr(), historyState, sort, reset);
	}

	async function handleShowHistory() {
		await refreshHistory();
		showHistory = true;
	}

	async function handleLoadChat(file: TFile) {
		const modelKey = await mgr().loadChat(file);
		if (modelKey) selectedModelKey = modelKey;
		showHistory = false;
	}

	async function handleDeleteChat(file: TFile) {
		await mgr().deleteChatHistory(file);
		await refreshHistory();
	}

	async function handleRenameChat(file: TFile, newTopic: string) {
		await mgr().renameChatHistory(file, newTopic);
		await refreshHistory();
	}

	async function handleGenerateTitle(file: TFile): Promise<string> {
		return mgr().generateTitleForChat(file);
	}

	async function handleSortChange(strategy: "recent" | "created" | "name") {
		await refreshHistory(strategy);
	}

	function handleModelChange(key: string) {
		selectedModelKey = key;
		const cmm = mgr().chatModelManager;
		if (cmm.hasNewArchitecture()) {
			sessionOverrides = initSessionOverridesFromConfig(cmm.getEnabledModelConfigs(), key);
		} else {
			sessionOverrides = initSessionOverrides(getEnabledModels(), key);
		}
	}

	function handleDeleteMessage(id: string) { mgr().deleteMessage(id); }
	async function handleEditMessage(id: string, text: string) {
		await mgr().editAndRegenerate(id, text, selectedModelKey);
	}
	async function handleRegenerate(id: string) { await mgr().regenerateLastMessage(selectedModelKey); }



	function handleProjectSelect(name: string | null) {
		activeProjectName = name;
		mgr().projectManager.setActiveProject(name);
	}

	function handleProjectManage() { showProjectPanel = true; }

	async function handleProjectCreate(name: string, folder: string) {
		await mgr().projectManager.createProject(name, folder);
		projects = mgr().projectManager.getProjects();
	}

	async function handleProjectDelete(name: string) {
		await mgr().projectManager.deleteProject(name);
		projects = mgr().projectManager.getProjects();
		if (activeProjectName === name) activeProjectName = null;
	}

	function handleContextAdd(item: ContextItem) {
		if (!contextItems.find(c => c.path === item.path)) {
			contextItems = [...contextItems, item];
		}
	}

	function handleContextRemove(path: string) {
		if (path === "selection") selectionDismissed = true;
		contextItems = contextItems.filter(c => c.path !== path);
	}

	function handleBottomSend() { chatInputRef?.submit(); }

	function handleToggleSettings() {
		showSettings = !showSettings;
		if (showSettings) {
			mgr().systemPromptManager.fetchPrompts().then(sp => { systemPrompts = sp; });
			if (Object.keys(sessionOverrides).length === 0) {
				const cmm = mgr().chatModelManager;
				if (cmm.hasNewArchitecture()) {
					sessionOverrides = initSessionOverridesFromConfig(cmm.getEnabledModelConfigs(), selectedModelKey);
				} else {
					sessionOverrides = initSessionOverrides(getEnabledModels(), selectedModelKey);
				}
			}
		}
	}

	function handleModelSelectChange(e: Event) {
		handleModelChange((e.target as HTMLSelectElement).value);
	}

	function toggleFileWrite() {
		allowFileWrite = !allowFileWrite;
		mgr().setFileWriteAllowed(allowFileWrite);
	}

	function getSelectedModelName(): string {
		const opts = getModelOptions();
		return opts.find(o => o.key === selectedModelKey)?.name || "选择模型";
	}

	function handleModelPickerSelect(key: string) {
		handleModelChange(key);
		showModelPicker = false;
	}

</script>
<div class="gz-ai-chat-root">
	<ChatMessages
		{messages}
		streamingText={currentStreamingText}
		{isLoading}
		{app}
		onDelete={handleDeleteMessage}
		onEdit={handleEditMessage}
		onRegenerate={handleRegenerate}
	/>

	<div class="gz-ai-chat-bottom-section">
		<!-- Toolbar (above input card) -->
		<div class="gz-ai-chat-toolbar-row" style="position:relative;">
			<div class="gz-ai-chat-toolbar-left">
				<button class="clickable-icon gz-ai-chat-toolbar-btn" data-tooltip="新建对话" onclick={handleNewChat} aria-label="新建对话">
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
				</button>
				<button class="clickable-icon gz-ai-chat-toolbar-btn" data-tooltip="会话设置" class:gz-ai-chat-toolbar-btn-active={showSettings} onclick={handleToggleSettings} aria-label="会话设置">
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
				</button>
				<button class="clickable-icon gz-ai-chat-toolbar-btn" data-tooltip="历史对话" onclick={handleShowHistory} aria-label="历史对话">
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
				</button>
				<div class="gz-ai-chat-toolbar-sep"></div>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="gz-ai-chat-model-picker-wrapper">
					<button class="gz-ai-chat-model-picker-trigger" onclick={() => showModelPicker = !showModelPicker}>
						<span class="gz-ai-chat-model-picker-name">{getSelectedModelName()}</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
					</button>
					{#if showModelPicker}
						<div class="gz-ai-chat-model-picker-backdrop" onclick={() => showModelPicker = false}></div>
						<div class="gz-ai-chat-model-picker-menu">
							{#each getModelOptions() as opt}
								<button
									class="gz-ai-chat-model-picker-item"
									class:gz-ai-chat-model-picker-item-active={opt.key === selectedModelKey}
									onclick={() => handleModelPickerSelect(opt.key)}
								>
									<span>{opt.name}</span>
									{#if opt.key === selectedModelKey}
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="gz-ai-chat-toolbar-right">
				<button
					class="clickable-icon gz-ai-chat-toolbar-btn"
					class:gz-ai-chat-toolbar-btn-active={!allowFileWrite}
					data-tooltip={allowFileWrite ? "AI 可写入文件" : "AI 只读模式"}
					aria-label={allowFileWrite ? "AI 可写入文件（点击锁定）" : "AI 只读模式（点击解锁）"}
					onclick={toggleFileWrite}
				>
					{#if allowFileWrite}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
					{/if}
				</button>
				<TokenCounter {messages} />
			</div>

			{#if showSettings}
				<ChatSettings
					overrides={sessionOverrides}
					{systemPrompts}
					models={getEnabledModels()}
					{selectedModelKey}
					onOverridesChange={(o) => sessionOverrides = o}
					onClose={() => showSettings = false}
				/>
			{/if}

			{#if showHistory}
				<ChatHistory
					items={historyState.items}
					onSelect={handleLoadChat}
					onDelete={handleDeleteChat}
					onRename={handleRenameChat}
					onGenerateTitle={handleGenerateTitle}
					onSortChange={handleSortChange}
					onClose={() => showHistory = false}
				/>
			{/if}
		</div>

		<!-- Input card (drag-drop via capture-phase listeners in $effect) -->
		<div class="gz-ai-chat-unified-input" class:gz-ai-chat-input-dragover={isDraggingOver}
			bind:this={unifiedInputEl}>
			<ChatInput
				bind:this={chatInputRef}
				{app}
				{contextItems}
				{isLoading}
				onSend={handleSend}
				onInputChange={(has) => canSend = has}
				onContextRemove={handleContextRemove}
				onContextAdd={handleContextAdd}
			/>
			<div class="gz-ai-chat-input-footer">
				{#if isLoading}
					<button class="gz-ai-chat-send-btn gz-ai-chat-stop-btn" data-tooltip="停止" aria-label="停止" onclick={handleStop}>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
					</button>
				{:else}
					<button class="gz-ai-chat-send-btn" onclick={handleBottomSend} disabled={!canSend} data-tooltip="发送 (Enter)" aria-label="发送">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if showProjectPanel}
		<ProjectPanel
			{projects}
			onClose={() => showProjectPanel = false}
			onCreate={handleProjectCreate}
			onDelete={handleProjectDelete}
		/>
	{/if}
</div>
