#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
# Installs project dependencies so tests and linters work in the session.
# Runs synchronously and only in the remote environment.

# Only run in the remote (web) environment; skip locally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "[session-start] Detecting project type..."

# Auto-detect the dependency manifest and install accordingly.
# Idempotent and non-interactive. Prefer install over clean-install so the
# cached container state can be reused.
if [ -f package.json ]; then
  echo "[session-start] package.json found -> npm install"
  npm install

elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  echo "[session-start] Python project found -> pip install"
  if [ -f requirements.txt ]; then
    pip install -r requirements.txt
  fi
  if [ -f pyproject.toml ]; then
    pip install -e . 2>/dev/null || pip install . 2>/dev/null || true
  fi

elif [ -f Cargo.toml ]; then
  echo "[session-start] Cargo.toml found -> cargo fetch"
  cargo fetch

elif [ -f go.mod ]; then
  echo "[session-start] go.mod found -> go mod download"
  go mod download

else
  echo "[session-start] No dependency manifest found yet. Nothing to install."
  echo "[session-start] Add a package.json / pyproject.toml / Cargo.toml / go.mod"
  echo "[session-start] and this hook will install dependencies automatically."
fi

echo "[session-start] Done."
