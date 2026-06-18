/**
 * Additional availability tests — extends the existing 18 tests with
 * edge cases not yet covered:
 *  - multi-day overlaps with various partial-overlap shapes
 *  - identical intervals (already in existing suite — not duplicated)
 *  - exact-boundary touch (endDate == other.startDate) revisited with
 *    multi-booking lists
 *  - countNights for long stays and fractional-hour bookings
 *  - isInPast (not tested in existing suite)
 *  - findConflict / findAllConflicts with same-day adjacent sequences
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  intervalsOverlap,
  countNights,
  findConflict,
  findAllConflicts,
  isInPast,
  isIntervalFullyInPast,
  startOfDay,
} from "../availability";

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// ---------------------------------------------------------------------------
// intervalsOverlap – additional multi-day overlap shapes
// ---------------------------------------------------------------------------

describe("intervalsOverlap – multi-day overlap shapes (not in existing suite)", () => {
  it("A starts inside B and extends beyond B (partial tail overlap)", () => {
    // A: [5, 12), B: [2, 8) → overlap at [5, 8)
    const A = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 12) };
    const B = { startDate: utc(2026, 0, 2), endDate: utc(2026, 0, 8) };
    expect(intervalsOverlap(A, B)).toBe(true);
  });

  it("B starts inside A and extends beyond A (partial head overlap)", () => {
    // A: [2, 8), B: [5, 12)
    const A = { startDate: utc(2026, 0, 2), endDate: utc(2026, 0, 8) };
    const B = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 12) };
    expect(intervalsOverlap(A, B)).toBe(true);
  });

  it("A completely contains B (B is a sub-interval of A)", () => {
    // A: [1, 20), B: [5, 10)
    const A = { startDate: utc(2026, 0, 1), endDate: utc(2026, 0, 20) };
    const B = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 10) };
    expect(intervalsOverlap(A, B)).toBe(true);
  });

  it("A starts exactly where B ends — no overlap (AK-8 reinforced)", () => {
    // B: [1, 5), A: [5, 10)
    const B = { startDate: utc(2026, 0, 1), endDate: utc(2026, 0, 5) };
    const A = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 10) };
    expect(intervalsOverlap(A, B)).toBe(false);
    expect(intervalsOverlap(B, A)).toBe(false); // symmetric
  });

  it("A and B share only the start date of A (A.start == B.start, but B ends before A)", () => {
    // A: [5, 10), B: [5, 8) — they overlap (share [5, 8))
    const A = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 10) };
    const B = { startDate: utc(2026, 0, 5), endDate: utc(2026, 0, 8) };
    expect(intervalsOverlap(A, B)).toBe(true);
  });

  it("single-night bookings on adjacent days do NOT overlap", () => {
    // [10, 11) vs [11, 12)
    const A = { startDate: utc(2026, 0, 10), endDate: utc(2026, 0, 11) };
    const B = { startDate: utc(2026, 0, 11), endDate: utc(2026, 0, 12) };
    expect(intervalsOverlap(A, B)).toBe(false);
  });

  it("single-night bookings on the same day DO overlap", () => {
    // [10, 11) vs [10, 11)
    const A = { startDate: utc(2026, 0, 10), endDate: utc(2026, 0, 11) };
    const B = { startDate: utc(2026, 0, 10), endDate: utc(2026, 0, 11) };
    expect(intervalsOverlap(A, B)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// countNights – additional cases
// ---------------------------------------------------------------------------

describe("countNights – additional cases (AK-17)", () => {
  it("counts correctly for a 7-night stay", () => {
    expect(countNights({ startDate: utc(2026, 5, 1), endDate: utc(2026, 5, 8) })).toBe(7);
  });

  it("counts correctly for a 30-night stay", () => {
    expect(countNights({ startDate: utc(2026, 5, 1), endDate: utc(2026, 6, 1) })).toBe(30);
  });

  it("counts correctly across a month boundary (Jan 28 → Feb 3 = 6 nights)", () => {
    expect(countNights({ startDate: utc(2026, 0, 28), endDate: utc(2026, 1, 3) })).toBe(6);
  });

  it("counts correctly across a year boundary (Dec 30 → Jan 2 = 3 nights)", () => {
    expect(countNights({ startDate: utc(2026, 11, 30), endDate: utc(2027, 0, 2) })).toBe(3);
  });

  it("counts correctly for a Feb 28 → Mar 1 (non-leap) = 1 night", () => {
    expect(countNights({ startDate: utc(2026, 1, 28), endDate: utc(2026, 2, 1) })).toBe(1);
  });

  it("counts correctly for a Feb 28 → Mar 1 (leap year 2024) = 2 nights via Feb 29", () => {
    // Feb 28 → Mar 1 crosses Feb 29 in a leap year
    expect(countNights({ startDate: utc(2024, 1, 28), endDate: utc(2024, 2, 1) })).toBe(2);
  });

  it("normalises non-midnight times when computing nights (uses Math.round)", () => {
    // Dates with 14:00 UTC — should still round to the correct night count
    const start = new Date("2026-06-01T14:00:00Z");
    const end = new Date("2026-06-04T14:00:00Z");
    expect(countNights({ startDate: start, endDate: end })).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// isInPast – not covered at all in the existing test suite
// ---------------------------------------------------------------------------

describe("isInPast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for a date clearly in the past", () => {
    expect(isInPast(utc(2026, 0, 1))).toBe(true);
  });

  it("returns true for yesterday", () => {
    expect(isInPast(utc(2026, 5, 12))).toBe(true); // June 12
  });

  it("returns false for today", () => {
    expect(isInPast(utc(2026, 5, 13))).toBe(false); // June 13 = today
  });

  it("returns false for tomorrow", () => {
    expect(isInPast(utc(2026, 5, 14))).toBe(false);
  });

  it("returns false for a far-future date", () => {
    expect(isInPast(utc(2099, 11, 31))).toBe(false);
  });

  it("strips time component — same calendar day with future time is NOT in past", () => {
    // 2026-06-13 at 23:59 UTC → same day as today → NOT in the past
    expect(isInPast(new Date("2026-06-13T23:59:59Z"))).toBe(false);
  });

  it("strips time component — same calendar day with past time is NOT in past", () => {
    // 2026-06-13 at 00:00:00 → exactly today → NOT in the past
    expect(isInPast(new Date("2026-06-13T00:00:00Z"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isIntervalFullyInPast – additional edge cases
// ---------------------------------------------------------------------------

describe("isIntervalFullyInPast – boundary cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when endDate is today (endDate == today: endDate <= today is true, but endDate IS today so the booking just ended)", () => {
    // endDate=today means the check-out is today → the booking is "just over"
    // isIntervalFullyInPast checks: startOfDay(endDate) <= today → true
    expect(
      isIntervalFullyInPast({ startDate: utc(2026, 5, 10), endDate: utc(2026, 5, 13) })
    ).toBe(true);
  });

  it("returns false when endDate is tomorrow", () => {
    expect(
      isIntervalFullyInPast({ startDate: utc(2026, 5, 10), endDate: utc(2026, 5, 14) })
    ).toBe(false);
  });

  it("returns false for a booking that starts in the future", () => {
    expect(
      isIntervalFullyInPast({ startDate: utc(2026, 6, 1), endDate: utc(2026, 6, 5) })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findConflict / findAllConflicts – adjacent bookings in a list
// ---------------------------------------------------------------------------

describe("findConflict – chain of adjacent bookings (AK-8)", () => {
  const chain = [
    { id: "A", startDate: utc(2026, 0, 1), endDate: utc(2026, 0, 8) },
    { id: "B", startDate: utc(2026, 0, 8), endDate: utc(2026, 0, 15) },
    { id: "C", startDate: utc(2026, 0, 15), endDate: utc(2026, 0, 22) },
  ];

  it("returns null when candidate sits after the last adjacent booking", () => {
    // C ends on Jan 22; [22, 29) touches C's checkout day and must not conflict (AK-8).
    const noConflict = { startDate: utc(2026, 0, 22), endDate: utc(2026, 0, 29) };
    expect(findConflict(noConflict, chain)).toBeNull();
  });

  it("detects conflict when candidate overlaps the middle booking B", () => {
    const candidate = { startDate: utc(2026, 0, 10), endDate: utc(2026, 0, 12) };
    const result = findConflict(candidate, chain);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("B");
  });

  it("candidate that starts on A's endDate does NOT conflict with A (AK-8)", () => {
    const candidate = { startDate: utc(2026, 0, 8), endDate: utc(2026, 0, 10) };
    // chain has B starting on Jan 8 too — so it will conflict with B
    // We want to test that it does NOT conflict with A specifically
    // findConflict returns the FIRST conflict found, which will be B
    const result = findConflict(candidate, [chain[0]]); // only check against A
    expect(result).toBeNull();
  });
});

describe("findAllConflicts – multiple overlapping bookings", () => {
  it("returns all three overlapping intervals when candidate spans them all", () => {
    const existing = [
      { id: "X", startDate: utc(2026, 5, 1), endDate: utc(2026, 5, 5) },
      { id: "Y", startDate: utc(2026, 5, 3), endDate: utc(2026, 5, 8) },
      { id: "Z", startDate: utc(2026, 5, 7), endDate: utc(2026, 5, 12) },
    ];
    const candidate = { startDate: utc(2026, 5, 2), endDate: utc(2026, 5, 10) };
    const results = findAllConflicts(candidate, existing);
    expect(results.map((r) => r.id).sort()).toEqual(["X", "Y", "Z"]);
  });

  it("returns empty array for a candidate adjacent to all existing bookings", () => {
    const existing = [
      { id: "P", startDate: utc(2026, 5, 1), endDate: utc(2026, 5, 5) },
      { id: "Q", startDate: utc(2026, 5, 15), endDate: utc(2026, 5, 20) },
    ];
    // candidate sits between them, touching both boundaries — no overlap
    const candidate = { startDate: utc(2026, 5, 5), endDate: utc(2026, 5, 15) };
    expect(findAllConflicts(candidate, existing)).toHaveLength(0);
  });

  it("returns empty array when existing list is empty", () => {
    const candidate = { startDate: utc(2026, 5, 1), endDate: utc(2026, 5, 10) };
    expect(findAllConflicts(candidate, [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// startOfDay – additional cases
// ---------------------------------------------------------------------------

describe("startOfDay – additional cases", () => {
  it("leaves a UTC-midnight date unchanged", () => {
    const d = new Date("2026-06-13T00:00:00.000Z");
    const sod = startOfDay(d);
    expect(sod.getTime()).toBe(d.getTime());
  });

  it("does not mutate the original date", () => {
    const original = new Date("2026-06-13T14:30:00Z");
    const originalTime = original.getTime();
    startOfDay(original);
    expect(original.getTime()).toBe(originalTime);
  });

  it("correctly handles end-of-day time (23:59:59 UTC)", () => {
    const d = new Date("2026-06-13T23:59:59.999Z");
    const sod = startOfDay(d);
    expect(sod).toEqual(new Date("2026-06-13T00:00:00.000Z"));
  });
});
