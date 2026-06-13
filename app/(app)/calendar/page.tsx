/**
 * Calendar page — month view of all PENDING and CONFIRMED bookings (FR-8..FR-12).
 */
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import { MonthCalendar } from "./MonthCalendar";
import { BookingForm } from "./BookingForm";
import { createBookingAction } from "./actions";
import { formatMonthHeading } from "@/lib/calendarUtils";

export const metadata = {
  title: "Kalender – Ferienhaus-Kalender",
};

interface CalendarPageProps {
  searchParams: Promise<{ year?: string; month?: string; warning?: string; id?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const session = await requireUser();
  const params = await searchParams;

  // Determine which month to display (default: current month)
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getUTCFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getUTCMonth(); // 0-indexed

  const validYear = isNaN(year) ? now.getUTCFullYear() : year;
  const validMonth = isNaN(month) || month < 0 || month > 11 ? now.getUTCMonth() : month;

  // Fetch all visible bookings (PENDING + CONFIRMED) with user info (FR-8, FR-9)
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const warningBookingId = params.warning === "pending-conflict" ? params.id : undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          {formatMonthHeading(validYear, validMonth)}
        </h1>
      </div>

      {/* Pending-conflict warning (shown after creating a booking that overlaps with other PENDING) */}
      {warningBookingId && (
        <div
          role="status"
          className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800"
        >
          Ihre Buchung wurde vorgemerkt. Für diesen Zeitraum gibt es bereits
          andere Vormerkungen. Ein Admin wird entscheiden, welche Buchung
          bestätigt wird.
        </div>
      )}

      {/* Month-view calendar grid */}
      <MonthCalendar
        year={validYear}
        month={validMonth}
        bookings={bookings.map((b) => ({
          id: b.id,
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
          title: b.title,
          userName: b.user.name,
          userId: b.user.id,
        }))}
        currentUserId={session.userId}
        isAdmin={session.role === "ADMIN"}
      />

      {/* New booking form */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">
          Neue Buchung anfragen
        </h2>
        <BookingForm action={createBookingAction} />
      </section>
    </div>
  );
}
