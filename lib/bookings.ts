/**
 * Core booking business logic.
 *
 * All functions that perform I/O (DB reads/writes) are exported here so the
 * test-engineer can stub the Prisma client and test them independently.
 *
 * Conflict / date logic is delegated entirely to lib/availability.ts (BR-1,
 * BR-2, BR-6, BR-7, BR-10).
 */

import { BookingStatus, Role, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  findConflict,
  findAllConflicts,
  isInPast,
  isIntervalFullyInPast,
  startOfDay,
} from "@/lib/availability";
import type { SessionPayload } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookingInput {
  startDate: Date;
  endDate: Date;
  title?: string | null;
  note?: string | null;
  guestCount?: number | null;
}

export interface BookingResult {
  success: true;
  bookingId: string;
  /** True if there are overlapping PENDING bookings (warning, not error) */
  hasPendingConflicts: boolean;
}

export interface BookingError {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// Validation helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Validates start/end date combination (FR-15, BR-7).
 * Returns an error string or null when valid.
 */
export function validateBookingDates(
  startDate: Date,
  endDate: Date,
  isAdmin = false
): string | null {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);

  if (end <= start) {
    return "Das Abreisedatum muss nach dem Anreisedatum liegen.";
  }

  // BR-7: new bookings must not start in the past (admins exempt per A8)
  if (!isAdmin && isInPast(start)) {
    return "Das Anreisedatum darf nicht in der Vergangenheit liegen.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Create booking (FR-13, FR-14, FR-15, FR-25, FR-26, BR-10)
// ---------------------------------------------------------------------------

/**
 * Creates a new PENDING booking for the given user.
 *
 * - Validates dates (FR-15, BR-7).
 * - Hard-blocks overlap with CONFIRMED bookings inside a transaction (BR-10).
 * - Allows overlap with PENDING bookings but signals it as a warning (FR-26).
 */
export async function createBooking(
  userId: string,
  input: BookingInput,
  isAdmin = false
): Promise<BookingResult | BookingError> {
  const dateError = validateBookingDates(input.startDate, input.endDate, isAdmin);
  if (dateError) return { success: false, error: dateError };

  const candidate = {
    startDate: startOfDay(input.startDate),
    endDate: startOfDay(input.endDate),
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Fetch all active bookings (PENDING + CONFIRMED), excluding REJECTED/CANCELLED
      const activeBookings = await tx.booking.findMany({
        where: {
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        },
        select: { id: true, startDate: true, endDate: true, status: true },
      });

      const confirmedBookings = activeBookings.filter(
        (b) => b.status === BookingStatus.CONFIRMED
      );
      const pendingBookings = activeBookings.filter(
        (b) => b.status === BookingStatus.PENDING
      );

      // Hard block: conflict with CONFIRMED (FR-25, BR-2)
      const confirmedConflict = findConflict(candidate, confirmedBookings);
      if (confirmedConflict) {
        throw new ConflictError(
          "Dieser Zeitraum ist bereits bestätigt gebucht. Bitte wählen Sie einen anderen Zeitraum."
        );
      }

      // Soft warning: overlapping PENDING bookings (FR-26)
      const pendingConflicts = findAllConflicts(candidate, pendingBookings);

      const booking = await tx.booking.create({
        data: {
          userId,
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          status: BookingStatus.PENDING,
          title: input.title ?? null,
          note: input.note ?? null,
          guestCount: input.guestCount ?? null,
        },
      });

      return { bookingId: booking.id, hasPendingConflicts: pendingConflicts.length > 0 };
    }, {
      // BR-10: Serializable prevents two concurrent requests from both passing
      // the CONFIRMED-conflict check and producing an overlapping confirmed booking.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return { success: true, ...result };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { success: false, error: err.message };
    }
    console.error("[createBooking]", err);
    return { success: false, error: "Fehler beim Speichern der Buchung. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Update booking (FR-16, FR-17, FR-19, AK-10)
// ---------------------------------------------------------------------------

/**
 * Updates an existing booking.
 *
 * Authorization:
 *  - Regular users may only edit their own PENDING bookings (FR-16, FR-17).
 *  - Admins may edit any booking (FR-19).
 *
 * Re-runs conflict check against CONFIRMED bookings (FR-16, BR-10).
 *
 * [7] Deliberate product decision: when an admin edits an already-CONFIRMED
 * booking, its status stays CONFIRMED (no automatic reset to PENDING). The
 * conflict check against other CONFIRMED bookings still runs; the admin carries
 * responsibility for the moved dates.
 */
export async function updateBooking(
  bookingId: string,
  input: BookingInput,
  session: SessionPayload
): Promise<BookingResult | BookingError> {
  const isAdmin = session.role === Role.ADMIN;

  const dateError = validateBookingDates(input.startDate, input.endDate, isAdmin);
  if (dateError) return { success: false, error: dateError };

  const candidate = {
    startDate: startOfDay(input.startDate),
    endDate: startOfDay(input.endDate),
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, userId: true, status: true, startDate: true, endDate: true },
      });

      if (!booking) {
        throw new NotFoundError("Buchung nicht gefunden.");
      }

      // Authorization check (AK-10)
      if (!isAdmin && booking.userId !== session.userId) {
        throw new ForbiddenError("Sie dürfen nur Ihre eigenen Buchungen bearbeiten.");
      }

      // Regular users cannot edit CONFIRMED bookings (FR-17)
      if (!isAdmin && booking.status !== BookingStatus.PENDING) {
        throw new ForbiddenError(
          "Nur Buchungen im Status PENDING können bearbeitet werden."
        );
      }

      // BR-6: fully past bookings are write-protected
      if (isIntervalFullyInPast({ startDate: booking.startDate, endDate: booking.endDate })) {
        throw new ForbiddenError(
          "Vergangene Buchungen können nicht bearbeitet werden."
        );
      }

      // Conflict check against CONFIRMED, excluding the booking itself (BR-10)
      const activeBookings = await tx.booking.findMany({
        where: {
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
          id: { not: bookingId },
        },
        select: { id: true, startDate: true, endDate: true, status: true },
      });

      const confirmedBookings = activeBookings.filter(
        (b) => b.status === BookingStatus.CONFIRMED
      );
      const pendingBookings = activeBookings.filter(
        (b) => b.status === BookingStatus.PENDING
      );

      const confirmedConflict = findConflict(candidate, confirmedBookings);
      if (confirmedConflict) {
        throw new ConflictError(
          "Dieser Zeitraum ist bereits bestätigt gebucht. Bitte wählen Sie einen anderen Zeitraum."
        );
      }

      const pendingConflicts = findAllConflicts(candidate, pendingBookings);

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          title: input.title ?? null,
          note: input.note ?? null,
          guestCount: input.guestCount ?? null,
        },
      });

      return { bookingId, hasPendingConflicts: pendingConflicts.length > 0 };
    }, {
      // BR-10: see createBooking — Serializable guards against concurrent
      // overlapping confirmations.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return { success: true, ...result };
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    console.error("[updateBooking]", err);
    return { success: false, error: "Fehler beim Speichern der Buchung. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Cancel booking (FR-18, FR-19, BR-4, BR-6, AK-10, AK-11)
// ---------------------------------------------------------------------------

/**
 * Cancels a booking (sets status to CANCELLED — soft delete, BR-4).
 *
 * Authorization:
 *  - Regular users may only cancel their own bookings (FR-18).
 *  - Admins may cancel any booking (FR-19).
 *
 * Refuses if the booking interval is fully in the past (BR-6, AK-11).
 */
export async function cancelBooking(
  bookingId: string,
  session: SessionPayload
): Promise<{ success: true } | BookingError> {
  const isAdmin = session.role === Role.ADMIN;

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, userId: true, status: true, startDate: true, endDate: true },
      });

      if (!booking) {
        throw new NotFoundError("Buchung nicht gefunden.");
      }

      // Authorization (AK-10)
      if (!isAdmin && booking.userId !== session.userId) {
        throw new ForbiddenError("Sie dürfen nur Ihre eigenen Buchungen stornieren.");
      }

      // BR-6: already fully in the past → write-protected (AK-11)
      if (isIntervalFullyInPast({ startDate: booking.startDate, endDate: booking.endDate })) {
        throw new ForbiddenError(
          "Vergangene Buchungen können nicht storniert werden."
        );
      }

      // Already cancelled / rejected — no-op is fine, but guard anyway
      if (
        booking.status === BookingStatus.CANCELLED ||
        booking.status === BookingStatus.REJECTED
      ) {
        throw new ForbiddenError(
          "Diese Buchung ist bereits storniert oder abgelehnt."
        );
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CANCELLED },
      });
    });

    return { success: true };
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    console.error("[cancelBooking]", err);
    return { success: false, error: "Fehler beim Stornieren der Buchung. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Confirm booking (FR-20..FR-23, AK-12, AK-13, BR-9, BR-10)
// ---------------------------------------------------------------------------

/**
 * Confirms a PENDING booking (Admin only).
 *
 * - Defensive role-check in addition to the requireAdmin() call in the Action
 *   layer (AK-14, defense in depth).
 * - Only PENDING bookings may be confirmed (FR-23).
 * - Re-runs conflict check against CONFIRMED bookings inside a Serializable
 *   transaction to prevent race-condition double-confirmations (FR-22, BR-10).
 * - Sets status=CONFIRMED, decidedById, decidedAt (AK-12).
 * - Admin may confirm their own booking (BR-9).
 */
export async function confirmBooking(
  bookingId: string,
  session: SessionPayload
): Promise<{ success: true; bookingId: string } | BookingError> {
  // Defensive admin guard (AK-14)
  if (session.role !== Role.ADMIN) {
    return { success: false, error: "Nur Administratoren können Buchungen bestätigen." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, startDate: true, endDate: true },
      });

      if (!booking) {
        throw new NotFoundError("Buchung nicht gefunden.");
      }

      // Only PENDING may be confirmed (FR-23)
      if (booking.status !== BookingStatus.PENDING) {
        throw new ForbiddenError(
          "Nur Buchungen im Status PENDING können bestätigt werden."
        );
      }

      // Re-check for conflicts with CONFIRMED bookings (FR-22, BR-10)
      const confirmedBookings = await tx.booking.findMany({
        where: {
          status: BookingStatus.CONFIRMED,
          id: { not: bookingId },
        },
        select: { id: true, startDate: true, endDate: true },
      });

      const conflict = findConflict(
        { startDate: booking.startDate, endDate: booking.endDate },
        confirmedBookings
      );

      if (conflict) {
        throw new ConflictError(
          "Dieser Zeitraum überschneidet sich mit einer bereits bestätigten Buchung. Die Bestätigung ist nicht möglich."
        );
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CONFIRMED,
          decidedById: session.userId,
          decidedAt: new Date(),
        },
      });
    }, {
      // BR-10: Serializable prevents two concurrent confirmations from both
      // passing the conflict check and producing overlapping CONFIRMED bookings.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return { success: true, bookingId };
  } catch (err) {
    if (err instanceof ConflictError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    console.error("[confirmBooking]", err);
    return { success: false, error: "Fehler beim Bestätigen der Buchung. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Reject booking (FR-20..FR-23, AK-14)
// ---------------------------------------------------------------------------

/**
 * Rejects a PENDING booking (Admin only).
 *
 * - Defensive role-check (AK-14).
 * - Only PENDING bookings may be rejected (FR-23).
 * - Sets status=REJECTED, decidedById, decidedAt.
 */
export async function rejectBooking(
  bookingId: string,
  session: SessionPayload
): Promise<{ success: true; bookingId: string } | BookingError> {
  // Defensive admin guard (AK-14)
  if (session.role !== Role.ADMIN) {
    return { success: false, error: "Nur Administratoren können Buchungen ablehnen." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true },
      });

      if (!booking) {
        throw new NotFoundError("Buchung nicht gefunden.");
      }

      // Only PENDING may be rejected (FR-23)
      if (booking.status !== BookingStatus.PENDING) {
        throw new ForbiddenError(
          "Nur Buchungen im Status PENDING können abgelehnt werden."
        );
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.REJECTED,
          decidedById: session.userId,
          decidedAt: new Date(),
        },
      });
    });

    return { success: true, bookingId };
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    console.error("[rejectBooking]", err);
    return { success: false, error: "Fehler beim Ablehnen der Buchung. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Internal error types (not exported — only used within transactions)
// ---------------------------------------------------------------------------

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
