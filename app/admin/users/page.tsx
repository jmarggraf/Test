/**
 * Admin: User management page (FR-3, FR-5, FR-6).
 *
 * Lists all users and allows the admin to:
 * - Create a new user with a temporary password
 * - Deactivate / reactivate users
 */
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { CreateUserForm } from "./CreateUserForm";
import { UserTable } from "./UserTable";

export const metadata = {
  title: "Nutzerverwaltung – Ferienhaus-Kalender",
};

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      invitedById: true,
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Nutzerverwaltung
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Mitglieder anlegen und verwalten.
        </p>
      </div>

      {/* Create user form */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-4">
          Neuen Nutzer anlegen
        </h2>
        <CreateUserForm />
      </section>

      {/* User list */}
      <section>
        <h2 className="text-base font-medium text-gray-900 mb-3">
          Alle Nutzer ({users.length})
        </h2>
        <UserTable users={users} />
      </section>
    </div>
  );
}
