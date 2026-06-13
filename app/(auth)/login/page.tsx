/**
 * Login page.
 *
 * No public registration exists (FR-2); this is the only entry point for users.
 * Uses a Server Action to authenticate against the database.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Anmelden – Ferienhaus-Kalender",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // Already logged in → redirect to dashboard or the originally requested path
  const session = await getSession();
  if (session) {
    if (session.mustChangePassword) {
      redirect("/change-password");
    }
    const params = await searchParams;
    redirect(params.from ?? "/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Ferienhaus-Kalender
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Bitte melden Sie sich an.
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
