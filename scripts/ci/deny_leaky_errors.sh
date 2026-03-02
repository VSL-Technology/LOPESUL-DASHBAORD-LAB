#!/usr/bin/env bash
set -euo pipefail

echo "[deny] scanning hardened API routes for leaky error payloads..."

TARGETS=(
  src/app/api/command/exec/route.js
  src/app/api/liberar-acesso/route.js
  src/app/api/hotspot/autorizar/route.js
  src/app/api/hotspot/kick/route.ts
  src/app/api/hotspot/kick/by-ip/route.ts
  src/app/api/hotspot/kick/by-mac/route.ts
  src/app/api/hotspot/kick/by-user/route.ts
  src/app/api/relay/exec/route.ts
  src/app/api/relay/exec-by-device/route.js
  src/app/api/ops/relay/identity/retry-now/route.js
  src/app/api/reconectar/route.js
  src/app/api/clientes/forcar-reconexao/route.js
  src/app/api/pagamentos/checkout/route.js
  src/app/api/payments/pix/route.js
  src/app/api/payments/card/route.js
  src/app/api/pix/criar/route.js
  src/app/api/metrics/route.js
  src/app/api/status-dispositivos/route.js
  src/app/api/relay/health/route.ts
  src/app/api/health/live/route.js
  src/app/api/health/ready/route.js
  src/app/api/health/route.js
  src/app/api/webhooks/pagarme/route.js
)

if rg -n "NextResponse\.json\([^\n]*err\.(message|stack)|Response\.json\([^\n]*err\.(message|stack)|error:\s*err\.(message|stack)|detail:\s*err\.(message|stack)|raw:\s*err" "${TARGETS[@]}"; then
  echo "[deny] found potentially leaky error response"
  exit 1
fi

echo "[deny] ok"
