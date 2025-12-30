// src/lib/relayHotspot.js
import crypto from "crypto";
import { relayFetch } from "./relayFetch";

function derivePassword(token) {
  const secret = process.env.HOTSPOT_PASS_SECRET || "dev-secret";
  
  // Security check: ensure secret is configured in production
  if (!process.env.HOTSPOT_PASS_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "HOTSPOT_PASS_SECRET must be set in production environment. " +
        "Using default secret is a critical security vulnerability."
      );
    } else {
      console.warn(
        "[SECURITY WARNING] HOTSPOT_PASS_SECRET not configured. " +
        "Using default 'dev-secret'. This MUST be set before deploying to production!"
      );
    }
  }
  
  return crypto
    .createHash("sha256")
    .update(`${token}:${secret}`)
    .digest("hex")
    .slice(0, 12);
}

export function tokenToUsername(token) {
  return `t_${token.replace(/-/g, "").slice(0, 12)}`;
}

export function buildMockHotspotCreds(token) {
  return {
    username: tokenToUsername(token),
    password: derivePassword(token),
    mocked: true,
  };
}

export async function relayEnsureHotspotUser({ identity, token, minutes }) {
  const username = tokenToUsername(token);
  const password = derivePassword(token);

  if (process.env.RELAY_DISABLE === "1" || !process.env.RELAY_URL) {
    return { username, password, mocked: true };
  }

  try {
    const out = await relayFetch("/relay/hotspot/ensure-user", {
      identity,
      token,
      minutes,
    });
    return out;
  } catch (err) {
    // fallback resiliente: evita erro 500 no backend e mantém fluxo
    // CRITICAL: relay connectivity issue - this masks real infrastructure problems
    console.error("[relayEnsureHotspotUser] RELAY CONNECTIVITY FAILURE - fallback mock:", err?.message || err);
    console.warn("[relayEnsureHotspotUser] fallback mock:", err?.message || err);
    return { username, password, mocked: true, relayError: true };
  }
}
