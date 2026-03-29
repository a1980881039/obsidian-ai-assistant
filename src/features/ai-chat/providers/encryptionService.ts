/**
 * API Key 安全存储服务。
 * 使用 Obsidian 内置 SecretStorage API（需 Obsidian 1.11.4+）。
 * 设置中只保存 secret 名称（引用），实际密钥值存储在 SecretStorage 中，
 * 不写入 data.json，不随同步传输，彻底避免跨设备密钥损坏问题。
 */

import type { App } from "obsidian";

let appRef: App | null = null;

/** 插件 onload 时调用，注入 App 引用 */
export function initSecretService(app: App): void {
	appRef = app;
}

/** 从 SecretStorage 获取密钥值。传入 secret 名称，返回实际值。 */
export function resolveSecret(secretName: string): string {
	if (!secretName) return "";
	if (!appRef?.secretStorage) {
		console.warn("[AI Chat] SecretStorage 不可用");
		return "";
	}
	return appRef.secretStorage.getSecret(secretName) ?? "";
}
