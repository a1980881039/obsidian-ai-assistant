import { setIcon, setTooltip } from "obsidian";

/** 把 text input 变成密码输入框 + 显示/隐藏切换按钮 */
export function makePasswordInput(inputEl: HTMLInputElement): void {
	inputEl.type = "password";
	inputEl.addClass("gz-apikey-input");
	const toggleBtn = inputEl.parentElement!.createEl("button", { cls: "gz-apikey-toggle" });
	setIcon(toggleBtn, "eye");
	setTooltip(toggleBtn, "显示 / 隐藏");
	toggleBtn.addEventListener("click", (e) => {
		e.preventDefault();
		const show = inputEl.type === "password";
		inputEl.type = show ? "text" : "password";
		setIcon(toggleBtn, show ? "eye-off" : "eye");
	});
}
