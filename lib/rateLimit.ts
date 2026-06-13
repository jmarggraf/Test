/**
 * Minimal in-memory rate limiter for the login action ([15]).
 *
 * Scope/limitations (acceptable for the local single-instance MVP, documented
 * in docs/follow-ups.md):
 *   - State is per-process and resets on restart.
 *   - Not shared across multiple instances.
 *   - Keyed by email, so it throttles attempts against a given account.
 *
 * Functions take an injectable `now` so the time-window behaviour is
 * deterministically testable.
 */

export interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

interface AttemptRecord {
  count: number;
  firstAt: number;
}

const store = new Map<string, AttemptRecord>();

/**
 * Returns true if `key` has reached the attempt limit within the current
 * window. A record whose window has elapsed is treated as not limited.
 */
export function isRateLimited(
  key: string,
  now: number = Date.now(),
  opts: RateLimitOptions = DEFAULT_RATE_LIMIT
): boolean {
  const rec = store.get(key);
  if (!rec) return false;
  if (now - rec.firstAt > opts.windowMs) return false;
  return rec.count >= opts.maxAttempts;
}

/**
 * Records a failed attempt for `key`. Starts a fresh window if none is active
 * or the previous one has elapsed.
 */
export function registerFailure(
  key: string,
  now: number = Date.now(),
  opts: RateLimitOptions = DEFAULT_RATE_LIMIT
): void {
  const rec = store.get(key);
  if (!rec || now - rec.firstAt > opts.windowMs) {
    store.set(key, { count: 1, firstAt: now });
  } else {
    rec.count += 1;
  }
}

/** Clears the attempt record for `key` (e.g. after a successful login). */
export function clearAttempts(key: string): void {
  store.delete(key);
}

/** Test helper: wipes all recorded attempts. */
export function _resetRateLimitStore(): void {
  store.clear();
}
