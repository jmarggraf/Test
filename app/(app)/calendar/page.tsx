/**
 * Calendar page — placeholder for Stage 2.
 *
 * FR-8..FR-12 will be implemented here.
 */
import { requireUser } from "@/lib/auth";

export const metadata = {
  title: "Kalender – Ferienhaus-Kalender",
};

export default async function CalendarPage() {
  await requireUser();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Kalender</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-lg mb-1">Kalenderansicht</p>
        <p className="text-sm">Wird in Stufe 2 implementiert (FR-8..FR-12).</p>
      </div>
    </div>
  );
}
