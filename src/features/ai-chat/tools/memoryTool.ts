import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { UserMemoryManager } from "../memory/UserMemoryManager";
import type { ToolDefInput } from "./ToolRegistry";

/** 创建记忆工具 — 让 Agent 可以保存/读取用户记忆 */
export function createMemoryTools(memoryManager: UserMemoryManager): ToolDefInput[] {
	const saveTool = new DynamicStructuredTool({
		name: "save_memory",
		description: "Save an important fact or preference about the user for future reference.",
		schema: z.object({
			memory: z.string().describe("The fact or preference to remember"),
		}),
		func: async ({ memory }: any) => {
			await memoryManager.addMemory(memory);
			return `Saved to memory: ${memory}`;
		},
	} as any);

	const readTool = new DynamicStructuredTool({
		name: "read_memories",
		description: "Read all saved memories about the user.",
		schema: z.object({}),
		func: async () => {
			const memories = await memoryManager.getMemories();
			return memories || "No memories saved yet.";
		},
	} as any);

	return [
		{ name: "save_memory", description: saveTool.description, tool: saveTool },
		{ name: "read_memories", description: readTool.description, tool: readTool },
	];
}
