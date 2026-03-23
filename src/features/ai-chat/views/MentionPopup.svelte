<script lang="ts">
	import type { App, TFile } from "obsidian";

	interface MentionItem {
		type: "note" | "tag" | "folder";
		value: string;
		displayName: string;
	}

	interface Props {
		app: App;
		query: string;
		visible: boolean;
		onSelect: (item: MentionItem) => void;
		onClose: () => void;
	}

	let { app, query, visible, onSelect, onClose }: Props = $props();

	let selectedIndex = $state(0);
	let items = $derived(searchItems(query));

	function searchItems(q: string): MentionItem[] {
		if (!q) return [];
		const lower = q.toLowerCase();
		const results: MentionItem[] = [];

		const files = app.vault.getMarkdownFiles();
		for (const file of files) {
			if (results.length >= 10) break;
			if (file.basename.toLowerCase().includes(lower) || file.path.toLowerCase().includes(lower)) {
				results.push({ type: "note", value: file.path, displayName: file.basename });
			}
		}

		const tagCache = (app.metadataCache as any).getTags?.() as Record<string, number> | undefined;
		if (tagCache) {
			for (const tag of Object.keys(tagCache)) {
				if (results.length >= 15) break;
				if (tag.toLowerCase().includes(lower)) {
					results.push({ type: "tag", value: tag, displayName: tag });
				}
			}
		}

		const folders = app.vault.getAllFolders();
		for (const folder of folders) {
			if (results.length >= 15) break;
			if (folder.path.toLowerCase().includes(lower)) {
				results.push({ type: "folder", value: folder.path, displayName: folder.path });
			}
		}

		return results;
	}

	$effect(() => {
		items;
		selectedIndex = 0;
	});

	export function handleKeydown(e: KeyboardEvent): boolean {
		if (!visible || items.length === 0) return false;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % items.length;
			return true;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + items.length) % items.length;
			return true;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			onSelect(items[selectedIndex]);
			return true;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
			return true;
		}
		return false;
	}
</script>

{#if visible && items.length > 0}
	<div class="gz-ai-chat-mention-popup">
		{#each items as item, i}
			<button
				class="gz-ai-chat-mention-item"
				class:gz-ai-chat-mention-item-active={i === selectedIndex}
				onclick={() => onSelect(item)}
				onmouseenter={() => selectedIndex = i}
			>
				<span class="gz-ai-chat-mention-icon">
					{#if item.type === "note"}📄{:else if item.type === "tag"}🏷️{:else}📁{/if}
				</span>
				<span class="gz-ai-chat-mention-name">{item.displayName}</span>
			</button>
		{/each}
	</div>
{/if}
