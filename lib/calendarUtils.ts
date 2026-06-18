/**
 * Pure utility functions for building the month-grid calendar view.
 *
 * No I/O — fully testable without a DB.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarDay {
  /** The date this cell represents */
  date: Date;
  /** Whether this day belongs to the currently displayed month */
  isCurrentMonth: boolean;
  /** Whether this is today */
  isToday: boolean;
}

// ---------------------------------------------------------------------------
// Month grid builder
// ---------------------------------------------------------------------------

/**
 * Returns the 6×7 (or 5×7) grid of days for a given month.
 * The grid always starts on Monday (ISO week convention).
 *
 * @param year   Full year, e.g. 2026
 * @param month  0-indexed month (0 = January)
 */
export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  const today = startOfUTCDay(new Date());

  // First day of the target month
  const firstOfMonth = new Date(Date.UTC(year, month, 1));

  // ISO weekday of the first: 0=Mon … 6=Sun
  const firstWeekday = isoWeekday(firstOfMonth);

  // Start of the grid = Monday on or before the first of the month
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() - firstWeekday);

  const days: CalendarDay[][] = [];
  const cursor = new Date(gridStart);

  // Build 6 weeks (42 cells) to always fill the grid completely
  for (let week = 0; week < 6; week++) {
    const row: CalendarDay[] = [];
    for (let dow = 0; dow < 7; dow++) {
      row.push({
        date: new Date(cursor),
        isCurrentMonth:
          cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month,
        isToday: cursor.getTime() === today.getTime(),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    days.push(row);
  }

  return days;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Returns { year, month } for the month before the given one. */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

/** Returns { year, month } for the month after the given one. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

// ---------------------------------------------------------------------------
// Booking overlap helpers for calendar rendering
// ---------------------------------------------------------------------------

/**
 * Returns true if the given booking interval covers (overlaps with) a specific day.
 * Uses the same half-open interval model as lib/availability.ts (BR-1):
 *   A booking is "on" a day if startDate <= day < endDate.
 */
export function bookingCoversDay(
  booking: { startDate: Date; endDate: Date },
  day: Date
): boolean {
  const d = startOfUTCDay(day);
  const start = startOfUTCDay(booking.startDate);
  const end = startOfUTCDay(booking.endDate);
  return start <= d && d < end;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Returns a locale-aware month + year heading, e.g. "Juni 2026". */
export function formatMonthHeading(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1));
  return d.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Formats a date as "DD.MM.YYYY" in UTC. */
export function formatDateDE(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Formats a date as "YYYY-MM-DD" (HTML date input value). */
export function formatDateISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns 0 (Mon) … 6 (Sun) for the given UTC date. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 ? 6 : day - 1;
}

/** Returns a Date at UTC midnight for the given date. */
function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
