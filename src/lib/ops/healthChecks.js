import prisma from '@/lib/prisma';

async function runDbCheck() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

async function runRelayCheck() {
  const started = Date.now();
  const baseRaw = process.env.RELAY_BASE_URL || 'https://relay.3fconnet.cloud';
  const base = String(baseRaw).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const resp = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (resp.status !== 200) {
      return { ok: false, ms: Date.now() - started };
    }

    let payload = null;
    try {
      payload = await resp.json();
    } catch {
      return { ok: false, ms: Date.now() - started };
    }

    return { ok: payload?.status === 'ok', ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runReadyChecks({ requestId }) {
  const [db, relay] = await Promise.all([runDbCheck(), runRelayCheck()]);
  const status = db.ok && relay.ok ? 'ok' : 'degraded';

  return {
    status,
    checks: { db, relay },
    meta: {
      requestId,
      ts: new Date().toISOString(),
    },
  };
}
