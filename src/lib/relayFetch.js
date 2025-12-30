import crypto from "crypto";

function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function signBody({ secret, ts, nonce, bodyString }) {
  const raw = Buffer.from(bodyString, "utf8");
  const data = Buffer.concat([
    Buffer.from(String(ts)),
    Buffer.from("\n"),
    Buffer.from(nonce),
    Buffer.from("\n"),
    raw,
  ]);
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export async function relayFetch(
  path,
  { method = "POST", tokenEnv, body = {}, timeoutMs = 5000 } = {}
) {
  const base = (process.env.RELAY_URL || process.env.RELAY_BASE_URL || "").replace(/\/$/, "");
  const token = tokenEnv ? process.env[tokenEnv] : process.env.RELAY_TOKEN;
  const secret = process.env.RELAY_API_SECRET;

  if (!base || !token) throw new Error("RELAY_NOT_CONFIGURED");
  if (process.env.NODE_ENV === "production" && !secret) throw new Error("RELAY_API_SECRET_REQUIRED");

  let baseUrl;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new Error("RELAY_INVALID_BASE_URL");
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("RELAY_INVALID_PROTOCOL");
  }

  const allowedHostsEnv = process.env.RELAY_ALLOWED_HOSTS;
  if (allowedHostsEnv) {
    const allowedHosts = new Set(
      allowedHostsEnv
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h.length > 0)
    );
    if (!allowedHosts.has(baseUrl.hostname)) {
      throw new Error("RELAY_HOST_NOT_ALLOWED");
    }
  }

  const bodyString = JSON.stringify(body);
  const ts = Date.now();
  const nonce = makeNonce();

  const headers = {
    "Content-Type": "application/json",
    "x-relay-token": token,
  };

  if (secret) {
    headers["x-relay-ts"] = String(ts);
    headers["x-relay-nonce"] = nonce;
    headers["x-relay-signature"] = signBody({ secret, ts, nonce, bodyString });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(path, baseUrl).toString();
    const r = await fetch(url, {
      method,
      headers,
      body: bodyString,
      signal: controller.signal,
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j?.ok !== false, status: r.status, json: j };
  } finally {
    clearTimeout(t);
  }
}

export default relayFetch;
