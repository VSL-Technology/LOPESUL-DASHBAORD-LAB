// src/app/api/command/exec/route.js
// Implementação em JavaScript da rota /api/command/exec (sem TypeScript).

import { z } from "zod";
import { relayFetch } from "@/lib/relay";
import { requireDeviceRouter } from "@/lib/device-router";
import { logger } from "@/lib/logger";
import { recordApiMetric } from "@/lib/metrics/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CORS p/ chamadas diretas (ex.: teste via browser)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    },
  });
}

const BodySchema = z.object({
  command: z.string().min(2, "missing command").max(256),
  deviceId: z.string().trim().optional().nullable(),
  dispositivoId: z.string().trim().optional().nullable(),
  mikId: z.string().trim().optional().nullable(),
  routerId: z.string().trim().optional().nullable(),
});

export async function POST(req) {
  const started = Date.now();
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "[command/exec] invalid payload");
    return corsJson({ ok: false, error: "invalid payload" }, 400);
  }
  const { command, deviceId, dispositivoId, mikId, routerId } = parsed.data;

  const asString = (value) => {
    if (typeof value === "string") return value;
    if (value == null) return null;
    return String(value);
  };
  const deviceInput = {
    deviceId: asString(deviceId ?? dispositivoId),
    mikId: asString(mikId ?? routerId),
  };

  let routerInfo;
  try {
    routerInfo = await requireDeviceRouter(deviceInput);
  } catch (err) {
    return corsJson(
      { ok: false, error: err?.code || "device_not_found", detail: err?.message },
      err?.code === "device_not_found" ? 404 : 400
    );
  }

  try {
    const r = await relayFetch("/relay/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // Authorization vem do relayFetch
      body: JSON.stringify({
        host: routerInfo.router.host,
        user: routerInfo.router.user,
        pass: routerInfo.router.pass,
        port: routerInfo.router.port,
        command,
      }),
    });

    // Tenta JSON, se falhar, captura texto bruto
    const text = await r.text();
    let payload = text;
    try {
      payload = JSON.parse(text);
    } catch (_) {}

    recordApiMetric("command_exec", { durationMs: Date.now() - started, ok: r.ok });
    return corsJson(payload, r.status);
  } catch (e) {
    logger.error({ error: e?.message || e }, "[command/exec] relay error");
    recordApiMetric("command_exec", { durationMs: Date.now() - started, ok: false });
    return corsJson({ ok: false, error: "relay_unreachable" }, 502);
  }
}

function corsJson(payload, status = 200) {
  return new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Vary: "Origin",
      },
    }
  );
}
