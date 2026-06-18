"use server";

/**
 * Server Actions for booking management (FR-13..FR-19, FR-24..FR-27).
 *
 * All authorization and conflict checks are delegated to lib/bookings.ts which
 * in turn uses lib/availability.ts for the pure date/overlap logic.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createBooking, updateBooking, cancelBooking } from "@/lib/bookings";

// ---------------------------------------------------------------------------
// Shared state type
// ---------------------------------------------------------------------------

export interface BookingActionState {
  error?: string;
  warning?: string;
}

/** [11] Plausibility upper bound for the guest count of a single booking. */
const MAX_GUEST_COUNT = 20;

// ---------------------------------------------------------------------------
// Create booking (FR-13, FR-14, FR-15)
// ---------------------------------------------------------------------------

export async function createBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const session = await requireUser();

  const startRaw = formData.get("startDate") as string | null;
  const endRaw = formData.get("endDate") as string | null;
  const title = (formData.get("title") as string | null)?.trim() || null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const guestCountRaw = formData.get("guestCount") as string | null;

  if (!startRaw || !endRaw) {
    return { error: "Anreise- und Abreisedatum sind erforderlich." };
  }

  const startDate = new Date(startRaw + "T00:00:00Z");
  const endDate = new Date(endRaw + "T00:00:00Z");

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: "Ungültige Datumsangaben." };
  }

  const guestCount =
    guestCountRaw && guestCountRaw.trim() !== ""
      ? parseInt(guestCountRaw, 10)
      : null;

  if (
    guestCount !== null &&
    (isNaN(guestCount) || guestCount < 1 || guestCount > MAX_GUEST_COUNT)
  ) {
    return { error: `Personenanzahl muss zwischen 1 und ${MAX_GUEST_COUNT} liegen.` };
  }

  const isAdmin = session.role === "ADMIN";
  const result = await createBooking(session.userId, { startDate, endDate, title, note, guestCount }, isAdmin);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/calendar");

  if (result.hasPendingConflicts) {
    // Redirect to calendar with a warning query param
    redirect(`/calendar?warning=pending-conflict&id=${result.bookingId}`);
  }

  redirect("/calendar");
}

// ---------------------------------------------------------------------------
// Update booking (FR-16, FR-17, FR-19)
// ---------------------------------------------------------------------------

export async function updateBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const session = await requireUser();

  const bookingId = formData.get("bookingId") as string | null;
  const startRaw = formData.get("startDate") as string | null;
  const endRaw = formData.get("endDate") as string | null;
  const title = (formData.get("title") as string | null)?.trim() || null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const guestCountRaw = formData.get("guestCount") as string | null;

  if (!bookingId) {
    return { error: "Buchungs-ID fehlt." };
  }

  if (!startRaw || !endRaw) {
    return { error: "Anreise- und Abreisedatum sind erforderlich." };
  }

  const startDate = new Date(startRaw + "T00:00:00Z");
  const endDate = new Date(endRaw + "T00:00:00Z");

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { error: "Ungültige Datumsangaben." };
  }

  const guestCount =
    guestCountRaw && guestCountRaw.trim() !== ""
      ? parseInt(guestCountRaw, 10)
      : null;

  if (
    guestCount !== null &&
    (isNaN(guestCount) || guestCount < 1 || guestCount > MAX_GUEST_COUNT)
  ) {
    return { error: `Personenanzahl muss zwischen 1 und ${MAX_GUEST_COUNT} liegen.` };
  }

  const result = await updateBooking(
    bookingId,
    { startDate, endDate, title, note, guestCount },
    session
  );

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/calendar");
  revalidatePath(`/bookings/${bookingId}/edit`);

  if (result.hasPendingConflicts) {
    redirect(`/calendar?warning=pending-conflict&id=${bookingId}`);
  }

  redirect("/calendar");
}

// ---------------------------------------------------------------------------
// Cancel booking (FR-18, FR-19)
// ---------------------------------------------------------------------------

export async function cancelBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const session = await requireUser();

  const bookingId = formData.get("bookingId") as string | null;

  if (!bookingId) {
    return { error: "Buchungs-ID fehlt." };
  }

  const result = await cancelBooking(bookingId, session);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/calendar");
  redirect("/calendar");
}
