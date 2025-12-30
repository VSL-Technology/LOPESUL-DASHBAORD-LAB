// src/app/api/dispositivos/ping/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics/index';
import { checkInternalAuth } from '@/lib/security/internalAuth';
import net from 'node:net';

const TIMEOUT_MS = 2000;    // timeout curto por host
const CONCURRENCY = 10;     // limita paralelismo

function normalizeUrl(ip) {
  if (!ip) return null;
  let s = String(ip).trim();

  // Apenas IP literal (v4 ou v6), opcionalmente com porta. Hostnames e URLs completas são recusados para mitigar SSRF.
  const match = s.match(/^\[?([A-Fa-f0-9:.]+)\]?(:\d{1,5})?$/);
  if (!match) return null;
  const host = match[1];
  const port = match[2] || '';
  const ipType = net.isIP(host);
  if (!ipType) return null;

  // Bloqueia loopback/link-local; permitimos redes privadas (dispositivos internos).
  const isLoopback = host === '127.0.0.1' || host === '::1';
  const isLinkLocal = host.startsWith('169.254.') || host.toLowerCase().startsWith('fe80:');
  if (isLoopback || isLinkLocal) return null;

  const bracketed = ipType === 6 ? `[${host}]` : host;
  return `http://${bracketed}${port}`;
}

// Promise pool minimalista
async function mapLimit(items, limit, worker) {
  const ret = [];
  let i = 0;
  let active = 0;
  return await new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve(ret);
      while (active < limit && i < items.length) {
        const idx = i++;
        active++;
        Promise.resolve(worker(items[idx], idx))
          .then((val) => { ret[idx] = val; })
          .catch((err) => { ret[idx] = { error: String(err?.message || err) }; })
          .finally(() => { active--; next(); });
      }
    };
    next();
  });
}

async function httpCheck(url) {
  if (!url) return 'unknown';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // tenta HEAD primeiro (mais leve); se 405/403, cai pra GET
    let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    if (!res.ok && res.status !== 405 && res.status !== 403) {
      // alguns devices só respondem ao GET /
      res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    }
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(t);
  }
}

const QuerySchema = z.object({
  save: z.enum(['0', '1']).optional(),
});

export async function GET(req) {
  const started = Date.now();
  if (!checkInternalAuth(req)) {
    logger.warn({}, '[dispositivos/ping] unauthorized');
    recordApiMetric('dispositivos_ping', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, '[dispositivos/ping] invalid query');
      recordApiMetric('dispositivos_ping', { durationMs: Date.now() - started, ok: false });
      return NextResponse.json({ ok: false, error: 'Invalid query' }, { status: 400 });
    }
    const saveFlag = parsed.data.save === '1';

    // busca tudo; alguns esquemas têm ip/enderecoIp — não arrisque SELECT parcial
    const dispositivos = await prisma.dispositivo.findMany();

    // checagem em paralelo com limite
    const resultados = await mapLimit(dispositivos, CONCURRENCY, async (d) => {
      const ipRaw =
        d?.ip ??
        d?.enderecoIp ??
        d?.ipAddress ??
        d?.host ??
        null;

      const url = normalizeUrl(ipRaw);
      const status = await httpCheck(url);

      if (saveFlag) {
        // atualiza "status" se existir a coluna — se não existir, isso vai falhar; tratamos silencioso
        try {
          await prisma.dispositivo.update({
            where: { id: d.id },
            data: { status },
          });
        } catch (e) {
          // coluna ausente ou constraint — apenas reporta
          return { ...d, status, _warn: 'status not persisted' };
        }
      }

      return { ...d, status };
    });

    recordApiMetric('dispositivos_ping', { durationMs: Date.now() - started, ok: true });
    return NextResponse.json(
      {
        ok: true,
        count: resultados.length,
        saved: saveFlag,
        devices: resultados,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    logger.error({ error: err?.message || err }, 'Erro ao pingar dispositivos');
    recordApiMetric('dispositivos_ping', { durationMs: Date.now() - started, ok: false });
    return NextResponse.json({ ok: false, error: 'Erro interno' }, { status: 500 });
  }
}
