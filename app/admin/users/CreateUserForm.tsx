"use client";

/**
 * Form to create a new user (admin-only, FR-3, FR-6).
 *
 * On success, shows the generated temporary password once.
 * The admin must communicate this to the new user out-of-band.
 */
import { useActionState, useRef } from "react";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(
    createUserAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the form after successful creation so the admin can add another user
  // Note: we don't auto-reset when tempPassword appears, so the admin sees it.

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

      {state.tempPassword && (
        <div
          role="status"
          className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm"
        >
          <p className="font-medium text-green-800 mb-1">
            Nutzer erfolgreich angelegt.
          </p>
          <p className="text-green-700">
            Temporäres Passwort:{" "}
            <code className="font-mono font-bold tracking-wider bg-green-100 px-2 py-0.5 rounded">
              {state.tempPassword}
            </code>
          </p>
          <p className="text-green-600 text-xs mt-1">
            Bitte teilen Sie dieses Passwort dem Nutzer mit. Es wird nur einmal
            angezeigt. Der Nutzer muss es beim ersten Login ändern.
          </p>
        </div>
      )}

      <form ref={formRef} action={formAction} className="grid sm:grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Max Mustermann"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            disabled={isPending}
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            E-Mail-Adresse
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="max@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            disabled={isPending}
          />
        </div>

        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Rolle
          </label>
          <select
            id="role"
            name="role"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 bg-white"
            disabled={isPending}
          >
            <option value="MEMBER">Mitglied</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div className="sm:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Wird angelegt …" : "Nutzer anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}
