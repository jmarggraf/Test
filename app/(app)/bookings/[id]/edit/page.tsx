/**
 * Booking edit/cancel page (FR-16, FR-17, FR-18, FR-19).
 *
 * Accessible to:
 *   - Owner: edit own PENDING booking; cancel own booking (not fully in past).
 *   - Admin: edit or cancel any booking.
 * All enforcement is also done server-side in lib/bookings.ts (AK-10).
 */
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BookingStatus, Role } from "@prisma/client";
import { isIntervalFullyInPast } from "@/lib/availability";
import { BookingForm } from "@/app/(app)/calendar/BookingForm";
import { updateBookingAction, cancelBookingAction } from "@/app/(app)/calendar/actions";
import { CancelBookingButton } from "./CancelBookingButton";
import { formatDateISO, formatDateDE } from "@/lib/calendarUtils";

export const metadata = {
  title: "Buchung bearbeiten – Ferienhaus-Kalender",
};

interface EditBookingPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Ausstehend",
  CONFIRMED: "Bestätigt",
  REJECTED: "Abgelehnt",
  CANCELLED: "Storniert",
};

export default async function EditBookingPage({ params }: EditBookingPageProps) {
  const session = await requireUser();
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!booking) {
    notFound();
  }

  const isAdmin = session.role === Role.ADMIN;
  const isOwner = booking.userId === session.userId;

  // Access control: only owner or admin may view this page (AK-10)
  if (!isAdmin && !isOwner) {
    redirect("/calendar");
  }

  const fullyInPast = isIntervalFullyInPast({
    startDate: booking.startDate,
    endDate: booking.endDate,
  });

  // Can edit: admin always; member only if own PENDING and not fully in past
  const canEdit =
    isAdmin ||
    (isOwner && booking.status === BookingStatus.PENDING && !fullyInPast);

  // Can cancel: admin always; member if own and not fully in past, not already cancelled/rejected
  const canCancel =
    !fullyInPast &&
    booking.status !== BookingStatus.CANCELLED &&
    booking.status !== BookingStatus.REJECTED &&
    (isAdmin || isOwner);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Buchung bearbeiten
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {booking.user.name} · {formatDateDE(booking.startDate)} –{" "}
          {formatDateDE(booking.endDate)} ·{" "}
          <span
            className={
              booking.status === BookingStatus.CONFIRMED
                ? "text-blue-600 font-medium"
                : booking.status === BookingStatus.PENDING
                  ? "text-yellow-700 font-medium"
                  : "text-gray-500"
            }
          >
            {STATUS_LABEL[booking.status]}
          </span>
        </p>
      </div>

      {/* Info banner for non-editable states */}
      {!canEdit && booking.status === BookingStatus.CONFIRMED && !isAdmin && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          Diese Buchung ist bestätigt und kann von Ihnen nicht mehr bearbeitet
          werden. Sie können sie aber stornieren.
        </div>
      )}

      {fullyInPast && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          Dieser Aufenthalt liegt in der Vergangenheit und ist schreibgeschützt.
        </div>
      )}

      {/* Edit form — only shown when editing is allowed */}
      {canEdit && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-medium text-gray-900 mb-4">
            Daten ändern
          </h2>
          <BookingForm
            action={updateBookingAction}
            defaultValues={{
              bookingId: booking.id,
              startDate: formatDateISO(booking.startDate),
              endDate: formatDateISO(booking.endDate),
              title: booking.title,
              note: booking.note,
              guestCount: booking.guestCount,
            }}
            submitLabel="Änderungen speichern"
            cancelHref="/calendar"
          />
        </section>
      )}

      {/* Cancel section */}
      {canCancel && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-medium text-gray-900 mb-2">
            Buchung stornieren
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Die Buchung wird als storniert markiert und nicht mehr im Kalender
            angezeigt.
          </p>
          <CancelBookingButton
            bookingId={booking.id}
            cancelAction={cancelBookingAction}
          />
        </section>
      )}

      {/* Back link when nothing is actionable */}
      {!canEdit && !canCancel && (
        <a
          href="/calendar"
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          Zurück zum Kalender
        </a>
      )}
    </div>
  );
}
