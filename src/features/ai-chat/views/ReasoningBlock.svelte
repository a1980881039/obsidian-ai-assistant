<script lang="ts">
	import type { ReasoningStep } from "../types";

	interface Props {
		steps: ReasoningStep[];
	}

	let { steps }: Props = $props();
	let isOpen = $state(false);

	let toolCallCount = $derived(steps.filter(s => s.type === "tool_call").length);
</script>

<details class="gz-ai-chat-reasoning-block" open={isOpen}>
	<summary class="gz-ai-chat-reasoning-summary" onclick={() => isOpen = !isOpen}>
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
		{toolCallCount} 个工具调用
	</summary>
	<div class="gz-ai-chat-reasoning-steps">
		{#each steps as step}
			{#if step.type === "tool_call"}
				<div class="gz-ai-chat-reasoning-step gz-ai-chat-reasoning-call">
					<span class="gz-ai-chat-reasoning-tool-name">{step.toolName}</span>
					{#if step.toolArgs && Object.keys(step.toolArgs).length > 0}
						<pre class="gz-ai-chat-reasoning-args">{JSON.stringify(step.toolArgs, null, 2)}</pre>
					{/if}
				</div>
			{:else if step.type === "tool_result"}
				<div class="gz-ai-chat-reasoning-step gz-ai-chat-reasoning-result">
					{#if step.durationMs}
						<span class="gz-ai-chat-reasoning-duration">{step.durationMs}ms</span>
					{/if}
					<pre class="gz-ai-chat-reasoning-output">{step.result}</pre>
				</div>
			{:else if step.type === "thinking"}
				<div class="gz-ai-chat-reasoning-step gz-ai-chat-reasoning-thinking">
					{step.content}
				</div>
			{/if}
		{/each}
	</div>
</details>
