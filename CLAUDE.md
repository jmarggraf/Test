# CLAUDE.md

Dieses Repo ist für **agentic coding** mit Claude Code eingerichtet. Diese Datei
wird zu Beginn jeder Session gelesen und gibt Claude den nötigen Kontext.

## Projekt

> _Platzhalter:_ Beschreibe hier kurz, was dieses Projekt tut, sobald der erste
> Code existiert (Zweck, wichtigste Komponenten, Einstiegspunkte).

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

> _TODO:_ Sobald ein Tech-Stack gewählt ist, hier die Befehle eintragen, z.B.:
> - Tests: `npm test` / `pytest` / `cargo test` / `go test ./...`
> - Linter: `eslint .` / `ruff check .` / `cargo clippy` / `go vet ./...`
>
> Trage außerdem die Install-/Lint-/Test-Befehle in den SessionStart-Hook ein,
> damit sie in jeder Web-Session verfügbar sind.

## Agentic Workflow (Subagents)

Dieses Repo definiert spezialisierte Subagents unter `.claude/agents/`. Jeder
deckt genau eine Rolle ab und wird von Claude automatisch anhand seiner
`description` ausgewählt — oder explizit per `@agent-<name>` aufgerufen.

| Agent | Rolle |
|-------|-------|
| `requirements-analyst` | Anforderungen klären und als Spezifikation mit Akzeptanzkriterien formulieren |
| `implementer` | Spezifikation in sauberen Code umsetzen |
| `test-engineer` | Unit-Tests schreiben und ausführen |
| `acceptance-reviewer` | Ergebnis gegen die Akzeptanzkriterien abnehmen (Quality Gate) |
| `documentation-writer` | Dokumentation erstellen/aktualisieren |

**Empfohlene Pipeline für ein neues Feature:**
1. `requirements-analyst` → Spezifikation + Akzeptanzkriterien
2. `implementer` → Umsetzung
3. `test-engineer` → Tests
4. `acceptance-reviewer` → Abnahme (zurück zu Schritt 2 bei Nacharbeit)
5. `documentation-writer` → Doku

Explizit aufrufen z.B.: `@agent-requirements-analyst Kläre die Anforderungen für …`

## Konventionen

- **Branches:** Entwicklung erfolgt auf `claude/...`-Branches, nicht direkt auf
  dem Default-Branch.
- **Commits:** Kleine, fokussierte Commits mit klaren, beschreibenden Messages.
- **Pull Requests:** Nur erstellen, wenn ausdrücklich gewünscht.
