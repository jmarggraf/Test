"use client";

/**
 * Confirm / Reject buttons for a single pending booking row (FR-21, AK-12..AK-14).
 *
 * Uses two independent useActionState instances so each button maintains its
 * own pending/error state without interfering with the other.
 */

import { useActionState } from "react";
import {
  confirmBookingAction,
  rejectBookingAction,
  type BookingDecisionState,
} from "./actions";

interface BookingDecisionButtonsProps {
  bookingId: string;
  /** When true the booking already conflicts with a CONFIRMED booking and
   *  cannot be confirmed — the Bestätigen button is disabled. */
  hasConfirmedConflict: boolean;
}

const initialState: BookingDecisionState = {};

export function BookingDecisionButtons({
  bookingId,
  hasConfirmedConflict,
}: BookingDecisionButtonsProps) {
  const [confirmState, confirmAction, isConfirming] = useActionState(
    confirmBookingAction,
    initialState
  );
  const [rejectState, rejectAction, isRejecting] = useActionState(
    rejectBookingAction,
    initialState
  );

  const isPending = isConfirming || isRejecting;

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Error messages */}
      {confirmState.error && (
        <p role="alert" className="text-xs text-red-600">
          {confirmState.error}
        </p>
      )}
      {rejectState.error && (
        <p role="alert" className="text-xs text-red-600">
          {rejectState.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        {/* Confirm */}
        <form action={confirmAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            type="submit"
            disabled={isPending || hasConfirmedConflict}
            title={
              hasConfirmedConflict
                ? "Nicht bestätigbar: Zeitraum bereits anderweitig bestätigt"
                : "Buchung bestätigen"
            }
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isConfirming ? "…" : "Bestätigen"}
          </button>
        </form>

        {/* Reject */}
        <form action={rejectAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isRejecting ? "…" : "Ablehnen"}
          </button>
        </form>
      </div>
    </div>
  );
}
