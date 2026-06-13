# Review-Follow-ups (offene Härtungen)

Aus dem `code-reviewer`-Durchlauf nach Stufe 2. Die als **gefixt** markierten Punkte
sind bereits behoben; die folgenden sind bewusst zurückgestellt (kein MVP-Blocker
für den lokalen Betrieb) und hier dokumentiert.

## Behoben
- **[3] Onboarding-Deadlock** — `loginAction` ließ `INVITED`-Nutzer nicht durch.
  Jetzt: INVITED loggt mit Temp-Passwort ein und wird zu `/change-password`
  geleitet (Aktivierung auf ACTIVE).
- **[5] Hardcodierter JWT-Fallback** in `middleware.ts` — wirft jetzt einen Fehler,
  wenn `JWT_SECRET` fehlt (wie `lib/auth.ts`).
- **[1] Race Condition (BR-10)** — `createBooking`/`updateBooking` laufen jetzt mit
  `Serializable`-Isolation, damit keine zwei überlappenden Bestätigungen entstehen.

## Offen / Follow-up
- **[6] Deaktivierte Session lebt weiter (🟡):** Ein nachträglich auf `DISABLED`
  gesetzter Nutzer behält seinen gültigen Token bis zu 7 Tage. Ein naiver
  DB-Status-Check in `requireUser` erzeugt mit der Middleware-Regel „eingeloggte
  von `/login` wegleiten" eine Redirect-Schleife. Saubere Lösung: dedizierte
  `/account-disabled`-Seite (public, mit Logout) ODER kurze Token-Laufzeit mit
  Sliding-Refresh ODER Status-Check in einer Node-Runtime-Middleware. Erst nötig
  vor produktivem Deployment.
- **[7] Admin-Edit einer CONFIRMED-Buchung (🟡):** Beim Verschieben einer bereits
  bestätigten Buchung bleibt der Status `CONFIRMED` ohne erneute Prüfung.
  Optionen: bei Datumsänderung auf `PENDING` zurücksetzen, oder bewusst so lassen
  (Admin trägt Verantwortung). Vor Umsetzung mit Fachseite klären.
- **[10] Status-Pfade Nutzer (🟡):** `toggleUserStatusAction` kann `INVITED`
  direkt auf `ACTIVE` setzen. Nach Fix [3] unkritisch, aber Status-Übergänge
  könnten expliziter validiert werden.
- **[11] `guestCount`-Plausibilität (🟡):** Aktuell nur `>= 1` geprüft; eine
  sinnvolle Obergrenze (z. B. Bettenzahl) wäre robuster.
- **[15] Login-Rate-Limiting (🟢):** Kein Brute-Force-Schutz. Relevant erst bei
  öffentlich erreichbarem Deployment.
