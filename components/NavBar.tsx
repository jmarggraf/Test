/**
 * Application navigation bar.
 *
 * Displayed on every authenticated page (inside the (app) route group).
 * Shows navigation links appropriate to the user's role and a logout button.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/login/actions";
import type { SessionPayload } from "@/lib/auth";

interface NavBarProps {
  session: SessionPayload;
}

export function NavBar({ session }: NavBarProps) {
  const pathname = usePathname();

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");

  const linkClass = (path: string) =>
    [
      "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
      isActive(path)
        ? "bg-blue-100 text-blue-700"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
    ].join(" ");

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo / brand */}
        <Link
          href="/"
          className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors"
        >
          Ferienhaus-Kalender
        </Link>

        {/* Primary navigation */}
        <nav className="flex items-center gap-1">
          <Link href="/calendar" className={linkClass("/calendar")}>
            Kalender
          </Link>
          <Link href="/analytics" className={linkClass("/analytics")}>
            Auswertung
          </Link>
          {session.role === "ADMIN" && (
            <>
              <Link href="/admin/bookings" className={linkClass("/admin/bookings")}>
                Queue
              </Link>
              <Link href="/admin/users" className={linkClass("/admin/users")}>
                Nutzer
              </Link>
            </>
          )}
        </nav>

        {/* User info + logout */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:inline">
            {session.name}
            {session.role === "ADMIN" && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                Admin
              </span>
            )}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
