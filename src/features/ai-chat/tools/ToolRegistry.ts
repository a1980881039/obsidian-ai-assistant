import type { DynamicStructuredTool } from "@langchain/core/tools";

export interface ToolDef {
	name: string;
	description: string;
	tool: DynamicStructuredTool;
	enabled: boolean;
}

export type ToolDefInput = Omit<ToolDef, "enabled"> & { enabled?: boolean };

/**
 * 工具注册中心 — 管理所有可用工具。
 */
export class ToolRegistry {
	private tools: Map<string, ToolDef> = new Map();

	register(def: ToolDefInput): void {
		this.tools.set(def.name, { ...def, enabled: def.enabled ?? true });
	}

	get(name: string): ToolDef | undefined {
		const t = this.tools.get(name);
		return t?.enabled ? t : undefined;
	}

	getAll(): ToolDef[] {
		return Array.from(this.tools.values()).filter((d) => d.enabled);
	}

	getAllIncludingDisabled(): ToolDef[] {
		return Array.from(this.tools.values());
	}

	setEnabled(name: string, enabled: boolean): void {
		const t = this.tools.get(name);
		if (t) t.enabled = enabled;
	}

	syncEnabledState(enabledMap: Record<string, boolean>): void {
		for (const [name, def] of this.tools) {
			if (name in enabledMap) {
				def.enabled = enabledMap[name];
			}
		}
	}

	getLangChainTools(): DynamicStructuredTool[] {
		return this.getAll().map((d) => d.tool);
	}

	clear(): void {
		this.tools.clear();
	}
}
