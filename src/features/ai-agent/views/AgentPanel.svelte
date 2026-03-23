<script lang="ts">
	import { Notice, setIcon } from "obsidian";
	import type { App, TFile } from "obsidian";
	import type { AgentTemplate } from "../types";
	import type { AgentTemplateManager } from "../core/AgentTemplateManager";
	import type { CanvasEngine } from "../core/CanvasEngine";

	function setIconAction(node: HTMLElement, iconId: string) {
		setIcon(node, iconId);
		return {
			update(newIconId: string) { setIcon(node, newIconId); },
		};
	}

	interface Props {
		app: App;
		templateManager: AgentTemplateManager;
		canvasEngine: CanvasEngine;
		getActiveCanvasFile: () => TFile | null;
		onInsertAgent: (templateId: string) => void;
		onRunWorkflow: (input: string) => void;
	}

	let {
		app,
		templateManager,
		canvasEngine,
		getActiveCanvasFile,
		onInsertAgent,
		onRunWorkflow,
	}: Props = $props();

	let templates = $state<AgentTemplate[]>([]);
	let showEditor = $state(false);
	let editingTemplate = $state<Partial<AgentTemplate>>({});
	let editingId = $state<string | null>(null);
	let workflowInput = $state("");

	async function refreshTemplates() {
		templates = await templateManager.loadTemplates();
	}

	refreshTemplates();

	function startCreate() {
		editingId = null;
		editingTemplate = {
			name: "",
			role: "",
			systemPrompt: "",
			modelKey: "",
			enabledTools: [],
			color: "4",
			icon: "bot",
		};
		showEditor = true;
	}

	function startEdit(tpl: AgentTemplate) {
		editingId = tpl.id;
		editingTemplate = { ...tpl };
		showEditor = true;
	}

	async function saveTemplate() {
		if (!editingTemplate.name?.trim()) {
			new Notice("请输入智能体名称");
			return;
		}
		if (editingId) {
			await templateManager.updateTemplate(editingId, editingTemplate);
		} else {
			await templateManager.createTemplate(editingTemplate as any);
		}
		showEditor = false;
		await refreshTemplates();
		new Notice("智能体模板已保存");
	}

	async function deleteTemplate(id: string) {
		await templateManager.deleteTemplate(id);
		await refreshTemplates();
		new Notice("智能体模板已删除");
	}

	function handleInsert(templateId: string) {
		const file = getActiveCanvasFile();
		if (!file) {
			new Notice("请先打开一个白板文件");
			return;
		}
		onInsertAgent(templateId);
	}

	function handleRunWorkflow() {
		const file = getActiveCanvasFile();
		if (!file) {
			new Notice("请先打开一个白板文件");
			return;
		}
		onRunWorkflow(workflowInput || "请开始执行任务");
	}
</script>

<div class="gz-agent-panel">
	<div class="gz-agent-panel-header">
		<h4>AI Agent 综合体</h4>
		<button class="gz-agent-btn-icon" onclick={startCreate} aria-label="新建智能体">
			<span class="gz-agent-icon" use:setIconAction={"plus"}></span>
		</button>
	</div>

	{#if showEditor}
		<div class="gz-agent-editor">
			<div class="gz-agent-field">
				<label>名称</label>
				<input type="text" bind:value={editingTemplate.name} placeholder="如：产品经理" />
			</div>
			<div class="gz-agent-field">
				<label>角色描述</label>
				<input type="text" bind:value={editingTemplate.role} placeholder="如：负责需求分析和产品设计" />
			</div>
			<div class="gz-agent-field">
				<label>系统提示词</label>
				<textarea bind:value={editingTemplate.systemPrompt} rows="4" placeholder="定义智能体的行为和能力..."></textarea>
			</div>
			<div class="gz-agent-field">
				<label>模型 Key</label>
				<input type="text" bind:value={editingTemplate.modelKey} placeholder="如：gpt-4o|openai" />
			</div>
			<div class="gz-agent-field">
				<label>图标</label>
				<input type="text" bind:value={editingTemplate.icon} placeholder="Lucide 图标名" />
			</div>
			<div class="gz-agent-field">
				<label>颜色编号</label>
				<input type="text" bind:value={editingTemplate.color} placeholder="1-6" />
			</div>
			<div class="gz-agent-editor-actions">
				<button class="mod-cta" onclick={saveTemplate}>保存</button>
				<button onclick={() => showEditor = false}>取消</button>
			</div>
		</div>
	{/if}

	<div class="gz-agent-template-section">
		<h5>智能体模板</h5>
		{#if templates.length === 0}
			<p class="gz-agent-empty">暂无模板，点击 + 创建</p>
		{:else}
			{#each templates as tpl (tpl.id)}
				<div class="gz-agent-card">
					<div class="gz-agent-card-header">
						<span class="gz-agent-card-icon" use:setIconAction={tpl.icon || "bot"}></span>
						<span class="gz-agent-card-name">{tpl.name}</span>
					</div>
					<p class="gz-agent-card-role">{tpl.role}</p>
					<div class="gz-agent-card-actions">
						<button onclick={() => handleInsert(tpl.id)}>插入白板</button>
						<button onclick={() => startEdit(tpl)}>编辑</button>
						<button class="mod-warning" onclick={() => deleteTemplate(tpl.id)}>删除</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<div class="gz-agent-workflow-section">
		<h5>运行工作流</h5>
		<textarea
			class="gz-agent-workflow-input"
			bind:value={workflowInput}
			rows="3"
			placeholder="输入初始任务描述..."
		></textarea>
		<button class="mod-cta gz-agent-run-btn" onclick={handleRunWorkflow}>
			运行白板工作流
		</button>
	</div>
</div>

<style>
	/* Svelte action helper for setIcon */
</style>
