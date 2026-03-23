import type { App, TFile, TFolder } from "obsidian";
import { USER_SENDER, AI_SENDER, type ChatMessage } from "../types";
import { AI_ROOT_FOLDER, CHAT_FOLDER, generateMessageId } from "../constants";
const FRONTMATTER_SEPARATOR = "---";
const MSG_SEPARATOR = "<!-- MSG_SEP -->";

interface ChatFrontmatter {
	epoch: number;
	modelKey: string;
	topic: string;
	lastAccessedAt: string;
}

/**
 * 对话持久化 — 将聊天历史保存为 Markdown 文件，支持加载。
 */
export class ChatPersistence {
	constructor(private app: App) {}

	/** 确保聊天文件夹存在 */
	private async ensureChatFolder(): Promise<TFolder> {
		if (!this.app.vault.getAbstractFileByPath(AI_ROOT_FOLDER)) {
			await this.app.vault.createFolder(AI_ROOT_FOLDER);
		}
		let folder = this.app.vault.getAbstractFileByPath(CHAT_FOLDER);
		if (!folder) {
			folder = await this.app.vault.createFolder(CHAT_FOLDER);
		}
		return folder as TFolder;
	}

	/** 保存当前对话 */
	async saveChat(messages: ChatMessage[], modelKey: string): Promise<TFile> {
		await this.ensureChatFolder();

		const now = new Date();
		const topic = this.generateTopic(messages);
		const filename = this.generateFilename(topic, now);

		const frontmatter: ChatFrontmatter = {
			epoch: now.getTime(),
			modelKey,
			topic,
			lastAccessedAt: now.toISOString(),
		};

		const content = this.serializeChat(frontmatter, messages);
		return await this.app.vault.create(`${CHAT_FOLDER}/${filename}.md`, content);
	}

	/** 更新已有对话文件 */
	async updateChat(file: TFile, messages: ChatMessage[], modelKey: string): Promise<void> {
		const now = new Date();
		const topic = this.generateTopic(messages);

		const frontmatter: ChatFrontmatter = {
			epoch: now.getTime(),
			modelKey,
			topic,
			lastAccessedAt: now.toISOString(),
		};

		const content = this.serializeChat(frontmatter, messages);
		await this.app.vault.modify(file, content);
	}

	/** 加载对话 */
	async loadChat(file: TFile): Promise<{ messages: ChatMessage[]; modelKey: string }> {
		const raw = await this.app.vault.read(file);
		return this.deserializeChat(raw);
	}

	/** 缓存排序后的完整列表，避免重复遍历文件夹 */
	private sortedCache: { sort: string; items: Array<{ file: TFile; topic: string; date: string; epoch: number }> } | null = null;

	/** 获取聊天历史文件，支持分页加载 */
	async getChatHistoryFiles(
		sort: "recent" | "created" | "name" = "recent",
		page: number = 0,
		pageSize: number = 50,
	): Promise<{ items: Array<{ file: TFile; topic: string; date: string }>; hasMore: boolean }> {
		// 如果缓存的排序方式不同，重新构建
		if (!this.sortedCache || this.sortedCache.sort !== sort) {
			this.sortedCache = { sort, items: await this.buildSortedList(sort) };
		}

		const start = page * pageSize;
		const slice = this.sortedCache.items.slice(start, start + pageSize);
		return {
			items: slice.map(({ file, topic, date }) => ({ file, topic, date })),
			hasMore: start + pageSize < this.sortedCache.items.length,
		};
	}

	/** 使缓存失效（新建/删除/重命名对话后调用） */
	invalidateCache(): void {
		this.sortedCache = null;
	}

	private async buildSortedList(sort: string) {
		const folder = this.app.vault.getAbstractFileByPath(CHAT_FOLDER);
		if (!folder || !("children" in folder)) return [];

		const results: Array<{ file: TFile; topic: string; date: string; epoch: number }> = [];

		for (const child of (folder as TFolder).children) {
			if (child instanceof Object && "extension" in child && (child as TFile).extension === "md") {
				const file = child as TFile;

				// 优先使用 metadataCache，如果不可用则直接解析文件 frontmatter
				let topic = file.basename;
				let date = new Date(file.stat.mtime).toISOString();
				let epoch = file.stat.mtime;

				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				if (fm?.topic) {
					topic = fm.topic;
					date = fm.lastAccessedAt || date;
					epoch = fm.epoch || epoch;
				} else {
					// metadataCache 未就绪，直接从文件内容解析
					try {
						const raw = await this.app.vault.cachedRead(file);
						const parsed = this.parseFrontmatterRaw(raw);
						if (parsed) {
							topic = parsed.topic || topic;
							date = parsed.lastAccessedAt || date;
							epoch = parsed.epoch || epoch;
						}
					} catch { /* 读取失败则使用默认值 */ }
				}

				results.push({ file, topic, date, epoch });
			}
		}

		if (sort === "name") {
			results.sort((a, b) => a.topic.localeCompare(b.topic));
		} else if (sort === "created") {
			results.sort((a, b) => b.epoch - a.epoch);
		} else {
			const dateCache = new Map<string, number>();
			const getTime = (d: string) => {
				let t = dateCache.get(d);
				if (t === undefined) { t = new Date(d).getTime(); dateCache.set(d, t); }
				return t;
			};
			results.sort((a, b) => getTime(b.date) - getTime(a.date));
		}

		return results;
	}

	/** 从原始文件内容解析 frontmatter（不依赖 metadataCache） */
	private parseFrontmatterRaw(raw: string): { topic?: string; lastAccessedAt?: string; epoch?: number } | null {
		if (!raw.startsWith("---")) return null;
		const endIdx = raw.indexOf("---", 3);
		if (endIdx < 0) return null;
		const block = raw.slice(3, endIdx);
		const result: { topic?: string; lastAccessedAt?: string; epoch?: number } = {};
		for (const line of block.split("\n")) {
			const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
			if (!m) continue;
			const [, key, val] = m;
			if (key === "topic") result.topic = val;
			else if (key === "lastAccessedAt") result.lastAccessedAt = val;
			else if (key === "epoch") result.epoch = Number(val) || undefined;
		}
		return result;
	}

	/** 删除对话文件 */
	async deleteChat(file: TFile): Promise<void> {
		await this.app.vault.trash(file, true);
	}

	/** 重命名对话（更新 frontmatter 中的 topic） */
	async renameChat(file: TFile, newTopic: string): Promise<void> {
		const raw = await this.app.vault.read(file);
		const updated = raw.replace(
			/^(---\n[\s\S]*?topic:\s*)"[^"]*"/m,
			`$1"${newTopic.replace(/"/g, '\\"')}"`,
		);
		await this.app.vault.modify(file, updated);
	}

	/** 用 LLM 生成对话标题 */
	async generateAITitle(
		messages: ChatMessage[],
		invoke: (prompt: string) => Promise<string>,
	): Promise<string> {
		const preview = messages
			.filter(m => m.isVisible)
			.slice(0, 4)
			.map(m => `${m.sender}: ${m.message.slice(0, 100)}`)
			.join("\n");

		const prompt = `Based on this conversation, generate a very short title (under 30 characters, in the conversation's language). Reply with ONLY the title, nothing else.\n\n${preview}`;
		try {
			const title = await invoke(prompt);
			return title.replace(/^["']|["']$/g, "").trim().slice(0, 50) || "新对话";
		} catch {
			return this.generateTopic(messages);
		}
	}
	/** 从消息中生成话题 */
	private generateTopic(messages: ChatMessage[]): string {
		const firstUser = messages.find((m) => m.sender === USER_SENDER);
		if (!firstUser) return "新对话";
		const text = firstUser.message.slice(0, 50).replace(/[\n\r]/g, " ").trim();
		return text || "新对话";
	}

	/** 生成文件名 */
	private generateFilename(topic: string, date: Date): string {
		const ts = date.toISOString().slice(0, 16).replace(/[T:]/g, "-");
		const safeTopic = topic.slice(0, 30).replace(/[\\/:*?"<>|]/g, "_").trim();
		return `${ts}_${safeTopic}`;
	}

	/** 序列化对话为 Markdown */
	private serializeChat(fm: ChatFrontmatter, messages: ChatMessage[]): string {
		const lines: string[] = [
			FRONTMATTER_SEPARATOR,
			`epoch: ${fm.epoch}`,
			`modelKey: "${fm.modelKey}"`,
			`topic: "${fm.topic.replace(/"/g, '\\"')}"`,
			`lastAccessedAt: "${fm.lastAccessedAt}"`,
			FRONTMATTER_SEPARATOR,
			"",
		];

		for (const msg of messages) {
			if (!msg.isVisible) continue;
			const sender = msg.sender === USER_SENDER ? "**user**" : "**ai**";
			lines.push(`${sender}: ${msg.message}`);
			lines.push(`[Timestamp: ${msg.timestamp}]`);
			lines.push(MSG_SEPARATOR);
		}

		return lines.join("\n");
	}

	/** 反序列化 Markdown 为消息 */
	private deserializeChat(raw: string): { messages: ChatMessage[]; modelKey: string } {
		const messages: ChatMessage[] = [];
		let modelKey = "";

		// Normalize line endings (handle CRLF from iCloud / Windows)
		const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

		// Parse frontmatter
		const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---/);
		if (fmMatch) {
			const fmBlock = fmMatch[1];
			const mkMatch = fmBlock.match(/modelKey:\s*"([^"]*)"/);
			if (mkMatch) modelKey = mkMatch[1];
		}

		// Parse messages — split by MSG_SEPARATOR, fallback to legacy \n\n for old files
		const body = fmMatch ? normalized.slice(fmMatch[0].length).trim() : normalized.trim();
		const hasNewFormat = body.includes(MSG_SEPARATOR);

		if (hasNewFormat) {
			// Robust per-block parsing: split by separator, then extract sender/content/timestamp
			for (const block of body.split(MSG_SEPARATOR)) {
				const trimmed = block.trim();
				if (!trimmed) continue;

				// Match "**user**: ..." or "**ai**: ..." at the start
				const headerMatch = trimmed.match(/^\*\*(user|ai)\*\*:\s*/);
				if (!headerMatch) continue;

				const sender = headerMatch[1] === "user" ? USER_SENDER : AI_SENDER;
				let content = trimmed.slice(headerMatch[0].length);

				// Extract timestamp from the end if present
				let timestamp = new Date().toISOString();
				const tsMatch = content.match(/\n\[Timestamp:\s*([^\]]*)\]\s*$/);
				if (tsMatch) {
					timestamp = tsMatch[1];
					content = content.slice(0, tsMatch.index!).trimEnd();
				}

				if (content) {
					messages.push({
						id: generateMessageId(),
						message: content,
						sender,
						timestamp,
						isVisible: true,
					});
				}
			}
		} else {
			// Legacy format: split by double newlines
			for (const block of body.split(/\n\n+/)) {
				const trimmed = block.trim();
				if (!trimmed) continue;
				const senderMatch = trimmed.match(/^\*\*(user|ai)\*\*:\s*([\s\S]*)$/);
				if (!senderMatch) continue;
				const sender = senderMatch[1] === "user" ? USER_SENDER : AI_SENDER;
				messages.push({
					id: generateMessageId(),
					message: senderMatch[2].trim(),
					sender,
					timestamp: new Date().toISOString(),
					isVisible: true,
				});
			}
		}

		return { messages, modelKey };
	}
}
