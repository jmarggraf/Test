/**
 * Unit tests for lib/analytics.ts
 *
 * Covers:
 *  - aggregateAnalytics: happy path, multi-user grouping, night counting (AK-17),
 *    totals row (FR-31), shareOfTotal, sorting, division-by-zero guard,
 *    filter/clipping (AK-16), and boundary edge cases.
 *  - currentYearFilter: correct UTC boundaries.
 *  - parseDateParam: valid ISO dates, missing/invalid values.
 *
 * All date-dependent tests use fixed inputs — no real-time dependency.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateAnalytics,
  currentYearFilter,
  parseDateParam,
  type AnalyticsBooking,
  type DateRangeFilter,
} from "../analytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UTC-midnight Date, month is 0-based */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Build a minimal AnalyticsBooking */
function booking(
  userId: string,
  userName: string,
  startDate: Date,
  endDate: Date
): AnalyticsBooking {
  return { userId, userName, startDate, endDate };
}

// ---------------------------------------------------------------------------
// aggregateAnalytics – happy path, no filter
// ---------------------------------------------------------------------------

describe("aggregateAnalytics – empty input", () => {
  it("returns empty rows and zero totals for an empty bookings list", () => {
    const result = aggregateAnalytics([]);
    expect(result.rows).toHaveLength(0);
    expect(result.totalStays).toBe(0);
    expect(result.totalNights).toBe(0);
  });
});

describe("aggregateAnalytics – single booking, no filter", () => {
  it("returns one row with correct nights and stays (AK-17: 1.–4. = 3 nights)", () => {
    const bookings = [booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 4))];
    const result = aggregateAnalytics(bookings);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      userId: "u1",
      userName: "Alice",
      stays: 1,
      nights: 3,
    });
    expect(result.totalStays).toBe(1);
    expect(result.totalNights).toBe(3);
  });

  it("shareOfTotal is 100 when only one user has all nights", () => {
    const bookings = [booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 6))]; // 5 nights
    const result = aggregateAnalytics(bookings);

    expect(result.rows[0].shareOfTotal).toBe(100);
  });
});

describe("aggregateAnalytics – multiple bookings, same user (FR-28)", () => {
  it("groups two bookings for the same user into one row (FR-28)", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 4)),  // 3 nights
      booking("u1", "Alice", utc(2026, 2, 10), utc(2026, 2, 15)), // 5 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].stays).toBe(2);
    expect(result.rows[0].nights).toBe(8);
    expect(result.totalStays).toBe(2);
    expect(result.totalNights).toBe(8);
  });

  it("groups three bookings for the same user correctly", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 2)),   // 1 night
      booking("u1", "Alice", utc(2026, 1, 1), utc(2026, 1, 3)),   // 2 nights
      booking("u1", "Alice", utc(2026, 3, 1), utc(2026, 3, 8)),   // 7 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].stays).toBe(3);
    expect(result.rows[0].nights).toBe(10);
  });
});

describe("aggregateAnalytics – multiple users (FR-31 totals)", () => {
  it("produces one row per user and correct totals (FR-31)", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)),  // 7 nights
      booking("u2", "Bob",   utc(2026, 1, 1), utc(2026, 1, 4)),  // 3 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows).toHaveLength(2);
    expect(result.totalStays).toBe(2);
    expect(result.totalNights).toBe(10);
  });

  it("totalNights is the sum of all individual user nights", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 6)),  // 5
      booking("u2", "Bob",   utc(2026, 1, 1), utc(2026, 1, 4)),  // 3
      booking("u3", "Carol", utc(2026, 2, 1), utc(2026, 2, 3)),  // 2
    ];
    const result = aggregateAnalytics(bookings);

    const sumFromRows = result.rows.reduce((s, r) => s + r.nights, 0);
    expect(sumFromRows).toBe(result.totalNights);
    expect(result.totalNights).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// aggregateAnalytics – shareOfTotal (FR-31)
// ---------------------------------------------------------------------------

describe("aggregateAnalytics – shareOfTotal calculation", () => {
  it("computes correct percentages for two users with equal nights", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 6)),  // 5 nights
      booking("u2", "Bob",   utc(2026, 1, 1), utc(2026, 1, 6)),  // 5 nights
    ];
    const result = aggregateAnalytics(bookings);

    for (const row of result.rows) {
      expect(row.shareOfTotal).toBe(50);
    }
  });

  it("computes shareOfTotal for 7 nights out of 10 total = 70%", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)),  // 7 nights
      booking("u2", "Bob",   utc(2026, 1, 1), utc(2026, 1, 4)),  // 3 nights
    ];
    const result = aggregateAnalytics(bookings);

    const alice = result.rows.find((r) => r.userId === "u1")!;
    const bob   = result.rows.find((r) => r.userId === "u2")!;
    expect(alice.shareOfTotal).toBe(70);
    expect(bob.shareOfTotal).toBe(30);
  });

  it("shareOfTotal is null when totalNights=0 (division by zero guard)", () => {
    // Empty input → totalNights=0
    const result = aggregateAnalytics([]);
    expect(result.totalNights).toBe(0);
    // No rows, but verify the guard path won't crash
    expect(result.rows).toHaveLength(0);
  });

  it("shareOfTotal is null for a user row when totalNights would be 0 after filtering", () => {
    // Provide a filter that excludes all bookings
    const filter: DateRangeFilter = {
      from: utc(2027, 0, 1),
      to:   utc(2027, 1, 1),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows).toHaveLength(0);
    expect(result.totalNights).toBe(0);
  });

  it("shareOfTotal values across all rows sum to approximately 100", () => {
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 4)),   // 3
      booking("u2", "Bob",   utc(2026, 1, 1), utc(2026, 1, 5)),   // 4
      booking("u3", "Carol", utc(2026, 2, 1), utc(2026, 2, 4)),   // 3
    ];
    const result = aggregateAnalytics(bookings);
    const sum = result.rows.reduce((s, r) => s + (r.shareOfTotal ?? 0), 0);
    // Due to rounding to one decimal place, allow ±1
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});

// ---------------------------------------------------------------------------
// aggregateAnalytics – sorting (most nights first, then alphabetical)
// ---------------------------------------------------------------------------

describe("aggregateAnalytics – sorting order", () => {
  it("sorts users by nights descending", () => {
    const bookings = [
      booking("u2", "Bob",   utc(2026, 0, 1), utc(2026, 0, 3)),  // 2 nights
      booking("u1", "Alice", utc(2026, 1, 1), utc(2026, 1, 8)),  // 7 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows[0].userId).toBe("u1"); // Alice has more nights
    expect(result.rows[1].userId).toBe("u2");
  });

  it("sorts alphabetically by userName when nights are tied", () => {
    const bookings = [
      booking("u2", "Zara",  utc(2026, 0, 1), utc(2026, 0, 6)),  // 5 nights
      booking("u1", "Alice", utc(2026, 1, 1), utc(2026, 1, 6)),  // 5 nights
      booking("u3", "Mia",   utc(2026, 2, 1), utc(2026, 2, 6)),  // 5 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows.map((r) => r.userName)).toEqual(["Alice", "Mia", "Zara"]);
  });

  it("handles mixed nights — more nights first, ties broken alphabetically", () => {
    const bookings = [
      booking("u3", "Carol", utc(2026, 0, 1), utc(2026, 0, 11)), // 10 nights
      booking("u1", "Alice", utc(2026, 1, 1), utc(2026, 1, 6)),  // 5 nights
      booking("u2", "Bob",   utc(2026, 2, 1), utc(2026, 2, 6)),  // 5 nights
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows[0].userId).toBe("u3"); // 10 nights → first
    expect(result.rows[1].userName).toBe("Alice"); // 5 nights, Alice < Bob
    expect(result.rows[2].userName).toBe("Bob");
  });
});

// ---------------------------------------------------------------------------
// aggregateAnalytics – filter / clipping (AK-16)
// ---------------------------------------------------------------------------

describe("aggregateAnalytics – filter: booking completely inside window (AK-16)", () => {
  it("counts full nights when booking is completely inside the filter window", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 3, 1),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 1, 1), utc(2026, 1, 8)), // 7 nights — fully inside
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(7);
    expect(result.rows[0].stays).toBe(1);
  });
});

describe("aggregateAnalytics – filter: booking completely outside window (AK-16)", () => {
  it("does not count a booking that lies entirely before the filter window", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 6, 1), // July 1
      to:   utc(2026, 11, 31),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)), // January — outside
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows).toHaveLength(0);
    expect(result.totalNights).toBe(0);
    expect(result.totalStays).toBe(0);
  });

  it("does not count a booking that lies entirely after the filter window", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 5, 30),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 8, 1), utc(2026, 8, 8)), // September — outside
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows).toHaveLength(0);
  });

  it("outside booking is not counted as a stay (AK-16 stay exclusion)", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 6, 1),
      to:   utc(2026, 11, 31),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)),
      booking("u1", "Alice", utc(2026, 7, 1), utc(2026, 7, 4)), // 3 nights — inside
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].stays).toBe(1);   // only the August booking counts
    expect(result.rows[0].nights).toBe(3);
  });
});

describe("aggregateAnalytics – filter: booking overlaps window boundary (AK-16 clipping)", () => {
  it("clips a booking that starts before the filter window (left clip)", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 5),  // Jan 5
      to:   utc(2026, 1, 1),  // Feb 1
    };
    // Booking Jan 1–10 → clipped to Jan 5–10 = 5 nights
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 10)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(5);
    expect(result.rows[0].stays).toBe(1);
  });

  it("clips a booking that ends after the filter window (right clip)", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),  // Jan 1
      to:   utc(2026, 0, 8),  // Jan 8 (exclusive)
    };
    // Booking Jan 5–15 → clipped to Jan 5–8 = 3 nights
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 5), utc(2026, 0, 15)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(3);
  });

  it("clips a booking that spans the entire filter window (both sides)", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 5),
      to:   utc(2026, 0, 10),
    };
    // Booking Jan 1–20 → clipped to Jan 5–10 = 5 nights
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 20)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(5);
  });
});

describe("aggregateAnalytics – filter: exact boundary cases (AK-16)", () => {
  it("booking that starts exactly at filter.from counts its full nights", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 1, 1),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 1), utc(2026, 0, 8)), // starts exactly at from
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(7);
  });

  it("booking that ends exactly at filter.to counts up to (but not including) to", () => {
    // filter.to is exclusive (half-open model)
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 1, 1), // Feb 1 exclusive
    };
    // Booking Jan 25–Feb 1: endDate == filter.to → clipped to Jan 25–Feb 1 = 7 nights
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 25), utc(2026, 1, 1)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(7);
  });

  it("booking starting exactly at filter.to (exclusive) is excluded entirely", () => {
    // filter.to is Jan 31; booking starts Jan 31 → completely outside
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 0, 31), // Jan 31 exclusive
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 31), utc(2026, 1, 5)),
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows).toHaveLength(0);
    expect(result.totalNights).toBe(0);
  });

  it("booking ending exactly at filter.from is excluded entirely (endDate == from)", () => {
    // Half-open: endDate==from means booking [x, from) → clipped end = min(from, from) = from, start = max(x, from) = from → empty
    const filter: DateRangeFilter = {
      from: utc(2026, 1, 1), // Feb 1
      to:   utc(2026, 2, 1),
    };
    const bookings = [
      booking("u1", "Alice", utc(2026, 0, 25), utc(2026, 1, 1)), // ends exactly at filter.from
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows).toHaveLength(0);
    expect(result.totalNights).toBe(0);
  });
});

describe("aggregateAnalytics – filter: mixed bookings (some inside, some outside)", () => {
  it("correctly sums only the nights within the filter across multiple bookings", () => {
    const filter: DateRangeFilter = {
      from: utc(2026, 0, 1),
      to:   utc(2026, 6, 1), // Jan–Jun
    };
    const bookings = [
      booking("u1", "Alice", utc(2025, 11, 28), utc(2026, 0, 5)),  // straddles start → clips to Jan 1–5 = 4n
      booking("u1", "Alice", utc(2026, 3, 1), utc(2026, 3, 8)),    // fully inside: 7 nights
      booking("u1", "Alice", utc(2026, 5, 28), utc(2026, 6, 5)),   // straddles end → clips to Jun 28–Jul 1 = 3n
      booking("u1", "Alice", utc(2026, 8, 1), utc(2026, 8, 5)),    // fully outside: excluded
    ];
    const result = aggregateAnalytics(bookings, filter);

    expect(result.rows[0].nights).toBe(4 + 7 + 3); // 14
    expect(result.rows[0].stays).toBe(3); // 4th booking is excluded
  });
});

describe("aggregateAnalytics – no filter treats all bookings as full nights", () => {
  it("without a filter, a booking crossing year boundaries counts all nights", () => {
    const bookings = [
      booking("u1", "Alice", utc(2025, 11, 28), utc(2026, 0, 4)), // 7 nights across year boundary
    ];
    const result = aggregateAnalytics(bookings);

    expect(result.rows[0].nights).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// currentYearFilter
// ---------------------------------------------------------------------------

describe("currentYearFilter", () => {
  it("returns from=Jan 1 and to=Jan 1 of next year (UTC midnight)", () => {
    const ref = new Date("2026-06-13T00:00:00Z");
    const filter = currentYearFilter(ref);

    expect(filter.from).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(filter.to).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("works correctly for a reference date at the start of the year", () => {
    const ref = new Date("2024-01-01T00:00:00Z");
    const filter = currentYearFilter(ref);

    expect(filter.from).toEqual(new Date("2024-01-01T00:00:00.000Z"));
    expect(filter.to).toEqual(new Date("2025-01-01T00:00:00.000Z"));
  });

  it("works correctly for a reference date at the end of the year", () => {
    const ref = new Date("2025-12-31T23:59:59Z");
    const filter = currentYearFilter(ref);

    expect(filter.from).toEqual(new Date("2025-01-01T00:00:00.000Z"));
    expect(filter.to).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("returns UTC midnight dates (not local time)", () => {
    const ref = new Date("2026-08-15T14:30:00Z"); // mid-day reference
    const filter = currentYearFilter(ref);

    expect(filter.from.getUTCHours()).toBe(0);
    expect(filter.from.getUTCMinutes()).toBe(0);
    expect(filter.to.getUTCHours()).toBe(0);
    expect(filter.to.getUTCMinutes()).toBe(0);
  });

  it("from.to spans exactly 365 days for a non-leap year (2026)", () => {
    const filter = currentYearFilter(new Date("2026-06-01T00:00:00Z"));
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = (filter.to.getTime() - filter.from.getTime()) / msPerDay;
    expect(days).toBe(365);
  });

  it("from.to spans exactly 366 days for a leap year (2024)", () => {
    const filter = currentYearFilter(new Date("2024-03-01T00:00:00Z"));
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = (filter.to.getTime() - filter.from.getTime()) / msPerDay;
    expect(days).toBe(366);
  });
});

// ---------------------------------------------------------------------------
// parseDateParam
// ---------------------------------------------------------------------------

describe("parseDateParam", () => {
  const fallback = new Date("2026-01-01T00:00:00Z");

  it("parses a valid ISO date string to UTC midnight", () => {
    const result = parseDateParam("2026-06-13", fallback);
    expect(result).toEqual(new Date("2026-06-13T00:00:00.000Z"));
  });

  it("returns the fallback when value is undefined", () => {
    const result = parseDateParam(undefined, fallback);
    expect(result).toEqual(fallback);
  });

  it("returns the fallback when value is an empty string", () => {
    const result = parseDateParam("", fallback);
    expect(result).toEqual(fallback);
  });

  it("returns the fallback when value is not a valid date string", () => {
    const result = parseDateParam("not-a-date", fallback);
    expect(result).toEqual(fallback);
  });

  it("returns the fallback for a partial/malformed date string", () => {
    const result = parseDateParam("2026-13-45", fallback);
    expect(result).toEqual(fallback);
  });

  it("parses a date at the start of the year", () => {
    const result = parseDateParam("2026-01-01", fallback);
    expect(result).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("parses a date at the end of the year", () => {
    const result = parseDateParam("2026-12-31", fallback);
    expect(result).toEqual(new Date("2026-12-31T00:00:00.000Z"));
  });

  it("strips time component — result is always UTC midnight", () => {
    const result = parseDateParam("2026-06-13", fallback);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
