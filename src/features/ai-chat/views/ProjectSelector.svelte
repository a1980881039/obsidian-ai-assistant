<script lang="ts">
	import type { Project } from "../project/ProjectManager";

	interface Props {
		projects: Project[];
		activeProjectName: string | null;
		onSelect: (name: string | null) => void;
		onManage: () => void;
	}

	let { projects, activeProjectName, onSelect, onManage }: Props = $props();

	function handleChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value === "__manage__") {
			onManage();
			return;
		}
		onSelect(value === "" ? null : value);
	}
</script>

<select
	class="gz-ai-chat-project-select dropdown"
	value={activeProjectName ?? ""}
	onchange={handleChange}
	title="项目"
>
	<option value="">无项目</option>
	{#each projects as project}
		<option value={project.name}>{project.name}</option>
	{/each}
	<option value="__manage__">管理项目...</option>
</select>
