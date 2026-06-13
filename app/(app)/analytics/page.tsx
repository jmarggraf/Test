/**
 * Analytics page — placeholder for Stage 2/5.
 *
 * FR-28..FR-32 will be implemented here.
 */
import { requireUser } from "@/lib/auth";

export const metadata = {
  title: "Auswertung – Ferienhaus-Kalender",
};

export default async function AnalyticsPage() {
  await requireUser();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Auswertung</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-lg mb-1">Analytics</p>
        <p className="text-sm">
          Wird in Stufe 5 implementiert (FR-28..FR-32).
        </p>
      </div>
    </div>
  );
}
