# Spezifikation: Ferienhaus-Kalender

Status: Entwurf (MVP) · Datum: 2026-06-12 · Autor: requirements-analyst

## 1. Ziel / Problem

Eine Erbengemeinschaft besitzt gemeinsam ein Ferienhaus. Aktuell werden
Aufenthalte vermutlich informell (Telefon, Chat, Zuruf) koordiniert, was zu
Missverständnissen, Doppelbelegungen und Streit über die Nutzungsverteilung
führen kann.

Die App soll eine **einzige, verlässliche Quelle der Wahrheit** für die Belegung
des Hauses schaffen:

- Alle berechtigten Personen sehen in einem gemeinsamen Kalender, wann das Haus
  frei oder belegt ist.
- Mitglieder buchen Aufenthalte selbst; ein Admin bestätigt sie (leichtgewichtige
  Governance, um Konflikte fair zu lösen).
- Ein Analytics-Bereich macht transparent, wer das Haus wie viel genutzt hat —
  wichtig für ein faires Miteinander in einer Erbengemeinschaft.

## 2. Scope

### Festgelegte technische Entscheidungen (nicht mehr zu hinterfragen)
- Tech-Stack: **Next.js + TypeScript**, **PostgreSQL via Prisma**.
- Nutzer-Anlage: Admin legt Nutzer an bzw. lädt per E-Mail ein. **Keine offene
  Registrierung** (geschlossene Gruppe).
- Deployment: zunächst nur **lokal lauffähig** (lokale/Docker-Postgres);
  Cloud-Deployment später.
- Repo ist **Greenfield** (nur Claude-Code-Setup vorhanden).

### In Scope (MVP, erste Version)
- Geschlossene Nutzergruppe; Anlage/Einladung durch Admin.
- Login für angelegte Nutzer.
- Gemeinsamer Kalender mit Monats-/Listenansicht der Aufenthalte.
- Buchung anlegen, eigene Buchung bearbeiten und stornieren.
- Status-Workflow: `pending` -> `confirmed` / `rejected` (Admin bestätigt/lehnt ab).
- Verfügbarkeits-/Konfliktprüfung gegen Doppelbuchungen.
- Analytics: Aufenthalte und Nächte pro Nutzer, mit Zeitraumfilter.
- Nur lokal lauffähig (lokale Postgres bzw. Docker-Postgres).

### Out of Scope (NICHT in der ersten Version)
- Öffentliche/Self-Service-Registrierung.
- Cloud-Deployment, CI/CD, produktives Hosting (kommt später).
- Bezahlung, Nebenkosten-/Kostenabrechnung, Kaution.
- Putzplan-Logik, Inventar, Schlüsselübergabe-Tracking.
- Mehrere Häuser/Objekte (System geht von **genau einem** Ferienhaus aus).
- Mobile App (Web responsive genügt).
- Echtzeit-Kollaboration / Push; einfaches Reload genügt.
- E-Mail-Versand von Benachrichtigungen ist optional (siehe Annahme A7), nicht
  zwingend MVP.
- Wartelisten / Buchungsanfragen-Priorisierung / Abstimmungen bei Konflikten.
- Wiederkehrende Buchungen.
- Faire Verteilungsquoten pro Nutzer/Jahr (siehe Q4).

## 3. Rollen & Rechte

Zwei Rollen. Jeder Nutzer hat genau eine Rolle.

| Aktion | Nutzer (member) | Admin |
|---|---|---|
| Einloggen | Ja | Ja |
| Kalender / Belegung ansehen | Ja | Ja |
| Eigene Buchung anlegen | Ja | Ja |
| Eigene `pending` Buchung bearbeiten | Ja | Ja |
| Eigene Buchung stornieren | Ja | Ja |
| Fremde Buchung bearbeiten/stornieren | Nein | Ja |
| Buchung bestätigen (`confirmed`) | Nein | Ja |
| Buchung ablehnen (`rejected`) | Nein | Ja |
| Nutzer anlegen / einladen / deaktivieren | Nein | Ja |
| Analytics ansehen | Ja (siehe A5) | Ja |

Annahme A1: Der Admin ist selbst auch Mitglied und darf eigene Aufenthalte buchen.
Annahme A2: Es gibt mindestens einen Admin; das System wird mit genau einem
initialen Admin geseedet (Seed-Skript). Mehrere Admins sind erlaubt.

## 4. Datenmodell-Entwurf

Persistenz: PostgreSQL via Prisma. Felder als Vorschlag; IDs als `cuid`/`uuid`.

### User
| Feld | Typ | Anmerkung |
|---|---|---|
| id | string (PK) | |
| email | string, unique | Login-Identität, Einladungs-Adresse |
| name | string | Anzeigename im Kalender/Analytics |
| role | enum `ADMIN` \| `MEMBER` | Default `MEMBER` |
| passwordHash | string, nullable | gesetzt nach Annahme der Einladung |
| status | enum `INVITED` \| `ACTIVE` \| `DISABLED` | Lifecycle |
| invitedById | string (FK -> User), nullable | wer eingeladen hat |
| createdAt / updatedAt | datetime | |

### Booking
| Feld | Typ | Anmerkung |
|---|---|---|
| id | string (PK) | |
| userId | string (FK -> User) | Inhaber/Bucher |
| startDate | date | Check-in-Tag (inklusive) |
| endDate | date | Check-out-Tag (exklusiv, siehe Geschäftsregeln) |
| status | enum `PENDING` \| `CONFIRMED` \| `REJECTED` \| `CANCELLED` | |
| title | string, nullable | optionaler Anlass (z. B. "Sommerurlaub") |
| guestCount | int, nullable | Anzahl Personen (informativ) |
| note | string, nullable | Freitext |
| decidedById | string (FK -> User), nullable | Admin, der entschieden hat |
| decidedAt | datetime, nullable | Zeitpunkt der Entscheidung |
| createdAt / updatedAt | datetime | |

Beziehungen:
- `User 1 — n Booking` (Inhaber)
- `User 1 — n Booking` über `decidedById` (Entscheider, optional)

### Invitation (optional, Annahme A6)
Falls Einladung per Token-Link statt direkter Passwortvergabe umgesetzt wird:
| Feld | Typ | Anmerkung |
|---|---|---|
| id | string (PK) | |
| email | string | Ziel-Adresse |
| token | string, unique | Einmal-Token |
| expiresAt | datetime | Ablauf |
| acceptedAt | datetime, nullable | |
| createdById | string (FK -> User) | einladender Admin |

Hinweis: Im MVP kann Einladung vereinfacht werden, indem der Admin den Nutzer mit
einem temporären Passwort anlegt (siehe A6). `Invitation` ist dann optional.

## 5. Funktionale Anforderungen (nummeriert, testbar)

### 5.1 Auth / Nutzerverwaltung
- FR-1: Nur angelegte Nutzer mit `status = ACTIVE` können sich mit E-Mail +
  Passwort einloggen.
- FR-2: Es gibt keine öffentliche Registrierung; es existiert keine
  Self-Service-Sign-up-Route.
- FR-3: Ein Admin kann einen neuen Nutzer per E-Mail anlegen/einladen (Name,
  E-Mail, Rolle).
- FR-4: Ein eingeladener Nutzer setzt beim ersten Zugang sein Passwort (per
  Einladungslink/Token oder durch Erstanmeldung mit temporärem Passwort, siehe A6).
- FR-5: Ein Admin kann einen Nutzer deaktivieren (`status = DISABLED`); ein
  deaktivierter Nutzer kann sich nicht mehr einloggen, seine bestehenden
  Buchungen bleiben sichtbar.
- FR-6: E-Mail-Adressen sind eindeutig; ein zweiter Nutzer mit gleicher E-Mail
  wird abgelehnt.
- FR-7: Ein Nutzer kann sich ausloggen.

### 5.2 Kalenderansicht
- FR-8: Eingeloggte Nutzer sehen einen gemeinsamen Kalender mit allen Buchungen
  (Status `PENDING` und `CONFIRMED`).
- FR-9: Buchungen sind nach Status visuell unterscheidbar (z. B. `PENDING`
  gestrichelt/blass, `CONFIRMED` voll). `REJECTED` und `CANCELLED` werden im
  Kalender standardmäßig nicht angezeigt.
- FR-10: Jede Buchung zeigt mindestens Bucher-Name, Zeitraum und Status.
- FR-11: Der Kalender bietet eine Monatsansicht und erlaubt Navigation
  vor/zurück sowie Sprung zu "heute".
- FR-12: Aus der Kalenderansicht ist erkennbar, welche Tage frei sind (keine
  `CONFIRMED`- und keine `PENDING`-Buchung).

### 5.3 Buchung anlegen / bearbeiten / stornieren
- FR-13: Ein Nutzer kann einen Aufenthalt mit Start- und Enddatum anlegen; die
  Buchung erhält initial `status = PENDING`.
- FR-14: Beim Anlegen prüft das System auf Konflikte (siehe 5.5) und lehnt
  überlappende Buchungen mit klarer Fehlermeldung ab.
- FR-15: Validierung: `endDate` muss nach `startDate` liegen; `startDate` darf
  nicht in der Vergangenheit liegen (siehe Geschäftsregel BR-7).
- FR-16: Ein Nutzer kann eine **eigene** Buchung bearbeiten, solange sie
  `PENDING` ist (Datum, Titel, Notiz). Änderungen durchlaufen erneut die
  Konfliktprüfung.
- FR-17: Eine **bereits bestätigte** (`CONFIRMED`) Buchung kann ein normaler
  Nutzer nicht mehr bearbeiten, aber stornieren (siehe FR-18). Ein Admin kann
  sie bearbeiten.
- FR-18: Ein Nutzer kann eine **eigene** Buchung stornieren (`status =
  CANCELLED`), solange ihr Zeitraum nicht in der Vergangenheit liegt.
- FR-19: Ein Admin kann jede Buchung bearbeiten oder stornieren.

### 5.4 Admin-Bestätigungs-Workflow
- FR-20: Ein Admin sieht eine Liste aller `PENDING`-Buchungen (Bestätigungs-Queue).
- FR-21: Ein Admin kann eine `PENDING`-Buchung bestätigen (`CONFIRMED`) oder
  ablehnen (`REJECTED`); `decidedById` und `decidedAt` werden gesetzt.
- FR-22: Bestätigen prüft erneut auf Konflikte mit bereits `CONFIRMED`-Buchungen;
  bei Konflikt ist die Bestätigung nicht möglich (Fehlermeldung).
- FR-23: Nur Buchungen im Status `PENDING` können bestätigt/abgelehnt werden;
  andere Status-Übergänge werden serverseitig abgelehnt.

### 5.5 Verfügbarkeit / Konfliktprüfung
- FR-24: Zwei Buchungen überlappen, wenn sich ihre Datumsintervalle schneiden
  (Halb-offenes Intervall `[startDate, endDate)`, siehe BR-1).
- FR-25: Eine neue oder geänderte Buchung darf sich nicht mit einer bestehenden
  `CONFIRMED`-Buchung überlappen (harte Sperre).
- FR-26: Mehrere `PENDING`-Buchungen für denselben Zeitraum sind erlaubt, werden
  aber als Konflikt markiert/angezeigt, damit der Admin entscheiden kann (siehe
  BR-3). Default-Annahme A3 kann dies verschärfen.
- FR-27: Die Konfliktprüfung ignoriert `REJECTED`- und `CANCELLED`-Buchungen.

### 5.6 Analytics
- FR-28: Der Analytics-Bereich zeigt pro Nutzer: Anzahl Aufenthalte und Summe der
  Nächte.
- FR-29: Analytics berücksichtigt standardmäßig nur `CONFIRMED`-Buchungen (siehe
  A4).
- FR-30: Es gibt einen Zeitraumfilter (von/bis); Default ist das laufende
  Kalenderjahr.
- FR-31: Eine Gesamtzeile zeigt die Summe über alle Nutzer (Gesamtnächte,
  Gesamtaufenthalte).
- FR-32 (optional/Nice-to-have): prozentualer Anteil pro Nutzer an den
  Gesamtnächten.

## 6. Geschäftsregeln & Randfälle

- BR-1: Zeiträume sind **halb-offen** `[startDate, endDate)`. `endDate` ist der
  Check-out-Tag und zählt nicht als belegte Nacht. Anzahl Nächte =
  `endDate - startDate` (in Tagen). Folge: Eine Buchung A mit `endDate = 10.` und
  eine Buchung B mit `startDate = 10.` überlappen **nicht** (Check-out und
  Check-in am selben Tag erlaubt).
- BR-2: Eine `CONFIRMED`-Buchung blockiert ihren Zeitraum hart. Keine zweite
  `CONFIRMED`-Buchung im selben Zeitraum.
- BR-3: `PENDING`-Buchungen blockieren **nicht** hart; sie zählen als
  "vorgemerkt". Überlappende `PENDING`-Buchungen sind sichtbar, damit der Admin
  fair entscheidet. Sobald eine davon bestätigt wird, blockiert sie den Zeitraum
  und kollidierende `PENDING`-Buchungen können nicht mehr bestätigt werden.
- BR-4: Ein Nutzer darf seine **eigenen** Buchungen stornieren. Stornieren ist
  ein Soft-Delete (`status = CANCELLED`), kein physisches Löschen.
- BR-5: Ablehnen (`REJECTED`) ist eine Admin-Aktion; Stornieren (`CANCELLED`) ist
  eine Nutzer-/Admin-Aktion. Beide entfernen die Buchung aus dem aktiven
  Kalender und aus der Konfliktprüfung.
- BR-6: Vergangene Buchungen (Zeitraum komplett in der Vergangenheit) sind
  schreibgeschützt: nicht bearbeitbar, nicht stornierbar; sie zählen weiter in
  Analytics.
- BR-7: Neue Buchungen müssen in der Zukunft (oder ab heute) beginnen;
  rückwirkendes Buchen ist im MVP nicht erlaubt (Annahme A8 kann dies für Admins
  lockern).
- BR-8: Maximale Aufenthaltsdauer ist im MVP nicht begrenzt (siehe offene Frage Q3).
- BR-9: Selbst-Bestätigung: Ein Admin kann seine eigene Buchung bestätigen. Das
  ist erlaubt, aber im Audit über `decidedById` nachvollziehbar.
- BR-10: Konfliktprüfung ist serverseitig zu erzwingen (nicht nur im UI). Bei
  gleichzeitigen Anfragen wird die Prüfung beim Schreiben (Anlegen/Bestätigen)
  in einer Transaktion durchgeführt, damit kein Doppel-`CONFIRMED` entstehen kann.

## 7. Akzeptanzkriterien (Given/When/Then)

### Auth / Nutzerverwaltung
- AK-1: Given ein Besucher ohne Account, When er die App öffnet, Then sieht er
  nur einen Login (keine Registrierungsoption).
- AK-2: Given ein Admin ist eingeloggt, When er einen neuen Nutzer mit Name,
  E-Mail und Rolle anlegt, Then erscheint der Nutzer in der Nutzerliste mit
  Status `INVITED`.
- AK-3: Given eine E-Mail ist bereits vergeben, When der Admin sie erneut anlegt,
  Then wird die Aktion mit einer eindeutigen Fehlermeldung abgelehnt.
- AK-4: Given ein deaktivierter Nutzer, When er sich einzuloggen versucht, Then
  schlägt der Login fehl.

### Kalender & Buchung
- AK-5: Given ein eingeloggter Nutzer, When er den Kalender öffnet, Then sieht er
  alle `PENDING`- und `CONFIRMED`-Buchungen visuell unterscheidbar.
- AK-6: Given ein freier Zeitraum, When ein Nutzer eine Buchung für diesen
  Zeitraum anlegt, Then wird sie mit Status `PENDING` gespeichert und im Kalender
  angezeigt.
- AK-7: Given eine bestehende `CONFIRMED`-Buchung vom 10.–15., When ein Nutzer
  eine überlappende Buchung (z. B. 12.–14.) anlegt, Then wird das Anlegen mit
  einem Konfliktfehler abgelehnt.
- AK-8: Given Buchung A endet am 10. und Buchung B beginnt am 10., When B
  angelegt wird, Then gilt das **nicht** als Konflikt (Check-out/Check-in am
  selben Tag).
- AK-9: Given ein Nutzer hat eine eigene `PENDING`-Buchung, When er deren Datum
  ändert, Then wird die Konfliktprüfung erneut ausgeführt und bei Erfolg
  gespeichert.
- AK-10: Given ein Nutzer hat eine fremde Buchung im Blick, When er sie zu
  bearbeiten/stornieren versucht, Then wird die Aktion verweigert (nur Admin
  darf das).
- AK-11: Given eine Buchung liegt komplett in der Vergangenheit, When der
  Inhaber sie zu stornieren versucht, Then wird die Aktion verweigert.

### Bestätigungs-Workflow
- AK-12: Given eine `PENDING`-Buchung, When der Admin sie bestätigt, Then wird
  der Status `CONFIRMED`, und `decidedById`/`decidedAt` sind gesetzt.
- AK-13: Given zwei überlappende `PENDING`-Buchungen, When der Admin die erste
  bestätigt, Then ist anschließend die Bestätigung der zweiten nicht mehr möglich
  (Konflikt).
- AK-14: Given ein normaler Nutzer, When er den Bestätigungs-Endpunkt aufruft,
  Then wird er mit "nicht berechtigt" abgewiesen.

### Analytics
- AK-15: Given mehrere `CONFIRMED`-Buchungen verschiedener Nutzer, When ein
  Nutzer Analytics öffnet, Then sieht er pro Nutzer Anzahl Aufenthalte und Summe
  der Nächte.
- AK-16: Given ein Zeitraumfilter von/bis, When er gesetzt wird, Then werden nur
  Buchungen berücksichtigt, deren Nächte in den Zeitraum fallen.
- AK-17: Given eine Buchung vom 1.–4. (3 Nächte), When sie in Analytics einfließt,
  Then werden 3 Nächte gezählt (nicht 4), gemäß BR-1.

## 8. Offene Fragen / Annahmen

### Annahmen (Default, als solche markiert)
- A1: Der Admin ist auch buchendes Mitglied.
- A2: Es gibt mindestens einen geseedeten initialen Admin; mehrere Admins erlaubt.
- A3: Überlappende `PENDING`-Buchungen sind erlaubt und werden nur markiert
  (FR-26). Alternative: nur eine `PENDING` pro Zeitraum zulassen ("first come
  first served") — siehe Q1.
- A4: Analytics zählt nur `CONFIRMED`-Buchungen. Vergangene zählen mit.
- A5: Analytics ist für alle Nutzer sichtbar (Transparenz in der
  Erbengemeinschaft). Falls nicht gewünscht: Admin-only — siehe Q2.
- A6: Einladung im MVP vereinfacht über Admin-vergebenes temporäres Passwort;
  Token-Link (`Invitation`-Tabelle) ist die robustere Variante und optional.
- A7: E-Mail-Benachrichtigungen (Einladung, Bestätigung/Ablehnung) sind nicht
  zwingend MVP; ohne SMTP-Setup wird nur In-App-Status angezeigt.
- A8: Rückwirkendes Buchen ist verboten (BR-7); ggf. für Admins lockern.
- A9: Genau ein Ferienhaus; kein Objekt-/Ressourcen-Konzept nötig.
- A10: Zeitzone/Datumslogik auf Tagesbasis (keine Uhrzeiten); Check-in/Check-out
  als ganze Tage.

### Zu klärende Fragen
- Q1: Sollen mehrere `PENDING`-Buchungen denselben Zeitraum belegen dürfen
  (A3), oder gilt strikt "first come, first served" (erste `PENDING` blockiert)?
- Q2: Ist Analytics für alle Mitglieder sichtbar oder nur für Admins?
- Q3: Gibt es eine maximale Aufenthaltsdauer oder Mindestvorlaufzeit (z. B.
  "max. 21 Nächte", "frühestens X Tage im Voraus")?
- Q4: Soll es eine faire Verteilungsregel/Quote pro Nutzer pro Jahr geben (z. B.
  in Ferienzeiten)? Im MVP bewusst ausgeklammert.
- Q5: Müssen Bestätigung/Ablehnung dem Bucher mitgeteilt werden (E-Mail vs.
  nur In-App)?
- Q6: Soll der Kalender Feiertage/Schulferien einblenden (Nice-to-have)?
- Q7: Brauchen wir ein Audit-/Verlaufslog über Status-Änderungen hinaus?

## 9. Betroffene Dateien / Bereiche (Greenfield)

Das Repo ist leer (nur Claude-Code-Setup). Die Umsetzung legt voraussichtlich an:

- `prisma/schema.prisma` — Datenmodell (User, Booking, optional Invitation),
  Enums, Relationen.
- `prisma/seed.ts` — Seed des initialen Admins.
- `app/` (Next.js App Router):
  - `app/(auth)/login/` — Login.
  - `app/calendar/` — Kalenderansicht (Monats-/Listenansicht).
  - `app/bookings/` — Buchung anlegen/bearbeiten/stornieren.
  - `app/admin/users/` — Nutzerverwaltung (Admin).
  - `app/admin/bookings/` — Bestätigungs-Queue (Admin).
  - `app/analytics/` — Auswertung.
- `app/api/**` bzw. Server Actions — Buchungs-CRUD, Status-Workflow,
  Konfliktprüfung, Auth.
- `lib/availability.ts` — zentrale Überlappungs-/Konfliktlogik (BR-1, FR-24..27).
- `lib/auth.ts` — Session/Rollenprüfung.
- `docker-compose.yml` / `.env.example` — lokale Postgres.
- `CLAUDE.md` — Tests/Lint-Befehle nach Stack-Wahl ergänzen.

## 10. Empfohlene MVP-Reihenfolge (Schnitt)

1. Datenmodell + Auth + Admin-Nutzeranlage (FR-1..7).
2. Buchung anlegen + Kalenderansicht + Konfliktprüfung (FR-8..15, 24..27).
3. Bestätigungs-Workflow (FR-20..23).
4. Bearbeiten/Stornieren (FR-16..19).
5. Analytics (FR-28..32).
