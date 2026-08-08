import { afterEach, describe, expect, it } from "vitest";
import {
  assertQuotaAvailable,
  getQuotaStatus,
  isQuotaRelatedError,
  QuotaExhaustedError,
  recordRateLimitHeaders,
  resetQuotaStatus,
  toQuotaExhaustedError,
} from "../src/services/anthropicQuota";

afterEach(() => {
  resetQuotaStatus();
  delete process.env.ANTHROPIC_MIN_REQUESTS_REMAINING;
  delete process.env.ANTHROPIC_MIN_TOKENS_REMAINING;
});

describe("anthropicQuota", () => {
  it("allows the first call when no headers have been seen yet", () => {
    expect(() => assertQuotaAvailable()).not.toThrow();
  });

  it("records rate-limit headers and blocks subsequent calls when remaining is low", () => {
    process.env.ANTHROPIC_MIN_REQUESTS_REMAINING = "2";
    process.env.ANTHROPIC_MIN_TOKENS_REMAINING = "1000";

    const headers = new Headers({
      "anthropic-ratelimit-requests-remaining": "1",
      "anthropic-ratelimit-tokens-remaining": "5000",
      "anthropic-ratelimit-requests-reset": "2026-08-06T12:00:00Z",
    });
    recordRateLimitHeaders(headers);

    expect(getQuotaStatus().requestsRemaining).toBe(1);
    expect(getQuotaStatus().exhausted).toBe(true);
    expect(() => assertQuotaAvailable()).toThrow(QuotaExhaustedError);
  });

  it("maps 429 / credit-balance style errors into QuotaExhaustedError", () => {
    const err = Object.assign(new Error("Your credit balance is too low"), {
      status: 400,
      headers: new Headers({
        "anthropic-ratelimit-tokens-remaining": "0",
      }),
    });
    expect(isQuotaRelatedError(err)).toBe(true);

    const mapped = toQuotaExhaustedError(err);
    expect(mapped).toBeInstanceOf(QuotaExhaustedError);
    expect(mapped.code).toBe("ANTHROPIC_QUOTA_EXHAUSTED");
    expect(() => assertQuotaAvailable()).toThrow(QuotaExhaustedError);
  });

  it("treats rate_limit_error type as quota-related", () => {
    const err = Object.assign(new Error("rate limited"), {
      status: 429,
      error: { type: "rate_limit_error" },
    });
    expect(isQuotaRelatedError(err)).toBe(true);
  });
});
