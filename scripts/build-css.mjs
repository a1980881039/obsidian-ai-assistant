/**
 * build-css.mjs — 按固定顺序拼接 src 中的 CSS 文件 → 根目录 styles.css
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const ORDER = [
	"src/shared/settings.css",
	"src/features/ai-chat/styles/chat-layout.css",
	"src/features/ai-chat/styles/chat-messages.css",
	"src/features/ai-chat/styles/chat-input.css",
	"src/features/ai-chat/styles/chat-history.css",
	"src/features/ai-chat/styles/chat-settings.css",
];

const parts = ORDER.map((rel) => readFileSync(resolve(root, rel), "utf-8"));
writeFileSync(resolve(root, "styles.css"), parts.join(""), "utf-8");

console.log(`✅ styles.css built from ${ORDER.length} files`);
