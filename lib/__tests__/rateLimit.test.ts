import { describe, it, expect, beforeEach } from "vitest";
import {
  isRateLimited,
  registerFailure,
  clearAttempts,
  _resetRateLimitStore,
  DEFAULT_RATE_LIMIT,
} from "../rateLimit";

const KEY = "user@example.com";
const T0 = 1_000_000; // fixed base timestamp
const { maxAttempts, windowMs } = DEFAULT_RATE_LIMIT;

beforeEach(() => {
  _resetRateLimitStore();
});

describe("isRateLimited / registerFailure", () => {
  it("an unknown key is not limited", () => {
    expect(isRateLimited(KEY, T0)).toBe(false);
  });

  it("is not limited while below the threshold", () => {
    for (let i = 0; i < maxAttempts - 1; i++) {
      registerFailure(KEY, T0);
    }
    expect(isRateLimited(KEY, T0)).toBe(false);
  });

  it("is limited once the threshold is reached", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure(KEY, T0);
    }
    expect(isRateLimited(KEY, T0)).toBe(true);
  });

  it("resets after the window has elapsed", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure(KEY, T0);
    }
    expect(isRateLimited(KEY, T0)).toBe(true);
    // Just past the window boundary
    const later = T0 + windowMs + 1;
    expect(isRateLimited(KEY, later)).toBe(false);
  });

  it("starts a fresh window when a failure arrives after expiry", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure(KEY, T0);
    }
    const later = T0 + windowMs + 1;
    registerFailure(KEY, later); // count resets to 1
    expect(isRateLimited(KEY, later)).toBe(false);
  });

  it("still counts within the window even as time advances", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure(KEY, T0 + i); // all within window
    }
    expect(isRateLimited(KEY, T0 + maxAttempts)).toBe(true);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure("a@example.com", T0);
    }
    expect(isRateLimited("a@example.com", T0)).toBe(true);
    expect(isRateLimited("b@example.com", T0)).toBe(false);
  });

  it("clearAttempts removes the limit", () => {
    for (let i = 0; i < maxAttempts; i++) {
      registerFailure(KEY, T0);
    }
    expect(isRateLimited(KEY, T0)).toBe(true);
    clearAttempts(KEY);
    expect(isRateLimited(KEY, T0)).toBe(false);
  });

  it("respects custom options", () => {
    const opts = { maxAttempts: 2, windowMs: 1000 };
    registerFailure(KEY, T0, opts);
    expect(isRateLimited(KEY, T0, opts)).toBe(false);
    registerFailure(KEY, T0, opts);
    expect(isRateLimited(KEY, T0, opts)).toBe(true);
  });
});
