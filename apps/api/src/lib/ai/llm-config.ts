/**
 * Universal LLM configuration.
 *
 * Provider selection via LLM_PROVIDER env var:
 *   "openai"  — any OpenAI-compatible API: OpenAI, OpenRouter, Groq, Together AI,
 *               Fireworks, Anyscale, Perplexity, local vLLM / LM Studio, etc.
 *   "ollama"  — Ollama server (local Docker or Ollama Cloud). Default.
 *
 * Environment variables (new, provider-agnostic):
 *   LLM_PROVIDER    openai | ollama                   (default: ollama)
 *   LLM_API_KEY     API key / Bearer token
 *   LLM_BASE_URL    Base URL without trailing slash
 *                     openai default : https://api.openai.com/v1
 *                     ollama default : http://localhost:11434
 *   LLM_MODEL       Chat model  (e.g. gpt-4o, llama-3.3-70b, qwen3.5:397b-cloud)
 *   LLM_EMBED_MODEL Embedding model name (for future RAG)
 *
 * Legacy Ollama vars still work as fallbacks so existing .env files need no changes:
 *   OLLAMA_API_KEY → LLM_API_KEY   OLLAMA_HOST → LLM_BASE_URL   OLLAMA_MODEL → LLM_MODEL
 */

export type LLMProvider = "openai" | "ollama";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  embedModel: string;
};

type ProviderDefaults = { baseUrl: string; model: string; embedModel: string };

const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderDefaults> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    embedModel: "text-embedding-3-small",
  },
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "qwen3.5:397b-cloud",
    embedModel: "nomic-embed-text",
  },
};

export function getLLMConfig(): LLMConfig {
  const rawProvider = process.env.LLM_PROVIDER?.trim() ?? "ollama";
  const provider: LLMProvider = rawProvider === "openai" ? "openai" : "ollama";
  const d = PROVIDER_DEFAULTS[provider];

  const apiKey =
    process.env.LLM_API_KEY?.trim() ||
    (provider === "ollama" ? process.env.OLLAMA_API_KEY?.trim() ?? "" : "") ||
    "";

  const baseUrl = (
    process.env.LLM_BASE_URL?.trim() ||
    (provider === "ollama" ? process.env.OLLAMA_HOST?.trim() ?? "" : "") ||
    d.baseUrl
  ).replace(/\/+$/, "");

  const model =
    process.env.LLM_MODEL?.trim() ||
    (provider === "ollama" ? process.env.OLLAMA_MODEL?.trim() ?? "" : "") ||
    d.model;

  const embedModel = process.env.LLM_EMBED_MODEL?.trim() || d.embedModel;

  return { provider, apiKey, baseUrl, model, embedModel };
}

/** True when the provider looks configured enough to attempt a call. */
export function isLLMConfigured(): boolean {
  const c = getLLMConfig();
  if (c.provider === "openai") return c.apiKey.length > 0;
  return true; // Ollama: key optional for local, runtime error surfaces if missing for Cloud
}

// ── Backward-compat shims (used by legacy ollama.ts callers) ─────────────────

/** @deprecated Use getLLMConfig() */
export type OllamaConfig = { apiKey: string; host: string; model: string };

/** @deprecated Use getLLMConfig() */
export function getOllamaConfig(): OllamaConfig {
  const c = getLLMConfig();
  return { apiKey: c.apiKey, host: c.baseUrl, model: c.model };
}

// Keep these exports so existing imports don't break
export const DEFAULT_OLLAMA_HOST = PROVIDER_DEFAULTS.ollama.baseUrl;
export const DEFAULT_OLLAMA_MODEL = PROVIDER_DEFAULTS.ollama.model;
