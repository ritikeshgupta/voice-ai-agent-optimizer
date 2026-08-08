/**
 * Tracks Anthropic rate-limit / quota signals from response headers and API errors
 * so subsequent LLM calls can fail fast instead of burning a depleted eval budget.
 *
 * Anthropic does not expose a reliable "remaining free dollars" preflight endpoint for
 * the Messages API; remaining request/token budgets arrive on response headers, and
 * billing exhaustion arrives as API errors. This module records both.
 */

export class QuotaExhaustedError extends Error {
  readonly code = "ANTHROPIC_QUOTA_EXHAUSTED" as const;

  constructor(
    message: string,
    readonly details?: {
      requestsRemaining?: number | null;
      tokensRemaining?: number | null;
      resetAt?: string | null;
      causeMessage?: string;
    }
  ) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

export interface QuotaStatus {
  requestsRemaining: number | null;
  tokensRemaining: number | null;
  requestsReset: string | null;
  tokensReset: string | null;
  /** Soft-block set after a quota/billing/rate-limit failure or when remaining hits 0. */
  exhausted: boolean;
  reason: string | null;
}

const DEFAULT_MIN_REQUESTS = 1;
const DEFAULT_MIN_TOKENS = 500;

function minRequestsRemaining(): number {
  const raw = Number(process.env.ANTHROPIC_MIN_REQUESTS_REMAINING);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_REQUESTS;
}

function minTokensRemaining(): number {
  const raw = Number(process.env.ANTHROPIC_MIN_TOKENS_REMAINING);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_TOKENS;
}

let status: QuotaStatus = {
  requestsRemaining: null,
  tokensRemaining: null,
  requestsReset: null,
  tokensReset: null,
  exhausted: false,
  reason: null,
};

export function getQuotaStatus(): Readonly<QuotaStatus> {
  return { ...status };
}

/** Test helper — clears recorded quota state. */
export function resetQuotaStatus(): void {
  status = {
    requestsRemaining: null,
    tokensRemaining: null,
    requestsReset: null,
    tokensReset: null,
    exhausted: false,
    reason: null,
  };
}

function parseHeaderInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function recordRateLimitHeaders(headers: Headers): void {
  const requestsRemaining = parseHeaderInt(headers, "anthropic-ratelimit-requests-remaining");
  const tokensRemaining = parseHeaderInt(headers, "anthropic-ratelimit-tokens-remaining");
  const requestsReset = headers.get("anthropic-ratelimit-requests-reset");
  const tokensReset = headers.get("anthropic-ratelimit-tokens-reset");

  if (requestsRemaining != null) status.requestsRemaining = requestsRemaining;
  if (tokensRemaining != null) status.tokensRemaining = tokensRemaining;
  if (requestsReset) status.requestsReset = requestsReset;
  if (tokensReset) status.tokensReset = tokensReset;

  if (
    (requestsRemaining != null && requestsRemaining < minRequestsRemaining()) ||
    (tokensRemaining != null && tokensRemaining < minTokensRemaining())
  ) {
    status.exhausted = true;
    status.reason =
      `Anthropic rate-limit budget is nearly exhausted ` +
      `(requests remaining=${status.requestsRemaining ?? "?"}, ` +
      `tokens remaining=${status.tokensRemaining ?? "?"}). ` +
      `Wait for the reset window or check console.anthropic.com Usage.`;
  }
}

export function markQuotaExhausted(reason: string, causeMessage?: string): void {
  status.exhausted = true;
  status.reason = reason;
  if (causeMessage && !reason.includes(causeMessage)) {
    status.reason = `${reason} (${causeMessage})`;
  }
}

/**
 * Throws if a previous response/error indicated the org has no usable quota left.
 * First call of a process (no headers yet) is allowed through.
 */
export function assertQuotaAvailable(): void {
  if (!status.exhausted) return;
  throw new QuotaExhaustedError(
    status.reason ??
      "Anthropic API quota is exhausted. Check console.anthropic.com Usage / Limits before retrying.",
    {
      requestsRemaining: status.requestsRemaining,
      tokensRemaining: status.tokensRemaining,
      resetAt: status.tokensReset ?? status.requestsReset,
    }
  );
}

const QUOTA_MESSAGE_RE =
  /credit|billing|quota|usage limit|spend limit|insufficient|balance|rate.?limit|too many requests|evaluation/i;

export function isQuotaRelatedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const statusCode = "status" in err ? Number((err as { status?: number }).status) : undefined;
  if (statusCode === 429) return true;
  const message = "message" in err ? String((err as { message?: string }).message) : "";
  const errorType =
    "error" in err && err.error && typeof err.error === "object" && "type" in err.error
      ? String((err.error as { type?: string }).type)
      : "";
  if (errorType === "rate_limit_error") return true;
  return QUOTA_MESSAGE_RE.test(message);
}

export function toQuotaExhaustedError(err: unknown): QuotaExhaustedError {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : String(err);
  const headers =
    err && typeof err === "object" && "headers" in err
      ? ((err as { headers?: Headers }).headers ?? null)
      : null;
  if (headers) {
    try {
      recordRateLimitHeaders(headers);
    } catch {
      // ignore malformed headers on error paths
    }
  }

  const reason =
    `Anthropic API refused the request due to rate limit or quota exhaustion: ${message}. ` +
    `Further LLM calls are blocked for this process. Check console.anthropic.com Usage / Limits.`;
  markQuotaExhausted(reason, message);
  return new QuotaExhaustedError(reason, {
    requestsRemaining: status.requestsRemaining,
    tokensRemaining: status.tokensRemaining,
    resetAt: status.tokensReset ?? status.requestsReset,
    causeMessage: message,
  });
}
