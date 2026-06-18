"use client";

/**
 * BookingForm — create or edit a booking (FR-13..FR-17).
 *
 * Used on the /calendar page (new booking) and on /bookings/[id]/edit.
 */

import { useActionState } from "react";
import type { BookingActionState } from "./actions";

interface BookingFormProps {
  /** Server Action to call on submit */
  action: (
    prevState: BookingActionState,
    formData: FormData
  ) => Promise<BookingActionState>;
  /** Pre-fill values for edit mode */
  defaultValues?: {
    bookingId?: string;
    startDate?: string;
    endDate?: string;
    title?: string | null;
    note?: string | null;
    guestCount?: number | null;
  };
  submitLabel?: string;
  cancelHref?: string;
}

const initialState: BookingActionState = {};

export function BookingForm({
  action,
  defaultValues,
  submitLabel = "Buchung anfragen",
  cancelHref = "/calendar",
}: BookingFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <div className="space-y-4">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      {state.warning && (
        <div
          role="status"
          className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800"
        >
          {state.warning}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Hidden booking id for edit mode */}
        {defaultValues?.bookingId && (
          <input type="hidden" name="bookingId" value={defaultValues.bookingId} />
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Anreise <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={defaultValues?.startDate ?? ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              disabled={isPending}
            />
          </div>

          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Abreise <span className="text-red-500">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              defaultValue={defaultValues?.endDate ?? ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              disabled={isPending}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Titel <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="z. B. Sommerurlaub"
            defaultValue={defaultValues?.title ?? ""}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            disabled={isPending}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="guestCount"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Personenanzahl <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              id="guestCount"
              name="guestCount"
              type="number"
              min="1"
              placeholder="2"
              defaultValue={defaultValues?.guestCount ?? ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              disabled={isPending}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="note"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notiz <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            placeholder="Anmerkungen zur Buchung …"
            defaultValue={defaultValues?.note ?? ""}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-none"
            disabled={isPending}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <a
            href={cancelHref}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </a>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Wird gespeichert …" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
