/**
 * Universal LLM client.
 *
 * Supports:
 *   - OpenAI-compatible APIs  (OpenAI, OpenRouter, Groq, Together, Fireworks, vLLM, …)
 *   - Ollama                  (local or Ollama Cloud)
 *
 * Both streaming (async generator) and non-streaming variants are exported.
 * Provider is determined by getLLMConfig(); callers never touch raw fetch.
 */

import { getLLMConfig, type LLMConfig } from "./llm-config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionOptions = {
  config?: LLMConfig;
  temperature?: number;
  maxTokens?: number;
  /** Force JSON output (best-effort; not all providers honour this). */
  jsonMode?: boolean;
};

// ── Public API ─────────────────────────────────────────────────────────────────

/** Non-streaming completion. Returns the full response text. */
export async function complete(
  messages: ChatMessage[],
  opts: CompletionOptions = {}
): Promise<string> {
  const c = opts.config ?? getLLMConfig();
  if (c.provider === "openai") return completeOpenAI(messages, c, opts);
  return completeOllama(messages, c, opts);
}

/** Streaming completion. Yields individual text tokens as they arrive. */
export async function* stream(
  messages: ChatMessage[],
  opts: CompletionOptions = {}
): AsyncGenerator<string> {
  const c = opts.config ?? getLLMConfig();
  if (c.provider === "openai") {
    yield* streamOpenAI(messages, c, opts);
  } else {
    yield* streamOllama(messages, c, opts);
  }
}

/** Collect a streamed response into a single string (convenience). */
export async function streamToString(
  messages: ChatMessage[],
  opts: CompletionOptions = {}
): Promise<string> {
  const parts: string[] = [];
  for await (const token of stream(messages, opts)) {
    parts.push(token);
  }
  return parts.join("");
}

// ── OpenAI-compatible ──────────────────────────────────────────────────────────

type OpenAIRequest = {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
};

function openAIHeaders(config: LLMConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
}

function openAIBody(
  config: LLMConfig,
  messages: ChatMessage[],
  streaming: boolean,
  opts: CompletionOptions
): OpenAIRequest {
  const body: OpenAIRequest = {
    model: config.model,
    messages,
    stream: streaming,
    temperature: opts.temperature ?? 0.25,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  return body;
}

async function completeOpenAI(
  messages: ChatMessage[],
  config: LLMConfig,
  opts: CompletionOptions
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: openAIHeaders(config),
    body: JSON.stringify(openAIBody(config, messages, false, opts)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(`OpenAI API ${res.status}`, text, config.provider);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function* streamOpenAI(
  messages: ChatMessage[],
  config: LLMConfig,
  opts: CompletionOptions
): AsyncGenerator<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: openAIHeaders(config),
    body: JSON.stringify(openAIBody(config, messages, true, opts)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(`OpenAI stream ${res.status}`, text, config.provider);
  }
  if (!res.body) throw new LLMError("No response body", "", config.provider);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // skip malformed line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Ollama ─────────────────────────────────────────────────────────────────────

type OllamaRequest = {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  options?: { temperature?: number; num_predict?: number };
  format?: "json";
};

function ollamaHeaders(config: LLMConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) h.Authorization = `Bearer ${config.apiKey}`;
  return h;
}

function ollamaBody(
  config: LLMConfig,
  messages: ChatMessage[],
  streaming: boolean,
  opts: CompletionOptions
): OllamaRequest {
  const body: OllamaRequest = { model: config.model, messages, stream: streaming };
  const options: OllamaRequest["options"] = {};
  if (opts.temperature !== undefined) options.temperature = opts.temperature;
  if (opts.maxTokens) options.num_predict = opts.maxTokens;
  if (Object.keys(options).length) body.options = options;
  if (opts.jsonMode) body.format = "json";
  return body;
}

async function completeOllama(
  messages: ChatMessage[],
  config: LLMConfig,
  opts: CompletionOptions
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: ollamaHeaders(config),
    body: JSON.stringify(ollamaBody(config, messages, false, opts)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(`Ollama ${res.status}`, text, config.provider);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

async function* streamOllama(
  messages: ChatMessage[],
  config: LLMConfig,
  opts: CompletionOptions
): AsyncGenerator<string> {
  const res = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: ollamaHeaders(config),
    body: JSON.stringify(ollamaBody(config, messages, true, opts)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LLMError(`Ollama stream ${res.status}`, text, config.provider);
  }
  if (!res.body) throw new LLMError("No response body", "", config.provider);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
          };
          const token = parsed.message?.content;
          if (token) yield token;
          if (parsed.done) return;
        } catch {
          // skip malformed NDJSON line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Error type ─────────────────────────────────────────────────────────────────

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly detail: string,
    public readonly provider: string
  ) {
    super(message);
    this.name = "LLMError";
  }

  /** Map to a stable error code for the API response. */
  get code(): string {
    const m = this.detail.toLowerCase();
    if (m.includes("subscription") || m.includes("upgrade for access")) return "llm_subscription_required";
    if (m.includes("model") && m.includes("not found")) return "llm_model_not_found";
    if (m.includes("rate limit") || m.includes("rate_limit")) return "llm_rate_limit";
    if (m.includes("context length") || m.includes("context_length")) return "llm_context_too_long";
    return "llm_request_failed";
  }
}
