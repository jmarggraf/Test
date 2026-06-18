/**
 * Unit tests for lib/calendarUtils.ts
 *
 * Covers: buildMonthGrid, prevMonth, nextMonth, bookingCoversDay.
 * All tests are deterministic (fixed dates only, no dependency on "today").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildMonthGrid,
  prevMonth,
  nextMonth,
  bookingCoversDay,
} from "../calendarUtils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a UTC-midnight Date for a given year/month(0-based)/day. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// ---------------------------------------------------------------------------
// buildMonthGrid
// ---------------------------------------------------------------------------

describe("buildMonthGrid – grid dimensions", () => {
  it("always returns exactly 6 rows of 7 columns (42 cells)", () => {
    // Test several months that start on different weekdays
    const cases: [number, number][] = [
      [2026, 0],  // Jan 2026: starts Thursday
      [2026, 1],  // Feb 2026: starts Sunday
      [2026, 5],  // Jun 2026: starts Monday (grid might only need 4 or 5 weeks)
      [2025, 11], // Dec 2025: starts Monday
    ];
    for (const [year, month] of cases) {
      const grid = buildMonthGrid(year, month);
      expect(grid).toHaveLength(6);
      for (const row of grid) {
        expect(row).toHaveLength(7);
      }
    }
  });

  it("contains exactly 42 unique consecutive days", () => {
    const grid = buildMonthGrid(2026, 2); // March 2026
    const cells = grid.flat();
    expect(cells).toHaveLength(42);
    // Each day is exactly 1 day after the previous
    for (let i = 1; i < cells.length; i++) {
      const diffMs = cells[i].date.getTime() - cells[i - 1].date.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });
});

describe("buildMonthGrid – grid starts on Monday (ISO week)", () => {
  it("first cell of grid is always a Monday", () => {
    const months: [number, number][] = [
      [2026, 0],
      [2026, 3],
      [2026, 6],
      [2026, 9],
    ];
    for (const [year, month] of months) {
      const grid = buildMonthGrid(year, month);
      const firstDay = grid[0][0].date;
      // UTC day: 0=Sun, 1=Mon … 6=Sat
      expect(firstDay.getUTCDay()).toBe(1);
    }
  });

  it("Feb 2026: grid starts on 2026-01-26 (Monday before Feb 1)", () => {
    // Feb 1, 2026 is a Sunday (UTC day=0) → grid goes back to Mon 2026-01-26
    const grid = buildMonthGrid(2026, 1);
    const firstCell = grid[0][0].date;
    expect(firstCell).toEqual(utc(2026, 0, 26));
  });

  it("Mar 2026: grid starts on 2026-02-23 (March 1 is Sunday → back to Mon Feb 23)", () => {
    // March 1, 2026 is a Sunday → grid back to Mon Feb 23
    const grid = buildMonthGrid(2026, 2);
    const firstCell = grid[0][0].date;
    expect(firstCell).toEqual(utc(2026, 1, 23));
  });

  it("June 2026: grid starts on 2026-06-01 (June 1 is Monday, no padding needed)", () => {
    // June 1, 2026 is a Monday — the grid should start on June 1 itself
    const grid = buildMonthGrid(2026, 5);
    const firstCell = grid[0][0].date;
    expect(firstCell).toEqual(utc(2026, 5, 1));
  });
});

describe("buildMonthGrid – isCurrentMonth flag", () => {
  it("marks all days of the target month as isCurrentMonth=true", () => {
    const grid = buildMonthGrid(2026, 2); // March 2026 has 31 days
    const marchDays = grid.flat().filter((c) => c.isCurrentMonth);
    expect(marchDays).toHaveLength(31);
    for (const cell of marchDays) {
      expect(cell.date.getUTCFullYear()).toBe(2026);
      expect(cell.date.getUTCMonth()).toBe(2);
    }
  });

  it("marks padding days (from other months) as isCurrentMonth=false", () => {
    const grid = buildMonthGrid(2026, 1); // February 2026
    const paddingDays = grid.flat().filter((c) => !c.isCurrentMonth);
    // There must be at least the days from Jan 26-31 (6 days) + days in March
    expect(paddingDays.length).toBeGreaterThan(0);
    for (const cell of paddingDays) {
      // Each padding cell is either in January or March
      const m = cell.date.getUTCMonth();
      expect(m === 0 || m === 2).toBe(true);
    }
  });

  it("February 2026 has exactly 28 days marked as current month", () => {
    const grid = buildMonthGrid(2026, 1);
    const febDays = grid.flat().filter((c) => c.isCurrentMonth);
    expect(febDays).toHaveLength(28);
  });
});

describe("buildMonthGrid – leap year February", () => {
  it("February 2024 (leap) has exactly 29 days marked as current month", () => {
    const grid = buildMonthGrid(2024, 1);
    const febDays = grid.flat().filter((c) => c.isCurrentMonth);
    expect(febDays).toHaveLength(29);
  });

  it("February 2100 (not a leap year) has exactly 28 days", () => {
    const grid = buildMonthGrid(2100, 1);
    const febDays = grid.flat().filter((c) => c.isCurrentMonth);
    expect(febDays).toHaveLength(28);
  });

  it("grid for Feb 2024 still has 42 cells total", () => {
    const grid = buildMonthGrid(2024, 1);
    expect(grid.flat()).toHaveLength(42);
  });
});

describe("buildMonthGrid – isToday flag", () => {
  beforeEach(() => {
    // Pin system time to 2026-06-13 UTC midnight
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks exactly one cell as isToday=true within the target month", () => {
    const grid = buildMonthGrid(2026, 5); // June 2026
    const todayCells = grid.flat().filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toEqual(utc(2026, 5, 13));
  });

  it("marks no cell as isToday=true when today is not in the grid's range", () => {
    // The grid for June 2026 starts June 1 and ends around July 12
    // "today" is June 13, so it IS in this grid — test a different month
    const grid = buildMonthGrid(2025, 0); // January 2025 — far from June 2026
    const todayCells = grid.flat().filter((c) => c.isToday);
    expect(todayCells).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// prevMonth / nextMonth
// ---------------------------------------------------------------------------

describe("prevMonth", () => {
  it("February → January (same year)", () => {
    expect(prevMonth(2026, 1)).toEqual({ year: 2026, month: 0 });
  });

  it("December → November (same year)", () => {
    expect(prevMonth(2026, 11)).toEqual({ year: 2026, month: 10 });
  });

  it("January → December with year wrap-around (Jan → Dec previous year)", () => {
    expect(prevMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
  });

  it("year boundary: Jan 2000 → Dec 1999", () => {
    expect(prevMonth(2000, 0)).toEqual({ year: 1999, month: 11 });
  });
});

describe("nextMonth", () => {
  it("January → February (same year)", () => {
    expect(nextMonth(2026, 0)).toEqual({ year: 2026, month: 1 });
  });

  it("November → December (same year)", () => {
    expect(nextMonth(2026, 10)).toEqual({ year: 2026, month: 11 });
  });

  it("December → January with year wrap-around (Dec → Jan next year)", () => {
    expect(nextMonth(2026, 11)).toEqual({ year: 2027, month: 0 });
  });

  it("year boundary: Dec 1999 → Jan 2000", () => {
    expect(nextMonth(1999, 11)).toEqual({ year: 2000, month: 0 });
  });
});

describe("prevMonth / nextMonth – round-trip", () => {
  it("nextMonth(prevMonth(y, m)) == { year: y, month: m } for all months", () => {
    for (let m = 0; m < 12; m++) {
      const prev = prevMonth(2026, m);
      const roundTrip = nextMonth(prev.year, prev.month);
      expect(roundTrip).toEqual({ year: 2026, month: m });
    }
  });

  it("prevMonth(nextMonth(y, m)) == { year: y, month: m } for all months", () => {
    for (let m = 0; m < 12; m++) {
      const next = nextMonth(2026, m);
      const roundTrip = prevMonth(next.year, next.month);
      expect(roundTrip).toEqual({ year: 2026, month: m });
    }
  });
});

// ---------------------------------------------------------------------------
// bookingCoversDay – half-open interval [startDate, endDate) (BR-1, AK-8)
// ---------------------------------------------------------------------------

describe("bookingCoversDay – half-open interval model (BR-1)", () => {
  const booking = {
    startDate: utc(2026, 5, 10), // June 10
    endDate: utc(2026, 5, 15),   // June 15 (exclusive)
  };

  it("covers the check-in day (startDate)", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 10))).toBe(true);
  });

  it("covers an interior day", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 12))).toBe(true);
  });

  it("covers the day before endDate (last night)", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 14))).toBe(true);
  });

  it("does NOT cover the endDate (check-out day is exclusive – AK-8)", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 15))).toBe(false);
  });

  it("does NOT cover a day before startDate", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 9))).toBe(false);
  });

  it("does NOT cover a day after endDate", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 16))).toBe(false);
  });
});

describe("bookingCoversDay – single-night booking", () => {
  const booking = {
    startDate: utc(2026, 5, 10), // June 10
    endDate: utc(2026, 5, 11),   // June 11 (exclusive) → 1 night
  };

  it("covers the single occupied day (check-in)", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 10))).toBe(true);
  });

  it("does NOT cover the check-out day (endDate)", () => {
    expect(bookingCoversDay(booking, utc(2026, 5, 11))).toBe(false);
  });
});

describe("bookingCoversDay – with time components (normalises to UTC midnight)", () => {
  const booking = {
    startDate: new Date("2026-06-10T14:00:00Z"),
    endDate: new Date("2026-06-15T14:00:00Z"),
  };

  it("still covers check-in day when booking has non-midnight times", () => {
    expect(bookingCoversDay(booking, new Date("2026-06-10T08:00:00Z"))).toBe(true);
  });

  it("still rejects endDate when booking has non-midnight times", () => {
    expect(bookingCoversDay(booking, new Date("2026-06-15T23:59:59Z"))).toBe(false);
  });
});

describe("bookingCoversDay – same-day checkout/checkin chain (AK-8)", () => {
  // Booking A: June 10–15, Booking B: June 15–20
  // The checkout day of A (June 15) is covered by B but NOT by A.
  const bookingA = { startDate: utc(2026, 5, 10), endDate: utc(2026, 5, 15) };
  const bookingB = { startDate: utc(2026, 5, 15), endDate: utc(2026, 5, 20) };

  it("bookingA does not cover June 15 (its checkout day)", () => {
    expect(bookingCoversDay(bookingA, utc(2026, 5, 15))).toBe(false);
  });

  it("bookingB covers June 15 (its check-in day)", () => {
    expect(bookingCoversDay(bookingB, utc(2026, 5, 15))).toBe(true);
  });
});
