/**
 * Analytics page (FR-28..FR-32, AK-15..AK-17).
 *
 * Server Component — reads search params directly.
 * Accessible to all authenticated members (A5 / requireUser).
 *
 * URL params:
 *   from  YYYY-MM-DD  start of filter window (inclusive)  — default: Jan 1 of current year
 *   to    YYYY-MM-DD  end of filter window (inclusive day) — default: Dec 31 of current year
 *
 * "to" in the URL is the last *inclusive* day shown to the user.  Internally
 * we convert it to the exclusive upper bound by adding one day, matching the
 * half-open interval model used throughout the project (BR-1).
 */

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import {
  aggregateAnalytics,
  currentYearFilter,
  parseDateParam,
  type DateRangeFilter,
} from "@/lib/analytics";
import { startOfDay } from "@/lib/availability";

export const metadata = {
  title: "Auswertung – Ferienhaus-Kalender",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a UTC-midnight Date as YYYY-MM-DD for the <input type="date"> value. */
function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds one UTC day to a Date (used to convert inclusive "to" -> exclusive upper bound). */
function addOneDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

/** Subtracts one UTC day from a Date (exclusive upper bound -> inclusive display date). */
function subOneDay(d: Date): Date {
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  await requireUser();

  const params = await searchParams;

  // Default filter: current calendar year
  const defaultFilter = currentYearFilter(new Date());

  // Parse "from" (inclusive start)
  const filterFrom = parseDateParam(params.from, defaultFilter.from);

  // Parse "to" — user sees inclusive end day; internally we need exclusive upper bound
  const toInclusive = parseDateParam(
    params.to,
    subOneDay(defaultFilter.to) // default: Dec 31 of current year
  );
  const filterTo = startOfDay(addOneDay(toInclusive));

  // Guard: from must be before to
  const isValidRange = filterFrom < filterTo;

  const filter: DateRangeFilter = isValidRange
    ? { from: filterFrom, to: filterTo }
    : defaultFilter;

  // Fetch all CONFIRMED bookings with owner name (FR-29)
  const bookings = await prisma.booking.findMany({
    where: { status: BookingStatus.CONFIRMED },
    select: {
      userId: true,
      startDate: true,
      endDate: true,
      user: { select: { name: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const analyticsInput = bookings.map((b) => ({
    userId: b.userId,
    userName: b.user.name,
    startDate: b.startDate,
    endDate: b.endDate,
  }));

  const result = aggregateAnalytics(analyticsInput, filter);

  // Display values for the filter form
  const displayFrom = toInputDate(filter.from);
  const displayTo = toInputDate(subOneDay(filter.to));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Auswertung</h1>
        <p className="text-sm text-gray-500 mt-1">
          Nutzungsverteilung des Ferienhauses (nur bestätigte Buchungen).
        </p>
      </div>

      {/* Filter form */}
      <form
        method="GET"
        className="bg-white rounded-xl border border-gray-200 px-6 py-4 flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="from"
            className="text-xs font-medium text-gray-500 uppercase tracking-wide"
          >
            Von
          </label>
          <input
            type="date"
            id="from"
            name="from"
            defaultValue={displayFrom}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="to"
            className="text-xs font-medium text-gray-500 uppercase tracking-wide"
          >
            Bis (einschließlich)
          </label>
          <input
            type="date"
            id="to"
            name="to"
            defaultValue={displayTo}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Filtern
        </button>
        <a
          href="/analytics"
          className="px-4 py-1.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Zurücksetzen
        </a>
      </form>

      {/* Warning when the user provided an invalid range */}
      {!isValidRange && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          Ungültiger Zeitraum — der Standardzeitraum (laufendes Jahr) wird verwendet.
        </div>
      )}

      {/* Results table */}
      {result.rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Keine bestätigten Buchungen im gewählten Zeitraum vorhanden.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Mitglied</th>
                <th className="px-4 py-3 text-right">Aufenthalte</th>
                <th className="px-4 py-3 text-right">Nächte</th>
                <th className="px-4 py-3 text-right">Anteil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.rows.map((row) => (
                <tr key={row.userId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.userName}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-right tabular-nums">
                    {row.stays}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-right tabular-nums">
                    {row.nights}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-right tabular-nums">
                    {row.shareOfTotal !== null
                      ? `${row.shareOfTotal.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row (FR-31) */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-900">Gesamt</td>
                <td className="px-4 py-3 text-gray-900 text-right tabular-nums">
                  {result.totalStays}
                </td>
                <td className="px-4 py-3 text-gray-900 text-right tabular-nums">
                  {result.totalNights}
                </td>
                <td className="px-4 py-3 text-gray-500 text-right">100 %</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Explanation note */}
      <p className="text-xs text-gray-400">
        Es werden nur bestätigte Buchungen gezählt. Bei gefilterten Zeiträumen
        werden nur die Nächte berücksichtigt, die in das Filterfenster fallen
        (anteilige Buchungen werden entsprechend gekürzt).
      </p>
    </div>
  );
}
