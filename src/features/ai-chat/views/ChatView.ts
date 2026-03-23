import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import Chat from "./Chat.svelte";
import { VIEW_TYPE_AI_CHAT } from "../constants";
import type { ChatManager } from "../core/ChatManager";

/**
 * Obsidian ItemView 容器，挂载 Svelte 5 Chat 组件。
 */
export class AIChatView extends ItemView {
	private component: Record<string, unknown> | undefined;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly chatManager: ChatManager,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_AI_CHAT;
	}

	getDisplayText(): string {
		return "AI Chat";
	}

	getIcon(): string {
		return "message-circle";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("gz-ai-chat-container");

		this.component = mount(Chat, {
			target: this.contentEl,
			props: {
				app: this.app,
				chatManager: this.chatManager,
			},
		});
	}

	async onClose(): Promise<void> {
		if (this.component) {
			unmount(this.component);
			this.component = undefined;
		}
	}
}
