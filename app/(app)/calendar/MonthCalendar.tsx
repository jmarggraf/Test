"use client";

/**
 * MonthCalendar — self-built monthly grid view (FR-8..FR-12, FR-9).
 *
 * Renders a 6-row × 7-column grid with booking chips per day.
 * Navigation (prev/next/today) updates the URL search params.
 */

import { useRouter } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import {
  buildMonthGrid,
  prevMonth,
  nextMonth,
  bookingCoversDay,
  formatMonthHeading,
  formatDateDE,
} from "@/lib/calendarUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarBooking {
  id: string;
  startDate: Date;
  endDate: Date;
  status: BookingStatus;
  title: string | null;
  userName: string;
  userId: string;
}

interface MonthCalendarProps {
  year: number;
  month: number;
  bookings: CalendarBooking[];
  currentUserId: string;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Labels / styles per status (FR-9)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Ausstehend",
  CONFIRMED: "Bestätigt",
  REJECTED: "Abgelehnt",
  CANCELLED: "Storniert",
};

/** Tailwind classes for the booking chip by status (FR-9). */
function chipClasses(status: BookingStatus): string {
  switch (status) {
    case BookingStatus.CONFIRMED:
      return "bg-blue-600 text-white border border-blue-700";
    case BookingStatus.PENDING:
      return "bg-blue-100 text-blue-800 border border-blue-300 border-dashed";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

// ---------------------------------------------------------------------------
// Day-of-week headers (Mon–Sun)
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthCalendar({
  year,
  month,
  bookings,
  currentUserId,
  isAdmin,
}: MonthCalendarProps) {
  const router = useRouter();

  const grid = buildMonthGrid(year, month);

  function navigate(y: number, m: number) {
    router.push(`/calendar?year=${y}&month=${m}`);
  }

  function goToToday() {
    const now = new Date();
    router.push(`/calendar?year=${now.getUTCFullYear()}&month=${now.getUTCMonth()}`);
  }

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Header: month navigation */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => navigate(prev.year, prev.month)}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Vorheriger Monat"
        >
          {/* Chevron left */}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            {formatMonthHeading(year, month)}
          </h2>
          <button
            onClick={goToToday}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Heute
          </button>
        </div>

        <button
          onClick={() => navigate(next.year, next.month)}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Nächster Monat"
        >
          {/* Chevron right */}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Weekday labels */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide"
          >
            {label}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Calendar grid */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {grid.map((week, wi) =>
          week.map((day, di) => {
            const dayBookings = bookings.filter((b) =>
              bookingCoversDay(b, day.date)
            );
            const isFree = dayBookings.length === 0; // FR-12

            return (
              <div
                key={`${wi}-${di}`}
                className={[
                  "min-h-[80px] p-1 border-b border-gray-100",
                  day.isCurrentMonth ? "bg-white" : "bg-gray-50",
                  isFree && day.isCurrentMonth ? "" : "",
                ].join(" ")}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span
                    className={[
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                      day.isToday
                        ? "bg-blue-600 text-white"
                        : day.isCurrentMonth
                          ? "text-gray-900"
                          : "text-gray-400",
                    ].join(" ")}
                  >
                    {day.date.getUTCDate()}
                  </span>

                  {/* Free indicator (FR-12): subtle dot for free current-month days */}
                  {isFree && day.isCurrentMonth && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-green-300"
                      aria-label="Frei"
                      title="Frei"
                    />
                  )}
                </div>

                {/* Booking chips (FR-9, FR-10) */}
                <div className="space-y-0.5">
                  {dayBookings.map((booking) => (
                    <BookingChip
                      key={booking.id}
                      booking={booking}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Legend */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-6 px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded bg-blue-600" />
          <span>{STATUS_LABEL.CONFIRMED}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded bg-blue-100 border border-dashed border-blue-300" />
          <span>{STATUS_LABEL.PENDING}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-300" />
          <span>Frei</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking chip (FR-10: shows user name, period, status)
// ---------------------------------------------------------------------------

function BookingChip({
  booking,
  currentUserId,
  isAdmin,
}: {
  booking: CalendarBooking;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const isOwn = booking.userId === currentUserId;
  const canEdit =
    isAdmin || (isOwn && booking.status === BookingStatus.PENDING);

  const tooltip = [
    `${booking.userName}`,
    `${formatDateDE(booking.startDate)} – ${formatDateDE(booking.endDate)}`,
    STATUS_LABEL[booking.status],
    booking.title ?? "",
  ]
    .filter(Boolean)
    .join(" · ");

  const chip = (
    <div
      title={tooltip}
      className={[
        "rounded px-1 py-0.5 text-[10px] leading-tight truncate cursor-default",
        chipClasses(booking.status),
      ].join(" ")}
    >
      <span className="font-medium">{booking.userName}</span>
    </div>
  );

  if (canEdit) {
    return (
      <a
        href={`/bookings/${booking.id}/edit`}
        title={tooltip}
        className="block"
      >
        <div
          className={[
            "rounded px-1 py-0.5 text-[10px] leading-tight truncate cursor-pointer",
            chipClasses(booking.status),
            "hover:opacity-80 transition-opacity",
          ].join(" ")}
        >
          <span className="font-medium">{booking.userName}</span>
        </div>
      </a>
    );
  }

  return chip;
}

