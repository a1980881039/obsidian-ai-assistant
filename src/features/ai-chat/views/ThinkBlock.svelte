<script lang="ts">
	interface Props {
		content: string;
	}

	let { content }: Props = $props();
	let isOpen = $state(false);
</script>

<details class="gz-ai-chat-think-block" open={isOpen}>
	<summary class="gz-ai-chat-think-summary" onclick={() => isOpen = !isOpen}>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
		思考过程
	</summary>
	<div class="gz-ai-chat-think-content">{content}</div>
</details>
