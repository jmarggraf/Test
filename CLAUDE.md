# CLAUDE.md

Dieses Repo ist für **agentic coding** mit Claude Code eingerichtet. Diese Datei
wird zu Beginn jeder Session gelesen und gibt Claude den nötigen Kontext.

## Projekt

**Ferienhaus-Kalender** – gemeinsame Buchungsapp für eine Erbengemeinschaft.
Eine geschlossene Gruppe von Mitgliedern kann Aufenthalte im gemeinsamen
Ferienhaus koordinieren: Buchungen anlegen, einen Admin-Bestätigungsworkflow
durchlaufen und die Nutzungsverteilung per Analytics auswerten.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL via Prisma ·
Tailwind CSS · Vitest

**Einstiegspunkte:**
- `app/layout.tsx` – Root-Layout
- `app/(app)/` – authentifizierte App-Routen (Kalender, Analytics, Home)
- `app/(auth)/login/` – Login (kein öffentliches Sign-up, FR-2)
- `app/(auth)/change-password/` – Pflicht-Passwortänderung nach Erstanmeldung
- `app/admin/users/` – Nutzerverwaltung (nur Admin)
- `lib/auth.ts` – JWT-Session-Helfer (`getSession`, `requireUser`, `requireAdmin`)
- `lib/availability.ts` – reine Konfliktprüfungs-Logik (BR-1)
- `lib/db.ts` – Prisma-Client-Singleton
- `middleware.ts` – Route-Guards (Auth + Admin-Check)
- `prisma/schema.prisma` – Datenmodell (User, Booking, Enums)

## Setup & Dependencies

Dependencies werden automatisch über den SessionStart-Hook installiert:
`.claude/hooks/session-start.sh`. Der Hook erkennt das Manifest (npm, pip,
cargo, go) selbst und installiert die passenden Pakete. Er läuft nur im
Remote-Env (Claude Code on the web).

Manuell ausführen (z.B. zum Testen):

```bash
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```

## Tests & Linting

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (http://localhost:3000)
npm run dev

# Produktions-Build prüfen
npm run build

# TypeScript-Typen prüfen (ohne Emit)
npx tsc --noEmit

# ESLint
npm run lint

# Unit-Tests ausführen (Vitest)
npm test

# Tests im Watch-Modus
npm run test:watch
```

### Datenbank (lokale Postgres via Docker)

```bash
# Postgres starten
docker compose up -d db

# Prisma-Client generieren (nach Schema-Änderungen)
npm run db:generate
# oder: npx prisma generate

# Initialmigration durchführen (benötigt laufende DB)
npm run db:migrate

# Migrations deployen (Produktion)
npm run db:migrate:deploy

# Seed: initialen Admin anlegen
npm run db:seed

# Schema validieren (ohne DB)
npm run db:validate

# Prisma Studio (DB-Browser)
npm run db:studio
```

### Umgebungsvariablen

Kopiere `.env.example` nach `.env` und passe die Werte an:

```bash
cp .env.example .env
```

Wichtige Variablen: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Agentic Workflow (Subagents)

Dieses Repo definiert spezialisierte Subagents unter `.claude/agents/`. Jeder
deckt genau eine Rolle ab und wird von Claude automatisch anhand seiner
`description` ausgewählt — oder explizit per `@agent-<name>` aufgerufen.

| Agent | Rolle |
|-------|-------|
| `requirements-analyst` | Anforderungen klären und als Spezifikation mit Akzeptanzkriterien formulieren (opus) |
| `implementer` | Spezifikation in sauberen Code umsetzen |
| `test-engineer` | Unit-Tests schreiben und ausführen |
| `code-reviewer` | Diff gezielt auf Korrektheits-Bugs und Sicherheit prüfen (read-only) |
| `debugger` | Grundursache von Fehlern/fehlschlagenden Tests finden und beheben |
| `acceptance-reviewer` | Ergebnis gegen die Akzeptanzkriterien abnehmen (Quality Gate, opus) |
| `documentation-writer` | Dokumentation erstellen/aktualisieren |

**Empfohlene Pipeline für ein neues Feature:**
1. `requirements-analyst` → Spezifikation + Akzeptanzkriterien
2. `implementer` → Umsetzung
3. `test-engineer` → Tests
4. `code-reviewer` → Diff auf Bugs/Security prüfen
5. `debugger` → bei Fehlern/roten Tests Ursache finden und beheben
6. `acceptance-reviewer` → fachliche Abnahme (zurück zu Schritt 2 bei Nacharbeit)
7. `documentation-writer` → Doku

Explizit aufrufen z.B.: `@agent-requirements-analyst Kläre die Anforderungen für …`

## Konventionen

- **Branches:** Entwicklung erfolgt auf `claude/...`-Branches, nicht direkt auf
  dem Default-Branch.
- **Commits:** Kleine, fokussierte Commits mit klaren, beschreibenden Messages.
- **Pull Requests:** Nur erstellen, wenn ausdrücklich gewünscht.
