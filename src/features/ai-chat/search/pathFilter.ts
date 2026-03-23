/**
 * 路径过滤工具 — 统一管理检索范围的包含/排除逻辑。
 */

export interface PathScope {
	inclusions: string[];
	exclusions: string[];
}

/** 从逗号分隔的配置字符串解析为路径列表 */
export function parsePaths(raw: string): string[] {
	return raw.split(",").map((p) => p.trim()).filter(Boolean);
}

/** 判断路径是否在给定范围内 */
export function isPathInScope(path: string, scope: PathScope): boolean {
	if (scope.exclusions.some((ex) => path.startsWith(ex))) return false;
	if (scope.inclusions.length > 0 && !scope.inclusions.some((inc) => path.startsWith(inc))) return false;
	return true;
}
