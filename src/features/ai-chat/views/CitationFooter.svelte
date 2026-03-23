<script lang="ts">
	import type { App } from "obsidian";
	import type { CitationSource } from "../types";

	interface Props {
		citations: CitationSource[];
		app?: App;
	}

	let { citations, app }: Props = $props();
	let isOpen = $state(false);

	function openNote(path: string) {
		if (!app) return;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) {
			app.workspace.openLinkText(path, "", false);
		}
	}
</script>

{#if citations.length > 0}
	<details class="gz-ai-chat-citation-footer" open={isOpen}>
		<summary class="gz-ai-chat-citation-summary" onclick={() => isOpen = !isOpen}>
			{citations.length} 个引用来源
		</summary>
		<div class="gz-ai-chat-citation-list">
			{#each citations as cite}
				<button
					class="gz-ai-chat-citation-item"
					onclick={() => openNote(cite.path)}
					title={cite.chunk.slice(0, 200)}
				>
					<span class="gz-ai-chat-citation-index">[{cite.index}]</span>
					<span class="gz-ai-chat-citation-title">{cite.title}</span>
					<span class="gz-ai-chat-citation-path">{cite.path}</span>
				</button>
			{/each}
		</div>
	</details>
{/if}
