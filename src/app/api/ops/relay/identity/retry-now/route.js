// Ops endpoint: força retry-now no Relay. Admin apenas.
import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/context";
import { relayProxyFetch } from "@/lib/relayProxy";
import { logger } from "@/lib/logger";

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 5;
const rateMap = new Map();

function rateLimit(key) {
  const now = Date.now();
  const entry = rateMap.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(key, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

export async function POST(req) {
  const auth = await getRequestAuth();
  if (!auth?.session || !auth.isMaster) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sid = (body?.sid || "").trim();

  if (!sid) {
    return NextResponse.json({ ok: false, code: "missing_sid" }, { status: 400 });
  }

  const key = auth.session?.sub || req.headers.get("x-forwarded-for") || "anon";
  if (!rateLimit(`ops-retry:${key}`)) {
    return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  }

  const RELAY_INTERNAL_TOKEN = process.env.RELAY_INTERNAL_TOKEN;
  if (!RELAY_INTERNAL_TOKEN) {
    return NextResponse.json({ ok: false, code: "relay_not_configured" }, { status: 500 });
  }

  const r = await relayProxyFetch(`/relay/identity/retry-now`, {
    method: "POST",
    headers: {
      "X-Relay-Internal": RELAY_INTERNAL_TOKEN,
    },
    body: { sid },
  });

  logger.info(
    {
      userId: auth.session?.sub || null,
      sid,
      at: new Date().toISOString(),
      relayStatus: r.status,
      relayOk: r.ok,
    },
    "[ops/retry-now]"
  );

  if (!r.ok || !r.json?.ok) {
    return NextResponse.json({ ok: false, code: "relay_error" }, { status: 502 });
  }

  return NextResponse.json(r.json, { status: 200 });
}
