<script lang="ts">
	import type { ChatMessage } from "../types";

	interface Props {
		messages: ChatMessage[];
		maxTokens?: number;
	}

	let { messages, maxTokens = 128000 }: Props = $props();

	// Rough token estimate: ~1.2 tokens per Chinese char, ~0.75 per English word
	let estimatedTokens = $derived(() => {
		let total = 0;
		for (const msg of messages) {
			const text = msg.message;
			const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
			const rest = text.length - cjk;
			total += Math.ceil(cjk * 1.2 + rest * 0.4);
		}
		return total;
	});

	let tokens = $derived(estimatedTokens());
	let ratio = $derived(tokens / maxTokens);
	let colorClass = $derived(
		ratio >= 0.9 ? "gz-ai-chat-token-danger" :
		ratio >= 0.75 ? "gz-ai-chat-token-warn" : ""
	);

	function formatTokens(n: number): string {
		return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	}
</script>

{#if tokens > 0}
	<span class="gz-ai-chat-token-counter {colorClass}" title="估算 token 数">
		~{formatTokens(tokens)} / {formatTokens(maxTokens)}
	</span>
{/if}
