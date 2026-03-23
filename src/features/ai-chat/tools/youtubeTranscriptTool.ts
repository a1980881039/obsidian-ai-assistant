import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { requestUrl } from "obsidian";
import type { ToolDefInput } from "./ToolRegistry";

/**
 * YouTube 字幕提取工具 — 从 YouTube 页面 HTML 解析字幕。
 */
export function createYoutubeTranscriptTool(): ToolDefInput {
	const schema = z.object({
		url: z.string().describe("The YouTube video URL"),
	});

	const tool = new DynamicStructuredTool({
		name: "youtube_transcript",
		description: "Extract the transcript/subtitles from a YouTube video. Provide the full YouTube URL.",
		schema,
		func: async ({ url }: { url: string }) => {
			const videoId = extractVideoId(url);
			if (!videoId) return "Invalid YouTube URL. Please provide a valid YouTube video URL.";

			try {
				const resp = await requestUrl({
					url: `https://www.youtube.com/watch?v=${videoId}`,
					method: "GET",
					headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
				});
				const html = resp.text;

				// Extract captions from ytInitialPlayerResponse
				const captionMatch = html.match(/"captions":\s*(\{[\s\S]*?"playerCaptionsTracklistRenderer"[\s\S]*?\})\s*,\s*"/);
				if (!captionMatch) return "No captions available for this video.";

				// Find caption track URL
				const trackMatch = captionMatch[1].match(/"baseUrl"\s*:\s*"([^"]+)"/);
				if (!trackMatch) return "No caption tracks found.";

				const captionUrl = trackMatch[1].replace(/\\u0026/g, "&");
				const captionResp = await requestUrl({ url: captionUrl, method: "GET" });
				const xml = captionResp.text;

				// Parse XML captions
				const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
				const lines: string[] = [];
				let m: RegExpExecArray | null;
				while ((m = textRegex.exec(xml)) !== null) {
					const decoded = m[1]
						.replace(/&amp;/g, "&")
						.replace(/&lt;/g, "<")
						.replace(/&gt;/g, ">")
						.replace(/&quot;/g, '"')
						.replace(/&#39;/g, "'")
						.replace(/\n/g, " ");
					lines.push(decoded);
				}

				if (lines.length === 0) return "Failed to parse captions.";
				const transcript = lines.join(" ");
				return transcript.length > 10000
					? transcript.slice(0, 10000) + "\n\n...(truncated)"
					: transcript;
			} catch {
				return "Failed to fetch YouTube video. The video may be private or unavailable.";
			}
		},
	} as any);

	return { name: "youtube_transcript", description: tool.description, tool };
}

function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
		/^([a-zA-Z0-9_-]{11})$/,
	];
	for (const p of patterns) {
		const m = url.match(p);
		if (m) return m[1];
	}
	return null;
}
