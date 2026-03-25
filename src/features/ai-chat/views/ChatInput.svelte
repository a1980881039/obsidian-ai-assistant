<script lang="ts">
	import type { App, TFile, TFolder } from "obsidian";
	import type { Mention, ImageAttachment } from "../types";
	import type { ContextItem } from "../types";
	import MentionPopup from "./MentionPopup.svelte";
	import ImagePreview from "./ImagePreview.svelte";

	interface StructuredInput {
		text: string;
		mentions: Mention[];
		images: ImageAttachment[];
		contextItems: ContextItem[];
	}

	interface Props {
		app?: App;
		contextItems: ContextItem[];
		isLoading: boolean;
		onSend: (text: string, structured?: StructuredInput) => void;
		onInputChange?: (hasContent: boolean) => void;
		onContextRemove: (path: string) => void;
		onContextAdd?: (item: ContextItem) => void;
	}

	let { app, contextItems, isLoading, onSend, onInputChange, onContextRemove, onContextAdd }: Props = $props();

	let inputText = $state("");
	let textareaEl: HTMLTextAreaElement | undefined = $state();
	let images = $state<ImageAttachment[]>([]);

	let mentionVisible = $state(false);
	let mentionQuery = $state("");
	let mentionStartIdx = $state(-1);
	let mentionPopup: { handleKeydown: (e: KeyboardEvent) => boolean } | undefined = $state();

	function extractMentions(text: string): Mention[] {
		const mentions: Mention[] = [];
		const regex = /@\[\[([^\]]+)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = regex.exec(text)) !== null) {
			mentions.push({ type: "note", value: m[1], displayName: m[1] });
		}
		return mentions;
	}
	export function submit() {
		if (!inputText.trim() || isLoading) return;
		const text = inputText.trim();
		const mentions = extractMentions(text);
		onSend(text, { text, mentions, images: [...images], contextItems: [...contextItems] });
		inputText = "";
		images = [];
		if (textareaEl) textareaEl.style.height = "auto";
		onInputChange?.(false);
	}

	export function addImage(file: File) {
		const reader = new FileReader();
		reader.onload = () => {
			images = [...images, {
				id: crypto.randomUUID(),
				data: reader.result as string,
				name: file.name || "uploaded-image",
				mimeType: file.type,
			}];
			onInputChange?.(true);
		};
		reader.readAsDataURL(file);
	}

	export function hasContent(): boolean {
		return !!(inputText.trim() || images.length > 0);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (mentionVisible && mentionPopup?.handleKeydown(e)) return;
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
		if (e.key === "Escape" && mentionVisible) {
			mentionVisible = false;
		}
	}

	function handleInput() {
		if (!textareaEl) return;
		textareaEl.style.height = "auto";
		textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + "px";
		onInputChange?.(!!inputText.trim() || images.length > 0);
		const cursorPos = textareaEl.selectionStart;
		const textBefore = inputText.slice(0, cursorPos);
		const atIdx = textBefore.lastIndexOf("@");
		if (atIdx >= 0 && (atIdx === 0 || textBefore[atIdx - 1] === " " || textBefore[atIdx - 1] === "\n")) {
			const query = textBefore.slice(atIdx + 1);
			if (!query.includes("\n") && query.length <= 40) {
				mentionQuery = query;
				mentionStartIdx = atIdx;
				mentionVisible = query.length > 0;
				return;
			}
		}
		mentionVisible = false;
	}
	function handleMentionSelect(item: { type: string; value: string; displayName: string }) {
		if (!textareaEl) return;
		const before = inputText.slice(0, mentionStartIdx);
		const after = inputText.slice(textareaEl.selectionStart);
		const mention = `@[[${item.displayName}]] `;
		inputText = before + mention + after;
		mentionVisible = false;
		requestAnimationFrame(() => {
			if (textareaEl) {
				const pos = before.length + mention.length;
				textareaEl.focus();
				textareaEl.setSelectionRange(pos, pos);
			}
		});
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;

		// Check for pasted text that looks like a vault path
		const text = e.clipboardData?.getData("text/plain")?.trim();
		if (text && app && !text.includes("\n") && text.length < 300) {
			const resolved = resolveVaultPath(text);
			if (resolved) {
				e.preventDefault();
				onContextAdd?.(resolved);
				return;
			}
		}

		for (const item of items) {
			if (item.type.startsWith("image/")) {
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;
				addImage(file);
				break;
			}
		}
	}

	/** Resolve a pasted/dropped path to a vault file or folder */
	export function resolveVaultPath(path: string): ContextItem | null {
		if (!app) return null;
		// Strip .md extension for matching, then try with and without
		const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
		const af = app.vault.getAbstractFileByPath(cleanPath)
			|| app.vault.getAbstractFileByPath(cleanPath + ".md");
		if (!af) return null;
		if ("children" in af) {
			return { type: "folder", path: af.path, displayName: af.path || "/" };
		}
		return { type: "note", path: af.path, displayName: (af as TFile).basename };
	}

	function removeImage(id: string) {
		images = images.filter(img => img.id !== id);
		onInputChange?.(!!inputText.trim() || images.length > 0);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gz-ai-chat-input-area">
	{#if contextItems.length > 0}
		<div class="gz-ai-chat-context-row">
			{#each contextItems as item (item.path + (item.selectionContent ?? ""))}
				<span class="gz-ai-chat-context-pill" class:gz-ai-chat-context-pill-selection={item.type === "selection"}>
					<button class="gz-ai-chat-context-pill-remove" onclick={() => onContextRemove(item.path)}>×</button>
					{#if item.type === "note"}
						<svg class="gz-ai-chat-context-pill-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
					{/if}
					{#if item.type === "active-note"}
						<svg class="gz-ai-chat-context-pill-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
					{/if}
					{#if item.type === "folder"}
						<svg class="gz-ai-chat-context-pill-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>
					{/if}
					{#if item.type === "selection"}
						<svg class="gz-ai-chat-context-pill-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/></svg>
					{/if}
					{item.displayName}
				</span>
			{/each}
		</div>
	{/if}
	<ImagePreview {images} onRemove={removeImage} />
	<div class="gz-ai-chat-input-wrapper">
		<textarea
			bind:this={textareaEl}
			bind:value={inputText}
			onkeydown={handleKeydown}
			oninput={handleInput}
			onpaste={handlePaste}
			placeholder="输入消息..."
			rows="1"
			class="gz-ai-chat-textarea"
			disabled={false}
		></textarea>
	</div>
	{#if app && mentionVisible}
		<MentionPopup
			bind:this={mentionPopup}
			{app}
			query={mentionQuery}
			visible={mentionVisible}
			onSelect={handleMentionSelect}
			onClose={() => mentionVisible = false}
		/>
	{/if}
</div>
