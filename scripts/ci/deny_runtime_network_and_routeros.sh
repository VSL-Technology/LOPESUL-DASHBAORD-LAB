#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="src/app/api"

echo "[deny] scanning ${RUNTIME_DIR} for forbidden imports/strings..."

scan() {
  local pattern="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$RUNTIME_DIR"
  else
    grep -RInE "$pattern" "$RUNTIME_DIR" || true
  fi
}

# 1) imports proibidos
if scan "netcheck|mikrotikClient" | head -n 1 | grep -q .; then
  echo "ERROR: netcheck/mikrotikClient found in runtime (${RUNTIME_DIR}). Move to scripts/ops or remove."
  exit 1
fi

# 2) strings RouterOS proibidas em runtime
if scan '"/ip/|/ip/|"/tool/|/tool/' | head -n 1 | grep -q .; then
  echo "ERROR: RouterOS command strings found in runtime (${RUNTIME_DIR}). RouterOS logic must live in Relay."
  exit 1
fi

echo "[deny] ok"
