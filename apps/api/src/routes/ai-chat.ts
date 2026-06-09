import Elysia, { t } from "elysia";
import { requireUser } from "../lib/auth-middleware";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type OllamaMessage = {
  role: "system" | ChatRole;
  content: string;
};

type OllamaChatResponse = {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
};

type OllamaChatSuccess = OllamaChatResponse & {
  message: {
    content: string;
  };
};

const DEFAULT_OLLAMA_HOST = "https://ollama.com";
const DEFAULT_OLLAMA_MODEL = "qwen3.5:397b-cloud";
const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 12_000;

const SYSTEM_PROMPT = [
  "You are Moby AI, an internal analytics assistant for 1Moby.",
  "Answer in Thai by default unless the user asks for another language.",
  "Do not invent customer metrics, prediction scores, run results, or model outputs.",
  "If the user asks for unavailable analytics data, say the chat API is connected but prediction context has not been provided yet.",
  "Keep answers concise and operational.",
].join("\n");

function getOllamaConfig() {
  return {
    apiKey: process.env.OLLAMA_API_KEY?.trim() ?? "",
    host: (process.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST).replace(/\/+$/, ""),
    model: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
  };
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_CONTENT_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES);
}

function isOllamaChatResponse(value: unknown): value is OllamaChatSuccess {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { message?: unknown };
  if (!maybe.message || typeof maybe.message !== "object") return false;
  const message = maybe.message as { content?: unknown };
  return typeof message.content === "string";
}

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)
  .post(
    "/",
    async ({ body, set }) => {
      const config = getOllamaConfig();
      if (!config.apiKey) {
        set.status = 503;
        return {
          message: "OLLAMA_API_KEY is not configured",
          code: "ollama_not_configured",
        };
      }

      const messages = normalizeMessages(body.messages);
      if (messages.length === 0) {
        set.status = 400;
        return {
          message: "At least one non-empty message is required",
          code: "empty_messages",
        };
      }

      const ollamaMessages: OllamaMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ];

      const response = await fetch(`${config.host}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: ollamaMessages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        set.status = response.status >= 500 ? 502 : response.status;
        return {
          message: "Ollama chat request failed",
          code: "ollama_request_failed",
          status: response.status,
          detail: errorText.slice(0, 500) || undefined,
        };
      }

      const data: unknown = await response.json();
      if (!isOllamaChatResponse(data)) {
        set.status = 502;
        return {
          message: "Unexpected Ollama chat response",
          code: "ollama_bad_response",
        };
      }

      return {
        model: config.model,
        message: {
          role: "assistant" as const,
          content: data.message.content,
        },
      };
    },
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.Union([t.Literal("user"), t.Literal("assistant")]),
            content: t.String({ minLength: 1, maxLength: MAX_CONTENT_CHARS }),
          }),
          { minItems: 1, maxItems: MAX_MESSAGES }
        ),
      }),
    }
  );
