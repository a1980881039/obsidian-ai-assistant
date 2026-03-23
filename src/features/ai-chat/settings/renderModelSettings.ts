import { Notice, Setting, setIcon, setTooltip } from "obsidian";
import type SuperPlugin from "../../../main";
import {
	ChatModelProvider,
	type AIChatSettings,
	type ModelConfig,
	type Provider,
} from "../types";
import { getLinkedModels, generateId } from "../types";
import { PROVIDER_META, PROVIDER_PRESETS } from "../providers/providerConfig";
import { detectCapabilities } from "../providers/modelCapabilities";
import { fetchAvailableModels } from "../providers/modelFetcher";
import { testAllModels, type TestResult } from "../providers/modelTester";
import { encryptKey, decryptKey, isEncrypted } from "../providers/encryptionService";
import { ModelEditModal } from "./ModelEditModal";
import type { SettingsRenderContext } from "../../Feature";

export function renderModelGlobalSettings(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
): void {
	new Setting(el)
		.setName("对话上下文轮数")
		.setDesc("发送给模型的历史对话轮数")
		.addSlider((slider) =>
			slider.setLimits(1, 30, 1).setValue(s.contextTurns).setDynamicTooltip()
				.onChange(async (value) => { s.contextTurns = value; await plugin.saveSettings(); }),
		);
}

/**
 * Provider → ModelConfig 左右分栏设置 UI。
 * 左侧: Provider 列表侧边栏
 * 右侧: Provider 表单 + 关联模型列表
 */
export function renderModelTable(
	el: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
	_ctx: SettingsRenderContext,
	onModelsChanged?: () => void,
): void {
	const wrapper = el.createDiv({ cls: "gz-provider-split" });

	// ── 状态 ──
	let selectedId: string | null = s.providers[0]?.id ?? null;

	// ── 左侧栏 ──
	const sidebar = wrapper.createDiv({ cls: "gz-provider-sidebar" });
	const sidebarHeader = sidebar.createDiv({ cls: "gz-provider-sidebar-header" });
	const sidebarTitle = sidebarHeader.createEl("span", { cls: "gz-provider-sidebar-title" });
	const addBtn = sidebarHeader.createEl("button", { cls: "gz-provider-sidebar-add", text: "+" });
	addBtn.title = "添加 Provider";
	const sidebarList = sidebar.createDiv({ cls: "gz-provider-sidebar-list" });

	// ── 右侧详情 ──
	const detail = wrapper.createDiv({ cls: "gz-provider-detail" });

	// ── 添加 Provider ──
	addBtn.addEventListener("click", async () => {
		const now = Date.now();
		const np: Provider = {
			id: generateId("provider"),
			name: "新提供商",
			type: ChatModelProvider.OPENAI,
			baseUrl: PROVIDER_PRESETS[ChatModelProvider.OPENAI] || "",
			apiKey: "",
			stream: true,
			createdAt: now,
			updatedAt: now,
		};
		s.providers.push(np);
		await plugin.saveSettings();
		selectedId = np.id;
		refreshAll();
	});

	// ── 渲染 ──
	const refreshAll = () => {
		sidebarTitle.textContent = `Providers (${s.providers.length})`;
		onModelsChanged?.();
		renderSidebar();
		renderDetail();
	};

	function renderSidebar(): void {
		sidebarList.empty();
		if (s.providers.length === 0) {
			sidebarList.createDiv({ cls: "gz-provider-sidebar-empty", text: "点击 + 添加" });
			return;
		}
		for (const p of s.providers) {
			const meta = PROVIDER_META[p.type];
			const item = sidebarList.createDiv({
				cls: `gz-provider-sidebar-item${p.id === selectedId ? " is-selected" : ""}`,
			});
			item.addEventListener("click", () => { selectedId = p.id; refreshAll(); });

			const info = item.createDiv({ cls: "gz-provider-sidebar-item-info" });
			info.createDiv({ cls: "gz-provider-sidebar-item-name", text: p.name || "(未命名)" });
			info.createDiv({ cls: "gz-provider-sidebar-item-type", text: meta?.label || p.type });

			const delBtn = item.createEl("button", { cls: "gz-provider-sidebar-item-del" });
			setIcon(delBtn, "trash-2");
			setTooltip(delBtn, "删除");
			delBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const linked = getLinkedModels(s.modelConfigs, p.id);
				if (linked.length > 0) {
					new Notice(`无法删除：该 Provider 下还有 ${linked.length} 个模型`);
					return;
				}
				const idx = s.providers.findIndex((x) => x.id === p.id);
				if (idx !== -1) s.providers.splice(idx, 1);
				if (selectedId === p.id) selectedId = s.providers[0]?.id ?? null;
				await plugin.saveSettings();
				refreshAll();
			});
		}
	}

	function renderDetail(): void {
		detail.empty();
		const provider = s.providers.find((p) => p.id === selectedId);
		if (!provider) {
			detail.createDiv({ cls: "gz-provider-detail-empty", text: "选择一个提供商或点击 + 新建" });
			return;
		}
		renderProviderDetail(detail, plugin, s, provider, refreshAll);
	}

	refreshAll();
}

/* ================================================================
 * 右侧 Provider 详情面板（内联编辑 + 模型列表）
 * ================================================================ */
function renderProviderDetail(
	container: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
	provider: Provider,
	refreshAll: () => void,
): void {
	// ── 标题 + 保存 ──
	const titleRow = container.createDiv({ cls: "gz-detail-title-row" });
	titleRow.createEl("h3", { text: provider.name || "(未命名)", cls: "gz-detail-title" });
	const saveProviderBtn = titleRow.createEl("button", { text: "保存", cls: "gz-detail-save-btn" });

	// ── Provider 表单 ──
	const form = container.createDiv({ cls: "gz-detail-form" });

	// 名称
	const nameRow = form.createDiv({ cls: "gz-detail-field" });
	nameRow.createEl("label", { text: "提供商名称", cls: "gz-detail-label" });
	const nameInput = nameRow.createEl("input", { cls: "gz-detail-input", type: "text", placeholder: "My Provider" });
	nameInput.value = provider.name;

	// 类型
	const typeRow = form.createDiv({ cls: "gz-detail-field" });
	typeRow.createEl("label", { text: "Provider 类型", cls: "gz-detail-label" });
	const typeSelect = typeRow.createEl("select", { cls: "gz-detail-input" });
	for (const [key, meta] of Object.entries(PROVIDER_META)) {
		const opt = typeSelect.createEl("option", { text: meta.label, value: key });
		if (key === provider.type) opt.selected = true;
	}
	typeSelect.addEventListener("change", () => {
		const preset = PROVIDER_PRESETS[typeSelect.value];
		if (preset && !baseUrlInput.value) {
			baseUrlInput.value = preset;
		}
	});

	// API Key
	const keyRow = form.createDiv({ cls: "gz-detail-field" });
	keyRow.createEl("label", { text: "API 密钥", cls: "gz-detail-label" });
	const keyWrap = keyRow.createDiv({ cls: "gz-detail-key-wrap" });
	const keyInput = keyWrap.createEl("input", { cls: "gz-detail-input gz-apikey-input", type: "password", placeholder: "sk-..." });
	const keyToggle = keyWrap.createEl("button", { cls: "gz-apikey-toggle" });
	setIcon(keyToggle, "eye");

	// 处理加密 key 显示
	const encKey = provider.apiKey || "";
	const encrypted = isEncrypted(encKey);
	let plainMask = "••••••••";
	let plainKey = "";
	if (encrypted) {
		decryptKey(encKey).then((k) => { plainKey = k; plainMask = "•".repeat(k.length); keyInput.value = plainMask; });
	} else {
		plainKey = encKey;
		keyInput.value = encKey;
	}
	keyToggle.addEventListener("click", (e) => {
		e.preventDefault();
		const show = keyInput.type === "password";
		if (show && encrypted && keyInput.value === plainMask) {
			keyInput.value = plainKey;
		} else if (!show && encrypted) {
			keyInput.value = plainMask;
		}
		keyInput.type = show ? "text" : "password";
		setIcon(keyToggle, show ? "eye-off" : "eye");
	});

	// Base URL
	const urlRow = form.createDiv({ cls: "gz-detail-field" });
	urlRow.createEl("label", { text: "API 地址", cls: "gz-detail-label" });
	const preset = PROVIDER_PRESETS[provider.type] || "";
	const baseUrlInput = urlRow.createEl("input", { cls: "gz-detail-input", type: "text", placeholder: preset || "https://..." });
	baseUrlInput.value = provider.baseUrl;

	// 流式输出
	const streamRow = form.createDiv({ cls: "gz-detail-field gz-detail-field-inline" });
	streamRow.createEl("label", { text: "流式输出", cls: "gz-detail-label" });
	const streamToggle = streamRow.createEl("div", { cls: "checkbox-container" });
	if (provider.stream) streamToggle.addClass("is-enabled");
	streamToggle.addEventListener("click", () => {
		streamToggle.toggleClass("is-enabled", !streamToggle.hasClass("is-enabled"));
	});

	// 保存按钮逻辑
	saveProviderBtn.addEventListener("click", async () => {
		const name = nameInput.value.trim();
		if (!name) { new Notice("请填写 Provider 名称"); return; }
		provider.name = name;
		provider.type = typeSelect.value as ChatModelProvider;

		// API Key - 如果用户修改了就重新加密
		const rawKey = keyInput.value;
		if (rawKey && rawKey !== plainMask) {
			provider.apiKey = await encryptKey(rawKey);
		}

		provider.baseUrl = baseUrlInput.value.trim() || PROVIDER_PRESETS[provider.type] || "";
		provider.stream = streamToggle.hasClass("is-enabled");
		provider.updatedAt = Date.now();
		await plugin.saveSettings();
		new Notice("已保存");
		refreshAll();
	});

	// ── 模型区域 ──
	const modelSection = container.createDiv({ cls: "gz-detail-model-section" });
	const modelHeader = modelSection.createDiv({ cls: "gz-detail-model-header" });

	const linkedModels = getLinkedModels(s.modelConfigs, provider.id);
	modelHeader.createEl("span", { text: `模型 (${linkedModels.length})`, cls: "gz-detail-model-title" });

	const modelActions = modelHeader.createDiv({ cls: "gz-detail-model-actions" });

	// 获取模型按钮
	const fetchBtn = modelActions.createEl("button", { cls: "gz-detail-model-action-btn gz-detail-fetch-btn" });
	setIcon(fetchBtn, "refresh-cw");
	fetchBtn.appendText(" 获取模型");

	// 检测模型按钮
	const testBtn = modelActions.createEl("button", { cls: "gz-detail-model-action-btn gz-detail-test-btn" });
	setIcon(testBtn, "zap");
	testBtn.appendText(" 检测模型");

	// ── 获取模型面板（内联展开） ──
	const fetchPanel = modelSection.createDiv({ cls: "gz-detail-fetch-panel" });
	fetchPanel.style.display = "none";

	fetchBtn.addEventListener("click", async () => {
		fetchBtn.disabled = true;
		fetchPanel.empty();
		fetchPanel.style.display = "block";
		fetchPanel.createDiv({ cls: "gz-detail-fetch-status", text: "正在获取模型列表..." });

		const decryptedKey = await decryptKey(provider.apiKey);
		const providerWithKey: Provider = { ...provider, apiKey: decryptedKey };
		const result = await fetchAvailableModels(providerWithKey);

		fetchPanel.empty();
		fetchBtn.disabled = false;

		if (result.error) {
			fetchPanel.createDiv({ cls: "gz-detail-fetch-status gz-model-fetch-error", text: `获取失败: ${result.error}` });
			return;
		}

		const existingNames = new Set(linkedModels.map((m) => m.model));
		const available = result.models.filter((m) => !existingNames.has(m));

		if (available.length === 0) {
			fetchPanel.createDiv({ cls: "gz-detail-fetch-status", text: "所有模型已添加" });
			return;
		}

		const selected = new Set<string>();

		// 控制栏
		const ctrl = fetchPanel.createDiv({ cls: "gz-detail-fetch-ctrl" });
		const statusText = ctrl.createEl("span", { cls: "gz-detail-fetch-count", text: `可用 ${available.length} · 已选 0` });
		const confirmBtn = ctrl.createEl("button", { text: "添加选中", cls: "gz-detail-fetch-confirm" });
		const cancelBtn = ctrl.createEl("button", { text: "取消", cls: "gz-detail-fetch-cancel" });

		// 搜索
		const searchInput = fetchPanel.createEl("input", { cls: "gz-detail-fetch-search", type: "text", placeholder: "搜索模型..." });
		let query = "";

		const listEl = fetchPanel.createDiv({ cls: "gz-detail-fetch-list" });

		const renderList = () => {
			listEl.empty();
			const filtered = query ? available.filter((m) => m.toLowerCase().includes(query)) : available;
			for (const modelName of filtered) {
				const alreadyAdded = existingNames.has(modelName);
				const row = listEl.createDiv({ cls: `gz-detail-fetch-item${alreadyAdded ? " is-disabled" : ""}` });
				const lbl = row.createEl("label");
				const cb = lbl.createEl("input", { type: "checkbox" });
				cb.checked = selected.has(modelName) || alreadyAdded;
				cb.disabled = alreadyAdded;
				cb.addEventListener("change", () => {
					if (cb.checked) selected.add(modelName); else selected.delete(modelName);
					statusText.textContent = `可用 ${available.length} · 已选 ${selected.size}`;
				});
				lbl.appendText(` ${modelName}`);
				if (alreadyAdded) lbl.createEl("span", { text: " 已添加", cls: "gz-detail-fetch-added" });
			}
		};
		searchInput.addEventListener("input", () => { query = searchInput.value.toLowerCase(); renderList(); });
		renderList();

		confirmBtn.addEventListener("click", async () => {
			if (selected.size === 0) { new Notice("请至少选择一个模型"); return; }
			const now = Date.now();
			const newConfigs: ModelConfig[] = Array.from(selected).map((m) => ({
				id: generateId("model"),
				name: m,
				model: m,
				provider: provider.type,
				baseUrl: provider.baseUrl,
				apiKey: provider.apiKey,
				enabled: true,
				capabilities: detectCapabilities(m),
				providerId: provider.id,
				temperature: 0.1,
				maxTokens: 4096,
				stream: provider.stream,
				createdAt: now,
				updatedAt: now,
			}));
			s.modelConfigs.push(...newConfigs);
			await plugin.saveSettings();
			new Notice(`已添加 ${newConfigs.length} 个模型`);
			refreshAll();
		});
		cancelBtn.addEventListener("click", () => { fetchPanel.style.display = "none"; });
	});

	// ── 模型列表 ──
	const modelListEl = modelSection.createDiv({ cls: "gz-detail-model-list" });

	if (linkedModels.length === 0) {
		modelListEl.createDiv({ cls: "gz-detail-model-empty", text: "暂无模型，点击「获取模型」从 API 加载可用列表" });
	} else {
		for (const mc of linkedModels) {
			renderModelRow(modelListEl, plugin, s, mc, provider, refreshAll);
		}
	}

	// ── 检测模型逻辑 ──
	testBtn.addEventListener("click", async () => {
		if (linkedModels.length === 0) { new Notice("没有模型可测试"); return; }
		testBtn.disabled = true;
		testBtn.textContent = "检测中...";

		await testAllModels(linkedModels, provider, (modelId, result) => {
			const el = modelListEl.querySelector(`[data-test-id="${modelId}"]`);
			if (el) { (el as HTMLElement).empty(); renderTestBadge(el as HTMLElement, result); }
		});

		testBtn.textContent = "";
		setIcon(testBtn, "zap");
		testBtn.appendText(" 检测模型");
		testBtn.disabled = false;
	});
}

/* ---- 单个模型行 ---- */
function renderModelRow(
	container: HTMLElement,
	plugin: SuperPlugin,
	s: AIChatSettings,
	mc: ModelConfig,
	provider: Provider,
	refreshAll: () => void,
): void {
	const row = container.createDiv({ cls: "gz-model-row" });

	// 左侧信息
	const info = row.createDiv({ cls: "gz-model-row-info" });
	info.createEl("span", { text: mc.model || mc.name || "(未命名)", cls: "gz-model-row-name" });

	// 能力徽章
	const caps = mc.capabilities;
	if (caps?.reasoning) info.createEl("span", { text: "推理", cls: "gz-model-row-cap gz-cap-reasoning" });
	if (caps?.vision) info.createEl("span", { text: "视觉", cls: "gz-model-row-cap gz-cap-vision" });
	if (caps?.websearch) info.createEl("span", { text: "联网", cls: "gz-model-row-cap gz-cap-websearch" });

	// 默认星标
	if (s.defaultModelId === mc.id) {
		const star = info.createEl("span", { cls: "gz-model-row-star" });
		setIcon(star, "star");
	}

	// 测试结果占位
	const testEl = info.createDiv({ cls: "gz-model-row-test" });
	testEl.dataset.testId = mc.id;

	// 右侧操作（hover 显示）
	const actions = row.createDiv({ cls: "gz-model-row-actions" });

	if (s.defaultModelId !== mc.id) {
		const defBtn = actions.createEl("button", { cls: "gz-model-row-action" });
		setIcon(defBtn, "star");
		setTooltip(defBtn, "设为默认");
		defBtn.addEventListener("click", async () => { s.defaultModelId = mc.id; await plugin.saveSettings(); refreshAll(); });
	}

	const editBtn = actions.createEl("button", { cls: "gz-model-row-action", text: "编辑" });
	editBtn.addEventListener("click", () => { new ModelEditModal(plugin, s, mc, false, () => refreshAll()).open(); });

	const delBtn = actions.createEl("button", { cls: "gz-model-row-action gz-model-row-action-del" });
	setIcon(delBtn, "trash-2");
	setTooltip(delBtn, "删除");
	delBtn.addEventListener("click", async () => {
		const idx = s.modelConfigs.findIndex((m) => m.id === mc.id);
		if (idx !== -1) s.modelConfigs.splice(idx, 1);
		if (s.defaultModelId === mc.id) s.defaultModelId = null;
		await plugin.saveSettings();
		refreshAll();
	});
}

function renderTestBadge(el: HTMLElement, result: TestResult): void {
	if (result.ok) {
		el.createEl("span", { text: `✓ ${result.latency}ms`, cls: "gz-test-ok" });
	} else {
		el.createEl("span", { text: `✗ ${result.error || "失败"}`, cls: "gz-test-fail" });
	}
}
