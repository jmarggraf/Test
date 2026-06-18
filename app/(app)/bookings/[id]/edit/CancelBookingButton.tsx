"use client";

/**
 * Cancel-booking button with confirmation prompt and error display.
 * Uses useActionState to handle server-action response (FR-18).
 */

import { useActionState } from "react";
import type { BookingActionState } from "@/app/(app)/calendar/actions";

interface CancelBookingButtonProps {
  bookingId: string;
  cancelAction: (
    prevState: BookingActionState,
    formData: FormData
  ) => Promise<BookingActionState>;
}

const initialState: BookingActionState = {};

export function CancelBookingButton({
  bookingId,
  cancelAction,
}: CancelBookingButtonProps) {
  const [state, formAction, isPending] = useActionState(
    cancelAction,
    initialState
  );

  return (
    <div className="space-y-3">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm("Buchung wirklich stornieren?")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Wird storniert …" : "Buchung stornieren"}
        </button>
      </form>
    </div>
  );
}
