import { Modal, Notice, Setting, setIcon, setTooltip } from "obsidian";
import type SuperPlugin from "../../../main";
import type { AIChatSettings, ModelConfig } from "../types";
import { PROVIDER_META } from "../providers/providerConfig";
import { testModelConnection } from "../providers/modelTester";
import { findProvider } from "../types";
import { decryptKey } from "../providers/encryptionService";

/**
 * ModelConfig 编辑弹窗。
 * 用于编辑单个模型的参数（temperature、maxTokens 等）和能力。
 */
export class ModelEditModal extends Modal {
	private plugin: SuperPlugin;
	private s: AIChatSettings;
	private model: ModelConfig;
	private isNew: boolean;
	private onSaved: () => void;
	private snapshot: string;

	constructor(
		plugin: SuperPlugin,
		s: AIChatSettings,
		model: ModelConfig,
		isNew: boolean,
		onSaved: () => void,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.s = s;
		this.model = model;
		this.isNew = isNew;
		this.onSaved = onSaved;
		this.snapshot = JSON.stringify(model);
	}

	onOpen(): void {
		const { contentEl, model } = this;
		contentEl.addClass("gz-model-edit-modal");
		contentEl.createEl("h3", { text: this.isNew ? "添加模型" : `编辑模型 — ${model.name || "(未命名)"}` });
		this.renderFields();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderFields(): void {
		const { contentEl, model, plugin, s } = this;

		// 模型名称（显示名）
		new Setting(contentEl)
			.setName("显示名称")
			.setDesc("在 UI 中显示的名称")
			.addText((t) => t.setPlaceholder("model-name").setValue(model.name).onChange((v) => { model.name = v; }));

		// 实际模型 ID
		new Setting(contentEl)
			.setName("模型 ID")
			.setDesc("API 请求中使用的模型 ID，如 gpt-4o、claude-sonnet-4-20250514")
			.addText((t) => t.setPlaceholder("gpt-4o").setValue(model.model).onChange((v) => { model.model = v; }));

		// Provider 信息（只读）
		const meta = PROVIDER_META[model.provider];
		new Setting(contentEl)
			.setName("Provider")
			.setDesc(meta?.label || model.provider);

		// 启用
		new Setting(contentEl)
			.setName("启用")
			.addToggle((tg) => tg.setValue(model.enabled).onChange((v) => { model.enabled = v; }));

		// 流式输出
		new Setting(contentEl)
			.setName("流式输出")
			.addToggle((tg) => tg.setValue(model.stream ?? true).onChange((v) => { model.stream = v; }));

		// ── Model Capabilities ──
		const capsSection = contentEl.createDiv({ cls: "gz-model-edit-section" });
		capsSection.createDiv({ text: "Model Capabilities", cls: "gz-model-edit-section-title" });
		const caps = model.capabilities || { reasoning: false, vision: false, websearch: false };
		if (!model.capabilities) model.capabilities = caps;
		const capsRow = capsSection.createDiv({ cls: "gz-model-caps-row" });
		for (const [key, label] of [["reasoning", "Reasoning"], ["vision", "Vision"], ["websearch", "Websearch"]] as const) {
			const lbl = capsRow.createEl("label");
			const cb = lbl.createEl("input", { type: "checkbox" });
			cb.checked = caps[key];
			cb.addEventListener("change", () => { caps[key] = cb.checked; });
			lbl.appendText(label);
		}

		// 自动检测按钮
		const autoDetectBtn = capsSection.createEl("button", { text: "自动检测", cls: "gz-provider-action-btn" });
		autoDetectBtn.addEventListener("click", async () => {
			const { detectCapabilities } = await import("../providers/modelCapabilities");
			const detected = detectCapabilities(model.model || model.name);
			caps.reasoning = detected.reasoning;
			caps.vision = detected.vision;
			// 重新渲染 checkboxes
			const checkboxes = capsRow.querySelectorAll("input[type=checkbox]");
			(checkboxes[0] as HTMLInputElement).checked = caps.reasoning;
			(checkboxes[1] as HTMLInputElement).checked = caps.vision;
			(checkboxes[2] as HTMLInputElement).checked = caps.websearch;
			new Notice(`已检测: Reasoning=${detected.reasoning}, Vision=${detected.vision}`);
		});

		// ── Model Parameters ──
		const paramSection = contentEl.createDiv({ cls: "gz-model-edit-section" });

		this.renderSliderParam(paramSection, "Token limit", model.maxTokens ?? 4096, 256, 128000, 256, false,
			(v) => { model.maxTokens = v; });

		this.renderSliderParam(paramSection, "Temperature", model.temperature ?? 0.1, 0, 2, 0.1, false,
			(v) => { model.temperature = v; });

		this.renderSliderParam(paramSection, "Top-P", model.topP ?? 1, 0, 1, 0.05, true,
			(v) => { model.topP = v; }, model.topP == null, () => { model.topP = undefined; });

		this.renderSliderParam(paramSection, "Frequency Penalty", model.frequencyPenalty ?? 0, 0, 2, 0.1, true,
			(v) => { model.frequencyPenalty = v; }, model.frequencyPenalty == null, () => { model.frequencyPenalty = undefined; });

		this.renderDropdownParam(paramSection, "Reasoning Effort",
			[["low", "Low"], ["medium", "Medium"], ["high", "High"]],
			model.reasoningEffort, true,
			(v) => { model.reasoningEffort = v as "low" | "medium" | "high"; },
			model.reasoningEffort == null,
			() => { model.reasoningEffort = undefined; });

		this.renderButtons(contentEl, s, plugin);
	}

	private renderSliderParam(
		container: HTMLElement, label: string, value: number,
		min: number, max: number, step: number, canDisable: boolean,
		onChange: (v: number) => void, startDisabled = false,
		onDisable?: () => void,
	): void {
		const row = container.createDiv({ cls: "gz-model-param-row" });
		if (startDisabled) row.addClass("is-param-disabled");
		row.createDiv({ text: label, cls: "gz-param-label" });

		const slider = row.createEl("input", { type: "range" });
		slider.min = String(min);
		slider.max = String(max);
		slider.step = String(step);
		slider.value = String(value);

		const valDisplay = row.createDiv({ cls: "gz-param-value", text: startDisabled ? "—" : this.fmtNum(value, step) });

		slider.addEventListener("input", () => {
			const v = parseFloat(slider.value);
			valDisplay.textContent = this.fmtNum(v, step);
			onChange(v);
		});

		if (canDisable) {
			const toggleBtn = row.createEl("button", { cls: "gz-param-toggle" });
			setIcon(toggleBtn, "power");
			if (startDisabled) toggleBtn.addClass("is-disabled");
			let disabled = startDisabled;
			toggleBtn.addEventListener("click", () => {
				disabled = !disabled;
				row.toggleClass("is-param-disabled", disabled);
				toggleBtn.toggleClass("is-disabled", disabled);
				if (disabled) {
					valDisplay.textContent = "—";
					onDisable?.();
				} else {
					const v = parseFloat(slider.value);
					valDisplay.textContent = this.fmtNum(v, step);
					onChange(v);
				}
			});
		}
	}

	private renderDropdownParam(
		container: HTMLElement, label: string,
		options: [string, string][], currentValue: string | undefined,
		canDisable: boolean, onChange: (v: string) => void,
		startDisabled = false, onDisable?: () => void,
	): void {
		const row = container.createDiv({ cls: "gz-model-param-row" });
		if (startDisabled) row.addClass("is-param-disabled");
		row.createDiv({ text: label, cls: "gz-param-label" });

		const select = row.createEl("select");
		select.createEl("option", { text: "Select an option", value: "" });
		for (const [val, text] of options) {
			const opt = select.createEl("option", { text, value: val });
			if (val === currentValue) opt.selected = true;
		}
		select.addEventListener("change", () => {
			if (select.value) onChange(select.value);
		});

		row.createDiv({ cls: "gz-param-value" });

		if (canDisable) {
			const toggleBtn = row.createEl("button", { cls: "gz-param-toggle" });
			setIcon(toggleBtn, "power");
			if (startDisabled) toggleBtn.addClass("is-disabled");
			let disabled = startDisabled;
			toggleBtn.addEventListener("click", () => {
				disabled = !disabled;
				row.toggleClass("is-param-disabled", disabled);
				toggleBtn.toggleClass("is-disabled", disabled);
				if (disabled) {
					select.value = "";
					onDisable?.();
				} else if (select.value) {
					onChange(select.value);
				}
			});
		}
	}

	private fmtNum(v: number, step: number): string {
		return step < 1 ? v.toFixed(String(step).split(".")[1]?.length || 1) : String(v);
	}

	private renderButtons(contentEl: HTMLElement, s: AIChatSettings, plugin: SuperPlugin): void {
		const model = this.model;
		const btnRow = contentEl.createDiv({ cls: "gz-model-edit-btn-row" });

		// 测试连接
		const testBtn = btnRow.createEl("button", { text: "测试连接" });
		testBtn.addEventListener("click", async () => {
			testBtn.textContent = "测试中...";
			testBtn.disabled = true;
			try {
				const provider = findProvider(s.providers, model.providerId || "");
				if (!provider) {
					new Notice("未找到关联的 Provider");
					return;
				}
				const result = await testModelConnection(model, provider);
				if (result.ok) {
					new Notice(`${model.name || model.model}: ${result.latency}ms ✓`);
				} else {
					new Notice(`${model.name || model.model}: 连接失败 - ${result.error}`);
				}
			} catch (err) {
				new Notice(`${model.name || model.model}: 连接失败 - ${err}`);
			}
			testBtn.textContent = "测试连接";
			testBtn.disabled = false;
		});

		const saveBtn = btnRow.createEl("button", { text: "保存", cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			if (!model.model && !model.name) {
				new Notice("请填写模型名称");
				return;
			}
			if (!model.model) model.model = model.name;
			if (!model.name) model.name = model.model;
			model.updatedAt = Date.now();
			await plugin.saveSettings();
			this.onSaved();
			this.close();
		});

		const cancelBtn = btnRow.createEl("button", { text: "取消" });
		cancelBtn.addEventListener("click", () => { this.revert(); this.close(); });
	}

	private revert(): void {
		if (this.isNew) {
			const idx = this.s.modelConfigs.findIndex((m) => m.id === this.model.id);
			if (idx !== -1) this.s.modelConfigs.splice(idx, 1);
		} else {
			Object.assign(this.model, JSON.parse(this.snapshot));
		}
		this.plugin.saveSettings();
		this.onSaved();
	}
}
