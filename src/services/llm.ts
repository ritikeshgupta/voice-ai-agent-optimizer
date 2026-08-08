import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import {
  assertQuotaAvailable,
  isQuotaRelatedError,
  QuotaExhaustedError,
  markQuotaExhausted,
  recordRateLimitHeaders,
  toQuotaExhaustedError,
} from "./anthropicQuota";

export {
  getQuotaStatus,
  QuotaExhaustedError,
  resetQuotaStatus,
} from "./anthropicQuota";

export type LlmProvider = "anthropic" | "gemini";

/**
 * Prefer an explicit LLM_PROVIDER. Otherwise use Gemini when GEMINI_API_KEY is set
 * (typical for free-tier local demos), else Anthropic.
 */
export function getProvider(): LlmProvider {
  const explicit = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (explicit === "gemini" || explicit === "anthropic") return explicit;
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

// --- Anthropic (lazy: dotenv may load after this module is imported) ---

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var ANTHROPIC_API_KEY -- see .env.example");
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

function getAnthropicModel(): string {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    throw new Error("Missing required env var ANTHROPIC_MODEL -- see .env.example");
  }
  return model;
}

function firstTextBlock(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) {
    throw new Error("Anthropic response contained no text content block");
  }
  return block.text;
}

function assertNoRefusal(stopReason: Anthropic.StopReason | null): void {
  if (stopReason === "refusal") {
    throw new Error("Anthropic declined to generate a response for this prompt");
  }
}

async function anthropicCreateMessage(
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  assertQuotaAvailable();
  try {
    const { data, response } = await getAnthropic().messages.create(params).withResponse();
    recordRateLimitHeaders(response.headers);
    return data;
  } catch (err) {
    if (err instanceof QuotaExhaustedError) throw err;
    if (isQuotaRelatedError(err)) throw toQuotaExhaustedError(err);
    throw err;
  }
}

// --- Gemini ---

let gemini: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var GEMINI_API_KEY -- see .env.example");
    }
    gemini = new GoogleGenAI({ apiKey });
  }
  return gemini;
}

function getGeminiModel(): string {
  // gemini-2.0-flash often reports free-tier limit:0 for new keys; flash-latest is the
  // currently available free-tier alias that works for AI Studio keys.
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

/** Fallback chain when the primary model returns 503 / high demand. */
function getGeminiModelCandidates(): string[] {
  const primary = getGeminiModel();
  const fallbacks = (process.env.GEMINI_MODEL_FALLBACKS ||
    "gemini-flash-lite-latest,gemini-2.0-flash-lite,gemini-3.1-flash-lite")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("status" in err) return Number((err as { status?: number }).status);
  return undefined;
}

function geminiErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  if ("message" in err) return String((err as { message?: string }).message);
  return String(err);
}

function isGeminiTransientError(err: unknown): boolean {
  const status = geminiErrorStatus(err);
  if (status === 503 || status === 500) return true;
  const message = geminiErrorMessage(err);
  return /UNAVAILABLE|high demand|try again later|temporar|overloaded/i.test(message);
}

function isGeminiQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = geminiErrorStatus(err);
  if (status === 429) return true;
  const message = geminiErrorMessage(err);
  return /quota|rate.?limit|resource.?exhausted|billing|exceeded|RESOURCE_EXHAUSTED/i.test(message);
}

/**
 * Gemini's free-tier per-minute RPM limit (429 RESOURCE_EXHAUSTED) comes back with a structured
 * `RetryInfo.retryDelay` telling you exactly how long the throttle lasts -- that's a short-lived
 * "wait and retry" signal, not the same thing as real billing/quota exhaustion, which carries no
 * such hint. Only the latter should hard-stop the whole process.
 */
function geminiRetryDelayMs(err: unknown): number | null {
  const match = geminiErrorMessage(err).match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

function throwGeminiQuota(err: unknown): never {
  const message = geminiErrorMessage(err);
  const reason =
    `Gemini API refused the request due to rate limit or quota exhaustion: ${message}. ` +
    `Further LLM calls are blocked for this process. Check https://aistudio.google.com/ or Cloud quotas.`;
  markQuotaExhausted(reason, message);
  throw new QuotaExhaustedError(reason, { causeMessage: message });
}

async function withGeminiRetry<T>(label: string, run: (model: string) => Promise<T>): Promise<T> {
  const models = getGeminiModelCandidates();
  const maxAttemptsPerModel = Math.max(1, Number(process.env.GEMINI_RETRY_ATTEMPTS || 3));
  let lastErr: unknown;

  for (const model of models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        return await run(model);
      } catch (err) {
        lastErr = err;
        if (err instanceof QuotaExhaustedError) throw err;

        if (isGeminiQuotaError(err)) {
          const retryDelayMs = geminiRetryDelayMs(err);
          if (retryDelayMs !== null && attempt < maxAttemptsPerModel) {
            const waitMs = retryDelayMs + 1000; // small buffer past the API's own hint
            console.warn(
              `[gemini] ${label} model=${model} hit the per-minute rate limit; waiting ` +
                `${Math.round(waitMs / 1000)}s per its retry hint (attempt ${attempt}/${maxAttemptsPerModel})…`
            );
            await sleep(waitMs);
            continue;
          }
          // No retry hint (or out of attempts) -- treat as real exhaustion, not a short throttle.
          throwGeminiQuota(err);
        }

        if (!isGeminiTransientError(err)) throw err;

        const delayMs = Math.min(8000, 500 * 2 ** (attempt - 1));
        console.warn(
          `[gemini] ${label} model=${model} attempt ${attempt}/${maxAttemptsPerModel} hit transient error; ` +
            `retrying in ${delayMs}ms…`
        );
        await sleep(delayMs);
      }
    }
    console.warn(`[gemini] ${label} giving up on model=${model}; trying next fallback if any…`);
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Gemini ${label} failed after retries: ${geminiErrorMessage(lastErr)}`);
}

async function geminiGenerateText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  assertQuotaAvailable();
  return withGeminiRetry("generateText", async (model) => {
    const response = await getGemini().models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4096,
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini response contained no text");
    return text;
  });
}

async function geminiGenerateTurn(opts: {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  assertQuotaAvailable();
  return withGeminiRetry("generateTurn", async (model) => {
    const contents = opts.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const response = await getGemini().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 1024,
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini response contained no text");
    return text;
  });
}

function zodToGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod-to-json-schema generic blowup
  const raw = zodToJsonSchema(schema as any, { $refStrategy: "none" }) as Record<string, unknown>;
  const { $schema: _drop, ...rest } = raw;
  return rest;
}

async function geminiGenerateStructured<T>(opts: {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<T> {
  assertQuotaAvailable();
  const jsonSchema = zodToGeminiJsonSchema(opts.schema);
  return withGeminiRetry("generateStructured", async (model) => {
    const response = await getGemini().models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 8192,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    });
    const text = response.text;
    if (!text) throw new Error("Gemini structured response contained no text");
    return opts.schema.parse(JSON.parse(text));
  });
}

// --- Public API (provider-agnostic) ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function generateText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  if (getProvider() === "gemini") {
    return geminiGenerateText(opts);
  }
  const response = await anthropicCreateMessage({
    model: getAnthropicModel(),
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  assertNoRefusal(response.stop_reason);
  return firstTextBlock(response.content);
}

/** One turn in a maintained multi-turn conversation (used by the simulated-call engine). */
export async function generateTurn(opts: {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  if (getProvider() === "gemini") {
    return geminiGenerateTurn(opts);
  }
  const response = await anthropicCreateMessage({
    model: getAnthropicModel(),
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
  });
  assertNoRefusal(response.stop_reason);
  return firstTextBlock(response.content);
}

/**
 * Structured output: Anthropic uses forced tool-use; Gemini uses responseMimeType +
 * responseJsonSchema. Callers always pass a zod schema and get a parsed T back.
 */
export async function generateStructured<T>(opts: {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<T> {
  if (getProvider() === "gemini") {
    return geminiGenerateStructured(opts);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above: avoids a deep
  // generic-instantiation blowup when comparing complex schemas against this lib's signature.
  const rawSchema = zodToJsonSchema(opts.schema as any, { $refStrategy: "none" }) as Record<string, unknown>;
  const { $schema: _drop, ...inputSchema } = rawSchema;

  const response = await anthropicCreateMessage({
    model: getAnthropicModel(),
    max_tokens: opts.maxTokens ?? 8192,
    system: opts.system,
    tools: [
      {
        name: "record_output",
        description: "Record the structured result for this task. Always call this exactly once.",
        input_schema: inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "record_output" },
    messages: [{ role: "user", content: opts.prompt }],
  });
  assertNoRefusal(response.stop_reason);

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    throw new Error("Anthropic did not return the expected structured tool call");
  }
  return opts.schema.parse(toolUse.input);
}
