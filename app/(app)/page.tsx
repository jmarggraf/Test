/**
 * Dashboard / home page.
 *
 * Currently a simple landing page that links to the main features.
 * The calendar view will be built in Stage 2.
 */
import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const session = await requireUser();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Willkommen, {session.name}!
      </h1>
      <p className="text-gray-500 mb-8">
        Gemeinsamer Belegungskalender der Erbengemeinschaft.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/calendar"
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="text-2xl mb-2">📅</div>
          <h2 className="font-medium text-gray-900 mb-1">Kalender</h2>
          <p className="text-sm text-gray-500">
            Alle Buchungen im Monatsüberblick.
          </p>
        </Link>

        <Link
          href="/analytics"
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="text-2xl mb-2">📊</div>
          <h2 className="font-medium text-gray-900 mb-1">Auswertung</h2>
          <p className="text-sm text-gray-500">
            Aufenthalte und Nächte pro Mitglied.
          </p>
        </Link>

        {session.role === "ADMIN" && (
          <Link
            href="/admin/users"
            className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="text-2xl mb-2">👥</div>
            <h2 className="font-medium text-gray-900 mb-1">Nutzerverwaltung</h2>
            <p className="text-sm text-gray-500">
              Mitglieder anlegen und verwalten.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
