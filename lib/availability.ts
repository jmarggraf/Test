/**
 * Core availability / conflict-check logic.
 *
 * All functions are pure (no I/O) so they can be tested independently.
 *
 * Time model (BR-1):
 *   - Intervals are HALF-OPEN: [startDate, endDate)
 *   - endDate is the check-out day and does NOT count as an occupied night.
 *   - Number of nights = endDate - startDate (in days).
 *   - A booking ending on day 10 and one starting on day 10 do NOT overlap.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DateInterval {
  startDate: Date;
  endDate: Date;
}

// ---------------------------------------------------------------------------
// Core overlap check (BR-1)
// ---------------------------------------------------------------------------

/**
 * Returns true if two half-open intervals [a.start, a.end) and [b.start, b.end)
 * overlap.
 *
 * Two intervals overlap iff a.start < b.end AND b.start < a.end.
 * Check-out/check-in on the same day is NOT an overlap.
 */
export function intervalsOverlap(a: DateInterval, b: DateInterval): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

// ---------------------------------------------------------------------------
// Night count (BR-1, AK-17)
// ---------------------------------------------------------------------------

/**
 * Returns the number of nights for a booking.
 * nights = endDate - startDate (in full days).
 *
 * Throws if endDate <= startDate (invalid interval).
 */
export function countNights(interval: DateInterval): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const nights = Math.round(
    (interval.endDate.getTime() - interval.startDate.getTime()) / msPerDay
  );
  if (nights <= 0) {
    throw new RangeError(
      `endDate must be after startDate (got ${nights} nights)`
    );
  }
  return nights;
}

// ---------------------------------------------------------------------------
// Conflict detection against a list of existing intervals
// ---------------------------------------------------------------------------

/**
 * Checks whether a candidate interval conflicts with any interval in the
 * existing list.
 *
 * @param candidate  The interval to check (new or updated booking).
 * @param existing   The intervals to check against (e.g. all CONFIRMED bookings,
 *                   optionally excluding the candidate itself by id).
 * @returns The first conflicting interval found, or null if no conflict.
 */
export function findConflict<T extends DateInterval>(
  candidate: DateInterval,
  existing: T[]
): T | null {
  for (const interval of existing) {
    if (intervalsOverlap(candidate, interval)) {
      return interval;
    }
  }
  return null;
}

/**
 * Returns all intervals from the existing list that conflict with the
 * candidate interval.
 */
export function findAllConflicts<T extends DateInterval>(
  candidate: DateInterval,
  existing: T[]
): T[] {
  return existing.filter((interval) => intervalsOverlap(candidate, interval));
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given date is strictly in the past (before today).
 * Comparison is done at day granularity (time part is ignored).
 */
export function isInPast(date: Date): boolean {
  const today = startOfDay(new Date());
  return startOfDay(date) < today;
}

/**
 * Returns true if the entire booking interval lies in the past.
 * endDate is exclusive, so we check endDate <= today.
 */
export function isIntervalFullyInPast(interval: DateInterval): boolean {
  const today = startOfDay(new Date());
  return startOfDay(interval.endDate) <= today;
}

/**
 * Strips the time component from a Date (returns midnight UTC).
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
