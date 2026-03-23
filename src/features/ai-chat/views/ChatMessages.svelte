<script lang="ts">
	import type { App } from "obsidian";
	import type { ChatMessage } from "../types";
	import { AI_SENDER } from "../types";
	import ChatSingleMessage from "./ChatSingleMessage.svelte";

	import RelevantNotes from "./RelevantNotes.svelte";

	interface Props {
		messages: ChatMessage[];
		streamingText: string;
		isLoading: boolean;
		app?: App;
		onDelete?: (id: string) => void;
		onEdit?: (id: string, text: string) => void;
		onRegenerate?: (id: string) => void;

	}

	let { messages, streamingText, isLoading, app, onDelete, onEdit, onRegenerate }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();

	/** 用户是否手动上滚（距底部超过阈值） */
	let userScrolledUp = false;
	const SCROLL_THRESHOLD = 60;

	function isNearBottom(): boolean {
		if (!containerEl) return true;
		return containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		userScrolledUp = !isNearBottom();
	}

	// Auto-scroll: only when user hasn't scrolled up
	$effect(() => {
		messages.length;
		streamingText;
		if (containerEl && !userScrolledUp) {
			requestAnimationFrame(() => {
				containerEl!.scrollTop = containerEl!.scrollHeight;
			});
		}
	});

	// When new user message is sent (messages.length increases), reset to bottom
	let prevMsgCount = $state(0);
	$effect(() => {
		const len = messages.length;
		if (len > prevMsgCount && prevMsgCount > 0) {
			// New message added — check if it's a user message (scroll to bottom)
			const last = messages[len - 1];
			if (last && last.sender !== "AI") {
				userScrolledUp = false;
			}
		}
		prevMsgCount = len;
	});
</script>

<div class="gz-ai-chat-messages" bind:this={containerEl} onscroll={handleScroll}>
	{#if messages.length === 0 && !streamingText}
		<div class="gz-ai-chat-empty">
			{#if app}
				<RelevantNotes {app} />
			{/if}
		</div>
	{:else}
		{#each messages as msg (msg.id)}
			<ChatSingleMessage message={msg} {app} {onDelete} {onEdit} {onRegenerate} />
		{/each}

		<!-- Streaming message -->
		{#if streamingText}
			<ChatSingleMessage
				message={{
					id: "streaming",
					message: streamingText,
					sender: AI_SENDER,
					timestamp: "",
					isVisible: true,
				}}
				isStreaming={true}
				{app}
			/>
		{/if}

		<!-- Loading indicator -->
		{#if isLoading && !streamingText}
			<div class="gz-ai-chat-loading">
				<div class="gz-ai-chat-loading-dots">
					<span></span><span></span><span></span>
				</div>
			</div>
		{/if}
	{/if}
</div>
