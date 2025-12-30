import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestAuth } from "@/lib/auth/context";
import { relayProxyFetch } from "@/lib/relayProxy";

export const runtime = "nodejs";

function nowMs() {
  return Date.now();
}

function withTimeout(promise, ms, code = "timeout") {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(code), { code })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function classifyDbError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (err?.code === "timeout" || msg.includes("timeout")) return "db_timeout";
  if (msg.includes("ssl") || msg.includes("tls")) return "db_tls_error";
  if (msg.includes("password") || msg.includes("auth") || msg.includes("authentication")) return "db_auth_failed";
  if (msg.includes("connect") || msg.includes("enotfound") || msg.includes("econnrefused")) return "db_unreachable";
  return "db_error";
}

export async function GET() {
  const auth = await getRequestAuth();
  if (!auth?.session || !auth.isMaster) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  const ts = new Date().toISOString();

  // Relay health via /relay/health
  let relayOk = false;
  let relayCode = null;
  let relayLatencyMs = null;
  let relayBuild = null;

  const t0 = nowMs();
  try {
    const token = process.env.RELAY_TOKEN_HEALTH || process.env.RELAY_TOKEN_TOOLS;
    const r = await relayProxyFetch("/relay/health", {
      method: "GET",
      headers: token ? { "x-relay-token": token } : undefined,
      timeoutMs: 3000,
      retries: 1,
    });
    relayLatencyMs = nowMs() - t0;
    if (r?.ok && r?.json?.ok) {
      relayOk = true;
      relayBuild = r.json.build || null;
    } else {
      relayOk = false;
      relayCode = r?.json?.code || "relay_unhealthy";
    }
  } catch {
    relayLatencyMs = nowMs() - t0;
    relayOk = false;
    relayCode = "relay_unreachable";
  }

  // DB health
  let dbOk = false;
  let dbCode = null;
  let dbLatencyMs = null;
  const t1 = nowMs();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, "timeout");
    dbLatencyMs = nowMs() - t1;
    dbOk = true;
  } catch (e) {
    dbLatencyMs = nowMs() - t1;
    dbOk = false;
    dbCode = classifyDbError(e);
  }

  const ok = relayOk && dbOk;

  return NextResponse.json(
    {
      ok,
      service: "backend",
      env: process.env.NODE_ENV || "development",
      ts,
      relay: {
        ok: relayOk,
        code: relayCode,
        latencyMs: relayLatencyMs,
        build: relayBuild,
      },
      db: {
        ok: dbOk,
        code: dbCode,
        latencyMs: dbLatencyMs,
      },
    },
    { status: ok ? 200 : 502 }
  );
}
