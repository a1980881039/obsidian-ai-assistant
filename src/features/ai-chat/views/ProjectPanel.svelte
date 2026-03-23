<script lang="ts">
	import type { Project } from "../project/ProjectManager";

	interface Props {
		projects: Project[];
		onClose: () => void;
		onCreate: (name: string, folder: string) => void;
		onDelete: (name: string) => void;
	}

	let { projects, onClose, onCreate, onDelete }: Props = $props();

	let newName = $state("");
	let newFolder = $state("");

	function handleCreate() {
		if (!newName.trim() || !newFolder.trim()) return;
		onCreate(newName.trim(), newFolder.trim());
		newName = "";
		newFolder = "";
	}
</script>

<div class="gz-ai-chat-history-overlay" onclick={onClose} role="presentation">
	<div class="gz-ai-chat-history-panel" onclick={(e: MouseEvent) => e.stopPropagation()} role="presentation">
		<div class="gz-ai-chat-history-header">
			<h4>项目管理</h4>
			<button class="clickable-icon" onclick={onClose} aria-label="关闭">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>

		<div class="gz-ai-chat-project-form">
			<input class="gz-ai-chat-project-input" bind:value={newName} placeholder="项目名称" />
			<input class="gz-ai-chat-project-input" bind:value={newFolder} placeholder="文件夹路径" />
			<button class="gz-ai-chat-edit-btn" onclick={handleCreate}>创建</button>
		</div>

		<div class="gz-ai-chat-history-list">
			{#if projects.length === 0}
				<div class="gz-ai-chat-history-empty">暂无项目</div>
			{:else}
				{#each projects as project}
					<div class="gz-ai-chat-project-item">
						<div class="gz-ai-chat-project-info">
							<span class="gz-ai-chat-project-name">{project.name}</span>
							<span class="gz-ai-chat-project-folder">{project.folder}</span>
						</div>
						<button class="gz-ai-chat-action-btn clickable-icon" onclick={() => onDelete(project.name)} title="删除">
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>
