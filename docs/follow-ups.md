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

## Behoben (zweite Runde)
- **[6] Deaktivierte Session lebt weiter** — `requireUser` prüft jetzt bei jeder
  geschützten Anfrage den aktuellen DB-Status. Ein `DISABLED`-Nutzer wird über
  `/logout` (Route Handler, der den Cookie löscht) ausgeloggt und sieht auf der
  Login-Seite einen Hinweis. Loop-sicher, da der Cookie vor dem Rücksprung auf
  `/login` gelöscht wird. `requireUser` nutzt außerdem die aktuelle Rolle aus der
  DB (kein veralteter Rollen-Claim im Token).
- **[7] Admin-Edit einer CONFIRMED-Buchung** — bewusste Entscheidung: Status
  bleibt `CONFIRMED` (kein Auto-Reset auf `PENDING`). Konfliktprüfung gegen
  andere CONFIRMED läuft weiter; der Admin trägt die Verantwortung. Dokumentiert
  im Code (`lib/bookings.ts`, `updateBooking`).
- **[10] Status-Pfade Nutzer** — `toggleUserStatusAction` aktiviert `INVITED`
  nicht mehr direkt auf `ACTIVE` (nur über die erste Passwortänderung);
  Deaktivieren einer Einladung bleibt möglich.
- **[11] `guestCount`-Plausibilität** — Obergrenze `MAX_GUEST_COUNT = 20` in der
  Buchungs-Action (Anlegen + Bearbeiten).
- **[15] Login-Rate-Limiting** — einfacher In-Memory-Limiter (`lib/rateLimit.ts`,
  5 Fehlversuche / 15 Min pro E-Mail). Hinweis: Zustand ist pro Prozess und
  übersteht keinen Neustart / mehrere Instanzen — für ein verteiltes Deployment
  später auf einen geteilten Speicher (z. B. Redis) umstellen.
