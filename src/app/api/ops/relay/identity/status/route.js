// Ops endpoint: retorna public + ops, apenas para admin. Usa relayProxyFetch com timeout+retry.
import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/context";
import { relayProxyFetch } from "@/lib/relayProxy";

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 10;
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

export async function GET(req) {
  const auth = await getRequestAuth();
  if (!auth?.session || !auth.isMaster) {
    return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  }

  const key = auth.session?.sub || req.headers.get("x-forwarded-for") || "anon";
  if (!rateLimit(`ops-status:${key}`)) {
    return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const sid = (searchParams.get("sid") || "").trim();

  if (!sid) {
    return NextResponse.json({ ok: false, code: "missing_sid" }, { status: 400 });
  }

  const RELAY_INTERNAL_TOKEN = process.env.RELAY_INTERNAL_TOKEN;
  if (!RELAY_INTERNAL_TOKEN) {
    return NextResponse.json({ ok: false, code: "relay_not_configured" }, { status: 500 });
  }

  const r = await relayProxyFetch(`/relay/identity/status?sid=${encodeURIComponent(sid)}`, {
    headers: { "X-Relay-Internal": RELAY_INTERNAL_TOKEN },
  });

  if (!r.ok || !r.json?.ok) {
    return NextResponse.json({ ok: false, code: "relay_error" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sid, public: r.json.public, ops: r.json.ops }, { status: 200 });
}
