"use server";

/**
 * Server Actions for the admin booking confirmation workflow (FR-20..FR-23,
 * AK-12..AK-14).
 *
 * Authorization: requireAdmin() is called first in every action (AK-14).
 * The actual business logic (status guard, conflict check, DB write) is
 * delegated to lib/bookings.ts.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { confirmBooking, rejectBooking } from "@/lib/bookings";

// ---------------------------------------------------------------------------
// Shared state type
// ---------------------------------------------------------------------------

export interface BookingDecisionState {
  error?: string;
}

// ---------------------------------------------------------------------------
// Confirm booking (FR-21, FR-22, FR-23, AK-12, AK-14)
// ---------------------------------------------------------------------------

export async function confirmBookingAction(
  _prevState: BookingDecisionState,
  formData: FormData
): Promise<BookingDecisionState> {
  const session = await requireAdmin(); // AK-14: non-admins are redirected here

  const bookingId = formData.get("bookingId") as string | null;
  if (!bookingId) {
    return { error: "Buchungs-ID fehlt." };
  }

  const result = await confirmBooking(bookingId, session);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");

  return {};
}

// ---------------------------------------------------------------------------
// Reject booking (FR-21, FR-23, AK-14)
// ---------------------------------------------------------------------------

export async function rejectBookingAction(
  _prevState: BookingDecisionState,
  formData: FormData
): Promise<BookingDecisionState> {
  const session = await requireAdmin(); // AK-14: non-admins are redirected here

  const bookingId = formData.get("bookingId") as string | null;
  if (!bookingId) {
    return { error: "Buchungs-ID fehlt." };
  }

  const result = await rejectBooking(bookingId, session);

  if (!result.success) {
    return { error: result.error };
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/calendar");

  return {};
}
