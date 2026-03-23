<script lang="ts">
	import type { ImageAttachment } from "../types";

	interface Props {
		images: ImageAttachment[];
		onRemove: (id: string) => void;
	}

	let { images, onRemove }: Props = $props();
</script>

{#if images.length > 0}
	<div class="gz-ai-chat-image-preview">
		{#each images as img (img.id)}
			<div class="gz-ai-chat-image-thumb">
				<img src={img.data} alt={img.name} />
				<button class="gz-ai-chat-image-remove clickable-icon" onclick={() => onRemove(img.id)} title="移除">
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
