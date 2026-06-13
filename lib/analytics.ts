/**
 * Analytics aggregation logic (FR-28..FR-32).
 *
 * All functions are pure (no I/O) and use the same half-open interval model
 * as lib/availability.ts (BR-1).
 *
 * Clipping decision (AK-16 / FR-30):
 *   When a filter range [from, to) is given, only nights that fall within that
 *   range are counted.  A booking's effective interval is clipped to
 *   [max(startDate, from), min(endDate, to)).  If the clipped interval is empty
 *   (i.e. the booking lies completely outside the filter), the booking
 *   contributes 0 nights and does NOT count as a stay for that period.
 *   This is consistent with BR-1's half-open model and makes the filter
 *   semantics predictable: the total nights column always equals the sum of
 *   individually visible nights.
 */

import { countNights, startOfDay } from "./availability";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal booking shape required for analytics — no DB dependency. */
export interface AnalyticsBooking {
  userId: string;
  userName: string;
  startDate: Date;
  endDate: Date;
}

/** Optional date-range filter (both boundaries are UTC day-level dates). */
export interface DateRangeFilter {
  /** Inclusive lower bound (first day of the filter window). */
  from: Date;
  /**
   * Exclusive upper bound (first day AFTER the filter window).
   * Matches the half-open interval model used throughout the project.
   */
  to: Date;
}

/** Per-user aggregation result row. */
export interface UserAnalyticsRow {
  userId: string;
  userName: string;
  /** Number of stays that have at least one night within the filter range. */
  stays: number;
  /** Total nights within the (optionally filtered) range. */
  nights: number;
  /**
   * Share of the user's nights out of all nights (0–1).
   * null when totalNights === 0 (division by zero guard).
   */
  shareOfTotal: number | null;
}

/** Full analytics result including a totals row. */
export interface AnalyticsResult {
  rows: UserAnalyticsRow[];
  totalStays: number;
  totalNights: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of nights of `booking` that fall within `[from, to)`.
 * Returns 0 if the booking does not overlap with the filter window at all.
 *
 * The clipped interval is: [max(booking.startDate, from), min(booking.endDate, to))
 */
function clippedNights(
  booking: AnalyticsBooking,
  filter: DateRangeFilter
): number {
  const clippedStart =
    booking.startDate >= filter.from ? booking.startDate : filter.from;
  const clippedEnd =
    booking.endDate <= filter.to ? booking.endDate : filter.to;

  if (clippedStart >= clippedEnd) {
    return 0;
  }
  return countNights({ startDate: clippedStart, endDate: clippedEnd });
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates analytics data from a list of CONFIRMED bookings.
 *
 * @param bookings  List of CONFIRMED bookings (with userId, userName,
 *                  startDate, endDate).  The caller is responsible for
 *                  pre-filtering to CONFIRMED status (FR-29).
 * @param filter    Optional date-range filter.  When provided, only nights
 *                  within [filter.from, filter.to) are counted (AK-16).
 *                  Bookings that fall completely outside are excluded.
 *                  When omitted, all nights of all bookings are counted.
 * @returns         Aggregated rows (one per user, sorted by nights desc, then
 *                  name asc) plus totals.
 */
export function aggregateAnalytics(
  bookings: AnalyticsBooking[],
  filter?: DateRangeFilter
): AnalyticsResult {
  // Accumulator keyed by userId
  const acc = new Map<
    string,
    { userName: string; stays: number; nights: number }
  >();

  for (const booking of bookings) {
    let nights: number;

    if (filter) {
      nights = clippedNights(booking, filter);
      // A booking outside the filter window is not counted at all (AK-16)
      if (nights === 0) continue;
    } else {
      nights = countNights({
        startDate: booking.startDate,
        endDate: booking.endDate,
      });
    }

    const existing = acc.get(booking.userId);
    if (existing) {
      existing.stays += 1;
      existing.nights += nights;
    } else {
      acc.set(booking.userId, {
        userName: booking.userName,
        stays: 1,
        nights,
      });
    }
  }

  // Compute totals
  let totalNights = 0;
  let totalStays = 0;
  for (const { stays, nights } of acc.values()) {
    totalStays += stays;
    totalNights += nights;
  }

  // Build result rows (sorted: most nights first, then alphabetically by name)
  const rows: UserAnalyticsRow[] = Array.from(acc.entries())
    .map(([userId, { userName, stays, nights }]) => ({
      userId,
      userName,
      stays,
      nights,
      shareOfTotal:
        totalNights > 0 ? Math.round((nights / totalNights) * 1000) / 10 : null,
    }))
    .sort((a, b) => {
      if (b.nights !== a.nights) return b.nights - a.nights;
      return a.userName.localeCompare(b.userName, "de");
    });

  return { rows, totalStays, totalNights };
}

// ---------------------------------------------------------------------------
// Date-range helpers for the default filter (current calendar year)
// ---------------------------------------------------------------------------

/**
 * Returns a DateRangeFilter for the full calendar year of `referenceDate`.
 * Both boundaries are at UTC midnight, consistent with startOfDay().
 */
export function currentYearFilter(referenceDate: Date = new Date()): DateRangeFilter {
  const year = referenceDate.getUTCFullYear();
  return {
    from: startOfDay(new Date(Date.UTC(year, 0, 1))),
    to: startOfDay(new Date(Date.UTC(year + 1, 0, 1))),
  };
}

/**
 * Parses an optional ISO-date string (YYYY-MM-DD) into a UTC midnight Date.
 * Returns `fallback` if the string is absent or not a valid date.
 */
export function parseDateParam(
  value: string | undefined,
  fallback: Date
): Date {
  if (!value) return fallback;
  const ms = Date.parse(value);
  if (isNaN(ms)) return fallback;
  return startOfDay(new Date(ms));
}
