import { renderSemanticLayerForPrompt, type AiUserRole } from "./semantic-layer";
import type { QueryResultPreview } from "./sql-executor";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type OllamaConfig = {
  apiKey: string;
  host: string;
  model: string;
};

export type TextToSqlPlan = {
  should_query: boolean;
  sql: string | null;
  reasoning: string;
  answer_without_query?: string;
};

type OllamaMessage = {
  role: "system" | ChatRole;
  content: string;
};

type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
};

type OllamaErrorResponse = {
  error?: string;
};

const DEFAULT_OLLAMA_HOST = "https://ollama.com";
const DEFAULT_OLLAMA_MODEL = "qwen3.5:397b-cloud";

export function getOllamaConfig(): OllamaConfig {
  return {
    apiKey: process.env.OLLAMA_API_KEY?.trim() ?? "",
    host: (process.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST).replace(/\/+$/, ""),
    model: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
  };
}

function isOllamaChatResponse(value: unknown): value is { message: { content: string } } {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { message?: unknown };
  if (!maybe.message || typeof maybe.message !== "object") return false;
  const message = maybe.message as { content?: unknown };
  return typeof message.content === "string";
}

function parseOllamaError(text: string): string {
  if (!text.trim()) return "";
  try {
    const parsed = JSON.parse(text) as OllamaErrorResponse;
    return typeof parsed.error === "string" ? parsed.error : text;
  } catch {
    return text;
  }
}

export function mapOllamaErrorCode(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("requires a subscription") || normalized.includes("upgrade for access")) {
    return "ollama_subscription_required";
  }
  if (normalized.includes("model") && normalized.includes("not found")) {
    return "ollama_model_not_found";
  }
  return "ollama_request_failed";
}

async function callOllama(config: OllamaConfig, messages: OllamaMessage[]): Promise<string> {
  const response = await fetch(`${config.host}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const errorMessage = parseOllamaError(errorText);
    throw new Error(errorMessage || "Ollama chat request failed");
  }

  const data: unknown = (await response.json()) as OllamaChatResponse;
  if (!isOllamaChatResponse(data)) {
    throw new Error("Unexpected Ollama chat response");
  }
  return data.message.content;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function isTextToSqlPlan(value: unknown): value is TextToSqlPlan {
  if (!value || typeof value !== "object") return false;
  const maybe = value as {
    should_query?: unknown;
    sql?: unknown;
    reasoning?: unknown;
    answer_without_query?: unknown;
  };
  return (
    typeof maybe.should_query === "boolean" &&
    (typeof maybe.sql === "string" || maybe.sql === null) &&
    typeof maybe.reasoning === "string" &&
    (typeof maybe.answer_without_query === "string" || maybe.answer_without_query === undefined)
  );
}

export async function generateTextToSqlPlan(params: {
  config: OllamaConfig;
  role: AiUserRole;
  messages: ChatMessage[];
}): Promise<TextToSqlPlan> {
  const semanticLayer = renderSemanticLayerForPrompt(params.role);
  const conversation = params.messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const content = await callOllama(params.config, [
    {
      role: "system",
      content: [
        "You are Moby AI's Text-to-SQL planner.",
        "Return only a JSON object. Do not wrap it in markdown unless unavoidable.",
        "Use PostgreSQL syntax.",
        "Use only the tables and columns in the semantic layer.",
        "Generate only one SELECT query when data is needed.",
        "Never use SELECT *.",
        "Prefer explicit column aliases in snake_case.",
        "Always include a LIMIT of 100 or less.",
        "If the question is conceptual, greeting, or not answerable from the schema, set should_query=false.",
        "For Thai questions, infer business intent but do not invent unavailable columns.",
        "",
        "JSON shape:",
        "{\"should_query\": boolean, \"sql\": string | null, \"reasoning\": string, \"answer_without_query\": string | undefined}",
        "",
        "Semantic layer:",
        semanticLayer,
      ].join("\n"),
    },
    { role: "user", content: conversation },
  ]);

  const parsed = extractJsonObject(content);
  if (!isTextToSqlPlan(parsed)) {
    throw new Error("Model returned an invalid Text-to-SQL plan.");
  }
  return parsed;
}

export async function generateFinalAnswer(params: {
  config: OllamaConfig;
  messages: ChatMessage[];
  sql: string | null;
  queryResult: QueryResultPreview | null;
  warnings: string[];
  directAnswer?: string;
}): Promise<string> {
  const latestQuestion = params.messages[params.messages.length - 1]?.content ?? "";
  const evidence = params.queryResult
    ? JSON.stringify(params.queryResult, null, 2)
    : params.directAnswer ?? "No database query was executed.";

  return callOllama(params.config, [
    {
      role: "system",
      content: [
        "You are Moby AI, an internal analytics assistant for 1Moby.",
        "Answer in Thai by default unless the user asks for another language.",
        "Use only the provided evidence. Do not invent customer metrics, prediction scores, or run results.",
        "If evidence is insufficient, say what is missing.",
        "Keep answers concise and operational.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Question: ${latestQuestion}`,
        params.sql ? `SQL used:\n${params.sql}` : "SQL used: none",
        params.warnings.length ? `Warnings:\n${params.warnings.join("\n")}` : "Warnings: none",
        `Evidence:\n${evidence}`,
      ].join("\n\n"),
    },
  ]);
}
