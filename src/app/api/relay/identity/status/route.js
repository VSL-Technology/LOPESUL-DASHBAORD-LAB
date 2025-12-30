// Public relay status proxy for portal. Returns only the public block.
import { NextResponse } from "next/server";
import { relayProxyFetch } from "@/lib/relayProxy";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const sid = (searchParams.get("sid") || "").trim();

  if (!sid) {
    return NextResponse.json({ ok: false, code: "missing_sid" }, { status: 400 });
  }

  try {
    const r = await relayProxyFetch(`/relay/identity/status?sid=${encodeURIComponent(sid)}`);
    if (!r.ok || !r.json?.ok) {
      return NextResponse.json({ ok: false, code: "relay_error" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sid, public: r.json.public }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, code: "relay_error" }, { status: 502 });
  }
}
