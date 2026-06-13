/**
 * Change-password page.
 *
 * Required for the first-login flow (FR-4, A6):
 * Users created by an admin with a temporary password are redirected here
 * after login if mustChangePassword is true.
 */
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = {
  title: "Passwort ändern – Ferienhaus-Kalender",
};

export default async function ChangePasswordPage() {
  // Allow users who still need to change their password to access this page
  const session = await requireUser({ allowMustChangePassword: true });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Passwort setzen
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {session.mustChangePassword
              ? "Bitte setzen Sie ein neues Passwort, bevor Sie fortfahren."
              : "Hier können Sie Ihr Passwort ändern."}
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
