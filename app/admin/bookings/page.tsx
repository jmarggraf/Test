/**
 * Admin: Booking confirmation queue (FR-20..FR-23, AK-12..AK-14).
 *
 * Lists all PENDING bookings. For each entry we compute:
 *  - whether it overlaps with another PENDING booking (shown as a warning so
 *    the admin can decide fairly — A3 / FR-26)
 *  - whether it overlaps with a CONFIRMED booking (cannot be confirmed — FR-22)
 */
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { BookingStatus } from "@prisma/client";
import { intervalsOverlap, countNights } from "@/lib/availability";
import { BookingDecisionButtons } from "./BookingDecisionButtons";

export const metadata = {
  title: "Buchungs-Queue – Ferienhaus-Kalender",
};

export default async function AdminBookingsPage() {
  await requireAdmin();

  // Fetch all PENDING bookings with owner info
  const pendingBookings = await prisma.booking.findMany({
    where: { status: BookingStatus.PENDING },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Fetch all CONFIRMED bookings for conflict detection (FR-22)
  const confirmedBookings = await prisma.booking.findMany({
    where: { status: BookingStatus.CONFIRMED },
    select: { id: true, startDate: true, endDate: true },
  });

  // Annotate each pending booking with overlap information
  const annotated = pendingBookings.map((booking) => {
    const interval = { startDate: booking.startDate, endDate: booking.endDate };

    // Conflict with any other PENDING — both directions (FR-26 / A3)
    const hasPendingConflict = pendingBookings.some(
      (other) =>
        other.id !== booking.id &&
        intervalsOverlap(interval, {
          startDate: other.startDate,
          endDate: other.endDate,
        })
    );

    // Conflict with a CONFIRMED booking — blocks confirmation (FR-22)
    const hasConfirmedConflict = confirmedBookings.some((confirmed) =>
      intervalsOverlap(interval, {
        startDate: confirmed.startDate,
        endDate: confirmed.endDate,
      })
    );

    const nights = countNights(interval);

    return { ...booking, hasPendingConflict, hasConfirmedConflict, nights };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Buchungs-Queue
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Offene Buchungsanfragen bestätigen oder ablehnen.
        </p>
      </div>

      {annotated.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Keine offenen Buchungsanfragen vorhanden.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Mitglied</th>
                <th className="px-4 py-3">Anreise</th>
                <th className="px-4 py-3">Abreise</th>
                <th className="px-4 py-3">Nächte</th>
                <th className="px-4 py-3">Titel / Notiz</th>
                <th className="px-4 py-3">Hinweise</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {annotated.map((booking) => (
                <tr
                  key={booking.id}
                  className={
                    booking.hasConfirmedConflict
                      ? "bg-red-50"
                      : booking.hasPendingConflict
                        ? "bg-yellow-50"
                        : "hover:bg-gray-50"
                  }
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {booking.user.name}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {booking.startDate.toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {booking.endDate.toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{booking.nights}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs">
                    {booking.title && (
                      <span className="font-medium text-gray-800">
                        {booking.title}
                      </span>
                    )}
                    {booking.title && booking.note && (
                      <span className="text-gray-400"> · </span>
                    )}
                    {booking.note && (
                      <span className="text-gray-500 italic">{booking.note}</span>
                    )}
                    {!booking.title && !booking.note && (
                      <span className="text-gray-400">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {booking.hasConfirmedConflict && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          Konflikt (bestätigt)
                        </span>
                      )}
                      {booking.hasPendingConflict && (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                          Überschneidung (offen)
                        </span>
                      )}
                      {!booking.hasConfirmedConflict &&
                        !booking.hasPendingConflict && (
                          <span className="text-gray-400 text-xs">–</span>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BookingDecisionButtons
                      bookingId={booking.id}
                      hasConfirmedConflict={booking.hasConfirmedConflict}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-300 mr-1.5 align-middle" />
          Überschneidung mit einer anderen offenen Anfrage — Admin entscheidet, welche bestätigt wird.
        </p>
        <p>
          <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300 mr-1.5 align-middle" />
          Zeitraum bereits anderweitig bestätigt — Bestätigung nicht möglich.
        </p>
      </div>
    </div>
  );
}
