"use client";

/**
 * Table of all users with deactivate/reactivate actions (FR-5).
 */
import { useActionState } from "react";
import { toggleUserStatusAction, type ToggleUserStatusState } from "./actions";
import type { Role, UserStatus } from "@prisma/client";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
}

interface UserTableProps {
  users: UserRow[];
}

const statusLabel: Record<UserStatus, string> = {
  INVITED: "Eingeladen",
  ACTIVE: "Aktiv",
  DISABLED: "Deaktiviert",
};

const statusClass: Record<UserStatus, string> = {
  INVITED: "bg-yellow-100 text-yellow-700",
  ACTIVE: "bg-green-100 text-green-700",
  DISABLED: "bg-gray-100 text-gray-500",
};

const roleLabel: Record<Role, string> = {
  ADMIN: "Admin",
  MEMBER: "Mitglied",
};

export function UserTable({ users }: UserTableProps) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Noch keine Nutzer vorhanden.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">E-Mail</th>
            <th className="px-4 py-3">Rolle</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Angelegt</th>
            <th className="px-4 py-3 text-right">Aktion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user }: { user: UserRow }) {
  const [state, formAction, isPending] = useActionState(
    toggleUserStatusAction,
    {} as ToggleUserStatusState
  );

  const isDisabled = user.status === "DISABLED";
  const targetStatus = isDisabled ? "ACTIVE" : "DISABLED";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-medium text-gray-900">
        {user.name}
        {user.mustChangePassword && (
          <span className="ml-1.5 text-xs text-orange-600 font-normal">
            (Passwort ändern)
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{user.email}</td>
      <td className="px-4 py-3 text-gray-600">{roleLabel[user.role]}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[user.status]}`}
        >
          {statusLabel[user.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-500">
        {new Date(user.createdAt).toLocaleDateString("de-DE")}
      </td>
      <td className="px-4 py-3 text-right">
        {state.error && (
          <span className="text-xs text-red-600 mr-2">{state.error}</span>
        )}
        <form action={formAction} className="inline">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="targetStatus" value={targetStatus} />
          <button
            type="submit"
            disabled={isPending}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
              isDisabled
                ? "text-green-700 hover:bg-green-50"
                : "text-red-700 hover:bg-red-50"
            }`}
          >
            {isPending
              ? "…"
              : isDisabled
                ? "Reaktivieren"
                : "Deaktivieren"}
          </button>
        </form>
      </td>
    </tr>
  );
}
