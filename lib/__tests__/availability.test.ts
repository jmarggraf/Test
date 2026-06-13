/**
 * Smoke tests for core availability / conflict-check logic.
 *
 * These tests cover the critical business rules (BR-1) to ensure correctness
 * of the half-open interval model before the booking UI is built in Stage 2.
 */
import { describe, it, expect } from "vitest";
import {
  intervalsOverlap,
  countNights,
  findConflict,
  findAllConflicts,
  isIntervalFullyInPast,
  startOfDay,
} from "../availability";

// Helper: create a Date at a given UTC day offset from 2026-01-01
function day(offset: number): Date {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

describe("intervalsOverlap (BR-1 half-open intervals)", () => {
  it("detects a clear overlap", () => {
    // [1, 5) vs [3, 7) — overlap at [3, 5)
    expect(intervalsOverlap({ startDate: day(1), endDate: day(5) }, { startDate: day(3), endDate: day(7) })).toBe(true);
  });

  it("does NOT overlap when A ends where B starts (AK-8)", () => {
    // Booking A ends on day 10, booking B starts on day 10 → NOT a conflict
    expect(intervalsOverlap({ startDate: day(0), endDate: day(10) }, { startDate: day(10), endDate: day(15) })).toBe(false);
  });

  it("does NOT overlap when B ends where A starts", () => {
    expect(intervalsOverlap({ startDate: day(10), endDate: day(15) }, { startDate: day(5), endDate: day(10) })).toBe(false);
  });

  it("detects overlap when intervals are identical", () => {
    expect(intervalsOverlap({ startDate: day(1), endDate: day(5) }, { startDate: day(1), endDate: day(5) })).toBe(true);
  });

  it("detects overlap when one interval is contained inside the other", () => {
    expect(intervalsOverlap({ startDate: day(1), endDate: day(10) }, { startDate: day(3), endDate: day(6) })).toBe(true);
  });

  it("does not overlap for completely separate intervals", () => {
    expect(intervalsOverlap({ startDate: day(1), endDate: day(5) }, { startDate: day(6), endDate: day(10) })).toBe(false);
  });
});

describe("countNights (BR-1, AK-17)", () => {
  it("counts 3 nights for a 1st–4th booking (AK-17)", () => {
    // startDate Jan 1, endDate Jan 4 → 3 nights
    expect(countNights({ startDate: new Date("2026-01-01"), endDate: new Date("2026-01-04") })).toBe(3);
  });

  it("counts 1 night for a one-night stay", () => {
    expect(countNights({ startDate: day(0), endDate: day(1) })).toBe(1);
  });

  it("throws for zero-night (start == end)", () => {
    expect(() => countNights({ startDate: day(5), endDate: day(5) })).toThrow(RangeError);
  });

  it("throws for negative nights (start > end)", () => {
    expect(() => countNights({ startDate: day(5), endDate: day(3) })).toThrow(RangeError);
  });
});

describe("findConflict", () => {
  const existing = [
    { startDate: day(10), endDate: day(15), id: "A" },
    { startDate: day(20), endDate: day(25), id: "B" },
  ];

  it("returns null when no conflict", () => {
    expect(findConflict({ startDate: day(5), endDate: day(10) }, existing)).toBeNull();
  });

  it("returns the conflicting interval", () => {
    const result = findConflict({ startDate: day(12), endDate: day(16) }, existing);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("A");
  });

  it("returns null for empty existing list", () => {
    expect(findConflict({ startDate: day(1), endDate: day(5) }, [])).toBeNull();
  });
});

describe("findAllConflicts", () => {
  const existing = [
    { startDate: day(5), endDate: day(10), id: "A" },
    { startDate: day(8), endDate: day(14), id: "B" },
    { startDate: day(20), endDate: day(25), id: "C" },
  ];

  it("returns all overlapping intervals", () => {
    const results = findAllConflicts({ startDate: day(7), endDate: day(12) }, existing);
    expect(results.map((r) => r.id).sort()).toEqual(["A", "B"]);
  });

  it("returns empty array when no conflict", () => {
    expect(findAllConflicts({ startDate: day(15), endDate: day(18) }, existing)).toHaveLength(0);
  });
});

describe("isIntervalFullyInPast", () => {
  it("considers a far-future interval as not in the past", () => {
    // Use absolute future dates well beyond any reasonable current date
    const futureStart = new Date("2099-01-01T00:00:00Z");
    const futureEnd = new Date("2099-01-10T00:00:00Z");
    expect(isIntervalFullyInPast({ startDate: futureStart, endDate: futureEnd })).toBe(false);
  });

  it("considers an interval ending in the past as fully in the past", () => {
    const pastStart = new Date("2000-01-01T00:00:00Z");
    const pastEnd = new Date("2000-01-10T00:00:00Z");
    expect(isIntervalFullyInPast({ startDate: pastStart, endDate: pastEnd })).toBe(true);
  });
});

describe("startOfDay", () => {
  it("strips time component to UTC midnight", () => {
    const d = new Date("2026-03-15T14:30:00Z");
    const sod = startOfDay(d);
    expect(sod.getUTCHours()).toBe(0);
    expect(sod.getUTCMinutes()).toBe(0);
    expect(sod.getUTCFullYear()).toBe(2026);
    expect(sod.getUTCMonth()).toBe(2); // March
    expect(sod.getUTCDate()).toBe(15);
  });
});
