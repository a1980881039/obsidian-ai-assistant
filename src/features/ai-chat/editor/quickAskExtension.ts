import { EditorView, ViewPlugin, WidgetType, Decoration, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

/** Effect to show/hide quick ask widget */
export const showQuickAskEffect = StateEffect.define<{ from: number; to: number } | null>();

/** Quick Ask input widget rendered below selection */
class QuickAskWidget extends WidgetType {
	private onSubmit: (prompt: string) => void;
	private onClose: () => void;

	constructor(onSubmit: (prompt: string) => void, onClose: () => void) {
		super();
		this.onSubmit = onSubmit;
		this.onClose = onClose;
	}

	toDOM(): HTMLElement {
		const container = document.createElement("div");
		container.className = "gz-ai-chat-quick-ask";

		const input = document.createElement("input");
		input.type = "text";
		input.className = "gz-ai-chat-quick-ask-input";
		input.placeholder = "Ask AI about selection...";

		const submitBtn = document.createElement("button");
		submitBtn.className = "gz-ai-chat-quick-ask-btn";
		submitBtn.textContent = "Ask";

		const closeBtn = document.createElement("button");
		closeBtn.className = "gz-ai-chat-quick-ask-close clickable-icon";
		closeBtn.innerHTML = "×";

		const submit = () => {
			const text = input.value.trim();
			if (text) this.onSubmit(text);
		};

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") { e.preventDefault(); submit(); }
			if (e.key === "Escape") { e.preventDefault(); this.onClose(); }
		});
		submitBtn.addEventListener("click", submit);
		closeBtn.addEventListener("click", this.onClose);

		container.appendChild(input);
		container.appendChild(submitBtn);
		container.appendChild(closeBtn);

		// Auto-focus
		requestAnimationFrame(() => input.focus());

		return container;
	}

	ignoreEvent(): boolean { return true; }
}

/**
 * Create a Quick Ask CM6 extension.
 * @param onAsk callback when user submits a prompt with selected text
 */
export function createQuickAskExtension(onAsk: (prompt: string, selectedText: string) => void) {
	const quickAskField = StateField.define<{ from: number; to: number } | null>({
		create: () => null,
		update(value, tr) {
			for (const e of tr.effects) {
				if (e.is(showQuickAskEffect)) return e.value;
			}
			return value;
		},
	});

	const quickAskPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.state.field(quickAskField) !== update.startState.field(quickAskField)) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const range = view.state.field(quickAskField);
				if (!range) return Decoration.none;

				const selectedText = view.state.sliceDoc(range.from, range.to);
				const widget = new QuickAskWidget(
					(prompt) => {
						onAsk(prompt, selectedText);
						view.dispatch({ effects: showQuickAskEffect.of(null) });
					},
					() => {
						view.dispatch({ effects: showQuickAskEffect.of(null) });
					},
				);

				return Decoration.set([
					Decoration.widget({ widget, side: 1 }).range(range.to),
				]);
			}
		},
		{ decorations: (v) => v.decorations },
	);

	return [quickAskField, quickAskPlugin];
}
