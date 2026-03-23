import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatCohere } from "@langchain/cohere";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatXAI } from "@langchain/xai";
import { ChatModelProvider } from "../types";

type ChatConstructorType = new (config: Record<string, unknown>) => unknown;

/** Provider 名称 → LangChain 构造器映射 */
export const CHAT_PROVIDER_CONSTRUCTORS: Record<string, ChatConstructorType> = {
	[ChatModelProvider.OPENAI]: ChatOpenAI as unknown as ChatConstructorType,
	[ChatModelProvider.ANTHROPIC]: ChatAnthropic as unknown as ChatConstructorType,
	[ChatModelProvider.GOOGLE]: ChatGoogleGenerativeAI as unknown as ChatConstructorType,
	[ChatModelProvider.GROQ]: ChatGroq as unknown as ChatConstructorType,
	[ChatModelProvider.MISTRAL]: ChatMistralAI as unknown as ChatConstructorType,
	[ChatModelProvider.COHERE]: ChatCohere as unknown as ChatConstructorType,
	[ChatModelProvider.DEEPSEEK]: ChatDeepSeek as unknown as ChatConstructorType,
	[ChatModelProvider.XAI]: ChatXAI as unknown as ChatConstructorType,
	// OpenAI-compatible providers use ChatOpenAI
	[ChatModelProvider.OPENROUTER]: ChatOpenAI as unknown as ChatConstructorType,
	[ChatModelProvider.SILICONFLOW]: ChatOpenAI as unknown as ChatConstructorType,
	[ChatModelProvider.AZURE_OPENAI]: ChatOpenAI as unknown as ChatConstructorType,
	[ChatModelProvider.OPENAI_FORMAT]: ChatOpenAI as unknown as ChatConstructorType,
};

/** Provider 是否需要 API Key（本地模型不需要） */
export const PROVIDER_REQUIRES_KEY: Record<string, boolean> = {
	[ChatModelProvider.OPENAI]: true,
	[ChatModelProvider.ANTHROPIC]: true,
	[ChatModelProvider.GOOGLE]: true,
	[ChatModelProvider.GROQ]: true,
	[ChatModelProvider.MISTRAL]: true,
	[ChatModelProvider.COHERE]: true,
	[ChatModelProvider.DEEPSEEK]: true,
	[ChatModelProvider.XAI]: true,
	[ChatModelProvider.OPENROUTER]: true,
	[ChatModelProvider.SILICONFLOW]: true,
	[ChatModelProvider.AZURE_OPENAI]: true,
	[ChatModelProvider.OPENAI_FORMAT]: false,
};

/** Provider 预设 URL（对齐 agent-workbench 的 PROVIDER_PRESETS）*/
export const PROVIDER_PRESETS: Record<string, string> = {
	[ChatModelProvider.OPENAI]: "https://api.openai.com/v1",
	[ChatModelProvider.ANTHROPIC]: "https://api.anthropic.com",
	[ChatModelProvider.GOOGLE]: "https://generativelanguage.googleapis.com",
	[ChatModelProvider.GROQ]: "https://api.groq.com/openai/v1",
	[ChatModelProvider.MISTRAL]: "https://api.mistral.ai/v1",
	[ChatModelProvider.COHERE]: "https://api.cohere.ai/v1",
	[ChatModelProvider.DEEPSEEK]: "https://api.deepseek.com/v1",
	[ChatModelProvider.XAI]: "https://api.x.ai/v1",
	[ChatModelProvider.OPENROUTER]: "https://openrouter.ai/api/v1",
	[ChatModelProvider.SILICONFLOW]: "https://api.siliconflow.cn/v1",
	[ChatModelProvider.AZURE_OPENAI]: "",
	[ChatModelProvider.OPENAI_FORMAT]: "",
};

/** Provider 显示信息 */
export interface ProviderMeta {
	label: string;
	host: string;
	keyPlaceholder: string;
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
	[ChatModelProvider.OPENAI]: { label: "OpenAI", host: "https://api.openai.com/v1", keyPlaceholder: "sk-..." },
	[ChatModelProvider.ANTHROPIC]: { label: "Anthropic", host: "https://api.anthropic.com", keyPlaceholder: "sk-ant-..." },
	[ChatModelProvider.GOOGLE]: { label: "Google Gemini", host: "https://generativelanguage.googleapis.com", keyPlaceholder: "AI..." },
	[ChatModelProvider.GROQ]: { label: "Groq", host: "https://api.groq.com/openai/v1", keyPlaceholder: "gsk_..." },
	[ChatModelProvider.MISTRAL]: { label: "Mistral AI", host: "https://api.mistral.ai/v1", keyPlaceholder: "..." },
	[ChatModelProvider.COHERE]: { label: "Cohere", host: "https://api.cohere.ai/v1", keyPlaceholder: "..." },
	[ChatModelProvider.DEEPSEEK]: { label: "DeepSeek", host: "https://api.deepseek.com/v1", keyPlaceholder: "sk-..." },
	[ChatModelProvider.XAI]: { label: "xAI (Grok)", host: "https://api.x.ai/v1", keyPlaceholder: "xai-..." },
	[ChatModelProvider.OPENROUTER]: { label: "OpenRouter", host: "https://openrouter.ai/api/v1", keyPlaceholder: "sk-or-..." },
	[ChatModelProvider.SILICONFLOW]: { label: "SiliconFlow", host: "https://api.siliconflow.cn/v1", keyPlaceholder: "sk-..." },
	[ChatModelProvider.AZURE_OPENAI]: { label: "Azure OpenAI", host: "", keyPlaceholder: "..." },
	[ChatModelProvider.OPENAI_FORMAT]: { label: "自定义 (OpenAI 兼容)", host: "", keyPlaceholder: "..." },
};
