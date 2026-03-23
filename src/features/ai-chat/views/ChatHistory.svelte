<script lang="ts">
	import type { TFile } from "obsidian";

	interface HistoryItem {
		file: TFile;
		topic: string;
		date: string;
	}

	type SortStrategy = "recent" | "created" | "name";

	interface Props {
		items: HistoryItem[];
		sortStrategy?: SortStrategy;
		onSelect: (file: TFile) => void;
		onDelete: (file: TFile) => void;
		onRename: (file: TFile, newTopic: string) => void;
		onGenerateTitle?: (file: TFile) => Promise<string>;
		onSortChange?: (strategy: SortStrategy) => void;
		onClose: () => void;
	}

	let { items, sortStrategy = "recent", onSelect, onDelete, onRename, onGenerateTitle, onSortChange, onClose }: Props = $props();

	let searchQuery = $state("");
	let editingFile = $state<TFile | null>(null);
	let editingText = $state("");
	let deletedPaths = $state<Set<string>>(new Set());
	let generatingFile = $state<TFile | null>(null);

	const filteredItems = $derived(
		(() => {
			let list = items.filter(i => !deletedPaths.has(i.file.path));
			if (searchQuery.trim()) {
				const q = searchQuery.trim().toLowerCase();
				list = list.filter(i => i.topic.toLowerCase().includes(q));
			}
			return list;
		})()
	);

	interface TimeGroup {
		label: string;
		items: HistoryItem[];
	}

	const groupedItems = $derived(groupByTime(filteredItems));

	function groupByTime(list: HistoryItem[]): TimeGroup[] {
		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const yesterdayStart = todayStart - 86400000;
		const weekStart = todayStart - (now.getDay() * 86400000);

		const groups: Record<string, HistoryItem[]> = { today: [], yesterday: [], week: [], earlier: [] };
		for (const item of list) {
			const t = new Date(item.date).getTime();
			if (t >= todayStart) groups.today.push(item);
			else if (t >= yesterdayStart) groups.yesterday.push(item);
			else if (t >= weekStart) groups.week.push(item);
			else groups.earlier.push(item);
		}

		const result: TimeGroup[] = [];
		if (groups.today.length) result.push({ label: "今天", items: groups.today });
		if (groups.yesterday.length) result.push({ label: "昨天", items: groups.yesterday });
		if (groups.week.length) result.push({ label: "本周", items: groups.week });
		if (groups.earlier.length) result.push({ label: "更早", items: groups.earlier });
		return result;
	}

	function formatDate(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
		} catch {
			return iso;
		}
	}

	function toggleRename(item: HistoryItem, e: MouseEvent) {
		e.stopPropagation();
		if (editingFile === item.file) {
			commitRename();
			return;
		}
		editingFile = item.file;
		editingText = item.topic;
	}

	function commitRename() {
		if (editingFile && editingText.trim()) {
			onRename(editingFile, editingText.trim());
		}
		editingFile = null;
		editingText = "";
	}

	function handleDelete(item: HistoryItem, e: MouseEvent) {
		e.stopPropagation();
		// Optimistic: hide item immediately
		deletedPaths = new Set([...deletedPaths, item.file.path]);
		// Fire async delete in background
		onDelete(item.file);
	}

	async function handleGenerateTitle(item: HistoryItem, e: MouseEvent) {
		e.stopPropagation();
		if (!onGenerateTitle || generatingFile) return;
		generatingFile = item.file;
		try {
			const title = await onGenerateTitle(item.file);
			if (title) {
				// Directly save the title (no editing mode)
				onRename(item.file, title);
			}
		} finally {
			generatingFile = null;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gz-ai-chat-history-backdrop" onclick={onClose}></div>
<div class="gz-ai-chat-history-panel">
		<div class="gz-ai-chat-history-header">
			<h4>历史对话</h4>
			<button class="gz-ai-chat-btn clickable-icon" onclick={onClose} aria-label="关闭">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>

		<div class="gz-ai-chat-history-toolbar">
			<input
				type="text"
				class="gz-ai-chat-history-search"
				placeholder="搜索对话..."
				bind:value={searchQuery}
			/>
			<select
				class="gz-ai-chat-history-sort"
				value={sortStrategy}
				onchange={(e) => onSortChange?.((e.target as HTMLSelectElement).value as SortStrategy)}
			>
				<option value="recent">最近访问</option>
				<option value="created">创建时间</option>
				<option value="name">名称</option>
			</select>
		</div>

		<div class="gz-ai-chat-history-list">
			{#if filteredItems.length === 0}
				<div class="gz-ai-chat-history-empty">{searchQuery ? "无匹配结果" : "暂无历史对话"}</div>
			{:else}
				{#each groupedItems as group}
					<div class="gz-ai-chat-history-group-label">{group.label}</div>
					{#each group.items as item (item.file.path)}
						<div class="gz-ai-chat-history-item">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="gz-ai-chat-history-item-main" onclick={() => onSelect(item.file)}>
								{#if editingFile === item.file}
									<div class="gz-ai-chat-history-rename-row" onclick={(e: MouseEvent) => e.stopPropagation()}>
										<!-- svelte-ignore a11y_autofocus -->
										<input
											type="text"
											class="gz-ai-chat-history-rename-input"
											bind:value={editingText}
											autofocus
											onkeydown={(e: KeyboardEvent) => {
												if (e.key === "Enter") commitRename();
												if (e.key === "Escape") { editingFile = null; }
											}}
											onblur={commitRename}
										/>
									</div>
								{:else}
									<span class="gz-ai-chat-history-topic">{item.topic}</span>
								{/if}
								<span class="gz-ai-chat-history-date">{formatDate(item.date)}</span>
							</div>
							<div class="gz-ai-chat-history-actions">
								{#if onGenerateTitle}
									<button
										class="clickable-icon"
										onclick={(e: MouseEvent) => handleGenerateTitle(item, e)}
										disabled={generatingFile !== null}
										aria-label="AI 生成标题"
										title="AI 生成标题"
									>
										{#if generatingFile === item.file}
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gz-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
										{/if}
									</button>
								{/if}
								<button class="clickable-icon" onclick={(e: MouseEvent) => toggleRename(item, e)} aria-label="重命名" title="重命名">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
								</button>
								<button class="clickable-icon" onclick={(e: MouseEvent) => handleDelete(item, e)} aria-label="删除" title="删除">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
								</button>
							</div>
						</div>
					{/each}
				{/each}
			{/if}
		</div>

</div>
