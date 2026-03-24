/**
 * 共享工具函数与路径常量 — 跨功能模块复用。
 */

// ── 路径常量 ──

export const AI_ROOT_FOLDER = "Super Enhance";
export const AI_DATA_FOLDER = `${AI_ROOT_FOLDER}/AI Data`;

// ── ID 生成 ──

export function generateId(prefix = "id"): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
