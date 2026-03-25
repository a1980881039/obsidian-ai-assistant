<script lang="ts">
	import { Component, MarkdownRenderer, type App } from "obsidian";
	import type { ChatMessage } from "../types";
	import { USER_SENDER } from "../types";
	import ThinkBlock from "./ThinkBlock.svelte";
	import ReasoningBlock from "./ReasoningBlock.svelte";
	import CitationFooter from "./CitationFooter.svelte";

	interface Props {
		message: ChatMessage;
		isStreaming?: boolean;
		app?: App;
		onDelete?: (id: string) => void;
		onEdit?: (id: string, text: string) => void;
		onRegenerate?: (id: string) => void;
	}

	let { message, isStreaming = false, app, onDelete, onEdit, onRegenerate }: Props = $props();

	let isUser = $derived(message.sender === USER_SENDER);
	let isCompactSummary = $derived(message.id.startsWith("compact-"));
	let isEditing = $state(false);
	let editText = $state("");
	let copySuccess = $state(false);
	let contentEl: HTMLDivElement | undefined = $state();

	// Extract <think> blocks from message
	let thinkBlocks = $derived(() => {
		const blocks: string[] = [];
		const regex = /<think>([\s\S]*?)<\/think>/g;
		let m: RegExpExecArray | null;
		while ((m = regex.exec(message.message)) !== null) {
			blocks.push(m[1].trim());
		}
		return blocks;
	});

	let displayText = $derived(
		message.message.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
	);

	/** 将 AI 返回的 LaTeX 格式转为 Obsidian 支持的格式 */
	function convertLatex(text: string): string {
		// \[...\] → $$...$$（块级公式）
		// \(...\) → $...$（行内公式）
		return text
			.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
			.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
	}

	// Render markdown when content changes
	$effect(() => {
		if (!contentEl || message.isErrorMessage || isUser) return;
		const text = convertLatex(displayText);
		const component = new Component();
		component.load();
		contentEl.empty();
		if (app) {
			MarkdownRenderer.render(app, text, contentEl, "", component);
		} else {
			contentEl.textContent = text;
		}
		return () => component.unload();
	});

	function startEdit() {
		editText = message.message;
		isEditing = true;
	}

	function saveEdit() {
		if (editText.trim() && onEdit) {
			onEdit(message.id, editText.trim());
		}
		isEditing = false;
	}

	function cancelEdit() {
		isEditing = false;
	}

	function copyMessage() {
		navigator.clipboard.writeText(message.message);
		copySuccess = true;
		setTimeout(() => { copySuccess = false; }, 1500);
	}

	/** Render user message with @[[note]] as clickable pills */
	function renderUserMessage(text: string): string {
		return text.replace(/@\[\[(.+?)\]\]/g, '<span class="gz-ai-chat-mention-pill" data-note="$1">@$1</span>');
	}
</script>

<div
	class="gz-ai-chat-message"
	class:gz-ai-chat-message-user={isUser}
	class:gz-ai-chat-message-ai={!isUser}
	class:gz-ai-chat-message-error={message.isErrorMessage}
	class:gz-ai-chat-message-streaming={isStreaming}
>
	<div class="gz-ai-chat-message-content">
		{#if isUser && message.contextItems && message.contextItems.length > 0}
			<div class="gz-ai-chat-message-context-badges">
				{#each message.contextItems as ctx}
					<span class="gz-ai-chat-context-badge">{ctx.displayName}</span>
				{/each}
			</div>
		{/if}

		{#if message.isErrorMessage}
			<div class="gz-ai-chat-message-error-text">{message.message}</div>
		{:else if isEditing}
			<div class="gz-ai-chat-edit-area">
				<textarea class="gz-ai-chat-edit-textarea" bind:value={editText} rows="3"></textarea>
				<div class="gz-ai-chat-edit-actions">
					<button class="gz-ai-chat-edit-btn" onclick={saveEdit}>保存</button>
					<button class="gz-ai-chat-edit-btn" onclick={cancelEdit}>取消</button>
				</div>
			</div>
		{:else if isUser}
			{#if message.images && message.images.length > 0}
				<div class="gz-ai-chat-message-images">
					{#each message.images as img}
						<img class="gz-ai-chat-message-image" src={img.data} alt={img.name} title={img.name} />
					{/each}
				</div>
			{/if}
			<div class="gz-ai-chat-message-text">{@html renderUserMessage(message.message)}</div>
		{:else if isCompactSummary}
			<details class="gz-ai-chat-compact-summary">
				<summary>历史摘要（点击展开）</summary>
				<div class="gz-ai-chat-message-text">{message.message.replace("[历史摘要]\n", "")}</div>
			</details>
		{:else}
			<!-- Think blocks (DeepSeek/Claude reasoning) -->
			{#each thinkBlocks() as block}
				<ThinkBlock content={block} />
			{/each}
			<!-- Reasoning steps (Agent tool calls) -->
			{#if message.reasoningSteps && message.reasoningSteps.length > 0}
				<ReasoningBlock steps={message.reasoningSteps} />
			{/if}
			<div class="gz-ai-chat-message-markdown markdown-rendered" bind:this={contentEl}></div>
			{#if message.citations && message.citations.length > 0}
				<CitationFooter citations={message.citations} {app} />
			{/if}
		{/if}

		<!-- Action buttons & timestamp row -->
		{#if !isStreaming && !isEditing && !message.isErrorMessage}
			<div class="gz-ai-chat-message-footer">
				{#if message.timestamp}
					<span class="gz-ai-chat-message-timestamp">{message.timestamp}</span>
				{/if}
				<div class="gz-ai-chat-message-actions">
					{#if !isUser && message.citations && message.citations.length > 0}
						<button class="gz-ai-chat-action-btn clickable-icon" onclick={() => {}} data-tooltip="来源" aria-label="来源">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
						</button>
					{/if}
					<button class="gz-ai-chat-action-btn clickable-icon" onclick={copyMessage} data-tooltip="复制" aria-label="复制">
						{#if copySuccess}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						{/if}
					</button>
					{#if isUser && onEdit}
						<button class="gz-ai-chat-action-btn clickable-icon" onclick={startEdit} data-tooltip="编辑" aria-label="编辑">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
						</button>
					{/if}
					{#if !isUser && onRegenerate}
						<button class="gz-ai-chat-action-btn clickable-icon" onclick={() => onRegenerate?.(message.id)} data-tooltip="重新生成" aria-label="重新生成">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
						</button>
					{/if}
					{#if onDelete}
						<button class="gz-ai-chat-action-btn clickable-icon" onclick={() => onDelete?.(message.id)} data-tooltip="删除" aria-label="删除">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
