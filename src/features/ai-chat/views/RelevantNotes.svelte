<script lang="ts">
	import type { App, TFile } from "obsidian";

	interface Props {
		app: App;
	}

	let { app }: Props = $props();

	let relevantNotes = $state<TFile[]>([]);

	function refreshNotes() {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile || !activeFile.path.endsWith(".md")) {
			relevantNotes = [];
			return;
		}

		const resolved = app.metadataCache.resolvedLinks;
		const paths = new Set<string>();

		// Outgoing links
		const outgoing = resolved[activeFile.path];
		if (outgoing) {
			for (const p of Object.keys(outgoing)) {
				if (p.endsWith(".md")) paths.add(p);
			}
		}

		// Backlinks
		for (const [src, links] of Object.entries(resolved)) {
			if (src === activeFile.path) continue;
			if (links[activeFile.path] !== undefined && src.endsWith(".md")) {
				paths.add(src);
			}
		}

		const files: TFile[] = [];
		for (const p of paths) {
			const f = app.vault.getAbstractFileByPath(p);
			if (f && "stat" in f) files.push(f as TFile);
			if (files.length >= 10) break;
		}
		relevantNotes = files;
	}

	refreshNotes();

	$effect(() => {
		const ref = app.workspace.on("active-leaf-change", () => refreshNotes());
		return () => app.workspace.offref(ref);
	});

	function handleClick(file: TFile) {
		app.workspace.openLinkText(file.path, "", false);
	}
</script>

<div class="gz-ai-chat-relevant-notes">
	<div class="gz-ai-chat-section-title">相关笔记</div>
	{#if relevantNotes.length === 0}
		<div class="gz-ai-chat-relevant-empty">暂无相关笔记</div>
	{:else}
		{#each relevantNotes as file (file.path)}
			<button class="gz-ai-chat-relevant-item" onclick={() => handleClick(file)}>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="gz-ai-chat-relevant-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
				<span class="gz-ai-chat-relevant-name">{file.basename}</span>
			</button>
		{/each}
	{/if}
</div>
