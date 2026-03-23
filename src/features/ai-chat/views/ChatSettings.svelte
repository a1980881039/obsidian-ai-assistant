<script lang="ts">
	import type { UserSystemPrompt, SessionOverrides, CustomModel } from "../types";
	import { initSessionOverrides } from "./chatActions";

	interface Props {
		overrides: SessionOverrides;
		systemPrompts: UserSystemPrompt[];
		models: CustomModel[];
		selectedModelKey: string;
		onOverridesChange: (overrides: SessionOverrides) => void;
		onClose: () => void;
	}

	let { overrides, systemPrompts, models, selectedModelKey, onOverridesChange, onClose }: Props = $props();

	let local = $state<SessionOverrides>({});
	$effect(() => {
		local = { ...overrides };
	});

	let topPEnabled = $state(false);
	let freqPenEnabled = $state(false);
	let reasoningEnabled = $state(false);
	$effect(() => {
		topPEnabled = overrides.topP != null;
		freqPenEnabled = overrides.frequencyPenalty != null;
		reasoningEnabled = overrides.reasoningEffort != null;
	});

	function emit() {
		onOverridesChange({ ...local });
	}

	function handleReset() {
		const defaults = initSessionOverrides(models, selectedModelKey);
		local = { ...defaults };
		topPEnabled = defaults.topP != null;
		freqPenEnabled = defaults.frequencyPenalty != null;
		reasoningEnabled = defaults.reasoningEffort != null;
		onOverridesChange({ ...defaults });
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="gz-ai-chat-settings-backdrop" onclick={onClose}></div>
<div class="gz-ai-chat-settings-popup">
	<div class="gz-ai-chat-settings-header">
		<span class="gz-ai-chat-settings-title">会话设置</span>
		<button class="clickable-icon" onclick={onClose} aria-label="关闭">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
		</button>
	</div>

	<div class="gz-ai-chat-settings-body">
		<!-- System Prompt -->
		<label class="gz-ai-chat-settings-label">
			System Prompt
			<select class="dropdown gz-ai-chat-settings-select" value={local.systemPromptTitle ?? ""} onchange={(e) => { local.systemPromptTitle = (e.target as HTMLSelectElement).value || undefined; emit(); }}>
				<option value="">默认</option>
				{#each systemPrompts as sp}
					<option value={sp.title}>{sp.title}</option>
				{/each}
			</select>
		</label>

		<!-- Token Limit -->
		<label class="gz-ai-chat-settings-label">
			Token Limit: {local.maxTokens ?? 4096}
			<input type="range" min="256" max="128000" step="256" value={local.maxTokens ?? 4096} oninput={(e) => { local.maxTokens = Number((e.target as HTMLInputElement).value); emit(); }} />
		</label>

		<!-- Temperature -->
		<label class="gz-ai-chat-settings-label">
			Temperature: {(local.temperature ?? 0.7).toFixed(1)}
			<input type="range" min="0" max="2" step="0.1" value={local.temperature ?? 0.7} oninput={(e) => { local.temperature = Number((e.target as HTMLInputElement).value); emit(); }} />
		</label>

		<!-- Top-P -->
		<label class="gz-ai-chat-settings-label">
			<span class="gz-ai-chat-settings-toggle-row">
				<input type="checkbox" bind:checked={topPEnabled} onchange={() => { if (!topPEnabled) { local.topP = null; } else { local.topP = 1; } emit(); }} />
				Top-P: {topPEnabled ? (local.topP ?? 1).toFixed(2) : "禁用"}
			</span>
			{#if topPEnabled}
				<input type="range" min="0" max="1" step="0.05" value={local.topP ?? 1} oninput={(e) => { local.topP = Number((e.target as HTMLInputElement).value); emit(); }} />
			{/if}
		</label>

		<!-- Frequency Penalty -->
		<label class="gz-ai-chat-settings-label">
			<span class="gz-ai-chat-settings-toggle-row">
				<input type="checkbox" bind:checked={freqPenEnabled} onchange={() => { if (!freqPenEnabled) { local.frequencyPenalty = null; } else { local.frequencyPenalty = 0; } emit(); }} />
				Frequency Penalty: {freqPenEnabled ? (local.frequencyPenalty ?? 0).toFixed(1) : "禁用"}
			</span>
			{#if freqPenEnabled}
				<input type="range" min="0" max="2" step="0.1" value={local.frequencyPenalty ?? 0} oninput={(e) => { local.frequencyPenalty = Number((e.target as HTMLInputElement).value); emit(); }} />
			{/if}
		</label>

		<!-- Reasoning Effort -->
		<label class="gz-ai-chat-settings-label">
			<span class="gz-ai-chat-settings-toggle-row">
				<input type="checkbox" bind:checked={reasoningEnabled} onchange={() => { if (!reasoningEnabled) { local.reasoningEffort = null; } else { local.reasoningEffort = "medium"; } emit(); }} />
				Reasoning Effort: {reasoningEnabled ? local.reasoningEffort : "禁用"}
			</span>
			{#if reasoningEnabled}
				<select class="dropdown gz-ai-chat-settings-select" value={local.reasoningEffort ?? "medium"} onchange={(e) => { local.reasoningEffort = (e.target as HTMLSelectElement).value as "low"|"medium"|"high"; emit(); }}>
					<option value="low">low</option>
					<option value="medium">medium</option>
					<option value="high">high</option>
				</select>
			{/if}
		</label>
	</div>

	<div class="gz-ai-chat-settings-footer">
		<button class="gz-ai-chat-settings-reset" onclick={handleReset}>重置为默认</button>
	</div>
</div>
