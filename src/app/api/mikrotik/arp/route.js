// src/app/api/mikrotik/arp/route.js
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDeviceRouter } from "@/lib/device-router";
import { logger } from "@/lib/logger";
import { recordApiMetric } from "@/lib/metrics/index";
import { relayFetch } from "@/lib/relay";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  ip: z.string().min(7).max(50),
  deviceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/, { message: "Invalid deviceId" })
    .optional()
    .nullable(),
  mikId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/, { message: "Invalid mikId" })
    .optional()
    .nullable(),
});

export async function GET(req) {
  const started = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      ip: searchParams.get("ip"),
      deviceId: searchParams.get("deviceId"),
      mikId: searchParams.get("mikId"),
    });

    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "[mikrotik/arp] invalid query");
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { ip, deviceId, mikId } = parsed.data;

    let routerInfo;
    try {
      routerInfo = await requireDeviceRouter({ deviceId, mikId });
    } catch (err) {
      return NextResponse.json(
        { error: err?.code || "device_not_found", detail: err?.message },
        err?.code === "device_not_found" ? 404 : 400
      );
    }

    // Delegamos a resolução ARP ao Relay (fonte da verdade Mikrotik)
    const r = await relayFetch("/relay/arp/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip,
        deviceId: routerInfo.device?.id ?? deviceId ?? null,
        mikId: routerInfo.device?.mikId ?? mikId ?? null,
      }),
    }).catch((err) => {
      logger.warn({ err: err?.message || err }, "[mikrotik/arp] relay lookup failed");
      return null;
    });

    if (!r) {
      return NextResponse.json({ error: "Relay unreachable" }, { status: 502 });
    }

    const j = await r.json().catch(() => ({}));
    const mac = j?.mac || j?.data?.mac || null;

    if (mac) {
      logger.debug({ ip, mac }, "[mikrotik/arp] mac resolved via relay");
      recordApiMetric("mikrotik_arp", { durationMs: Date.now() - started, ok: true });
      return NextResponse.json({ mac });
    }

    recordApiMetric("mikrotik_arp", { durationMs: Date.now() - started, ok: true });
    return NextResponse.json({ mac: null, message: "MAC not found in ARP table" });
  } catch (e) {
    logger.error({ error: e?.message || e }, "[mikrotik/arp] error");
    recordApiMetric("mikrotik_arp", { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ error: e?.message || "internal_error" }, { status: 500 });
  }
}
