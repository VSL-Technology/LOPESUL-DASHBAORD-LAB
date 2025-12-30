// src/app/api/detect-client/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOCAL_IP_REGEX =
  /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/;

const QuerySchema = z
  .object({
    preferSubnet: z.string().trim().optional(),
  })
  .passthrough();

function parseLocalIpCandidate(ip) {
  if (!ip) return null;
  const trimmed = String(ip).trim();
  return trimmed && LOCAL_IP_REGEX.test(trimmed) ? trimmed : null;
}

export async function GET(req) {
  const started = Date.now();
  try {
    const query = QuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
    if (!query.success) {
      logger.warn(
        { issues: query.error.issues },
        '[detect-client] Query inválida'
      );
      recordApiMetric('detect-client', {
        durationMs: Date.now() - started,
        ok: false,
      });
      return NextResponse.json(
        { error: 'Query inválida' },
        { status: 400 }
      );
    }

    const forwarded = req.headers.get('x-forwarded-for') || '';
    const realIp = req.headers.get('x-real-ip') || '';
    const cfConnectingIp = req.headers.get('cf-connecting-ip') || '';
    const remoteAddr =
      req.headers.get('x-remote-addr') ||
      req.headers.get('remote-addr') ||
      '';
    const mikrotikIp =
      req.headers.get('x-mikrotik-ip') ||
      req.headers.get('x-client-ip') ||
      req.headers.get('x-original-ip') ||
      '';

    let ip =
      parseLocalIpCandidate(mikrotikIp) ||
      parseLocalIpCandidate(realIp) ||
      parseLocalIpCandidate(cfConnectingIp) ||
      forwarded.split(',')[0]?.trim() ||
      remoteAddr ||
      'unknown';

    if (forwarded && !LOCAL_IP_REGEX.test(ip)) {
      const localIp = forwarded
        .split(',')
        .map((i) => i.trim())
        .map(parseLocalIpCandidate)
        .find(Boolean);
      if (localIp) {
        ip = localIp;
        logger.info({ ip }, '[detect-client] IP local encontrado via XFF');
      }
    }

    if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
      logger.info(
        {
          forwarded,
          realIp,
          cfConnectingIp,
          remoteAddr,
        },
        '[detect-client] Headers insuficientes para IP real'
      );
    }

    const isLocal = LOCAL_IP_REGEX.test(ip);
    let deviceId = null;
    let mikId = null;

    if (ip && ip !== 'unknown' && isLocal) {
      try {
        const device = await prisma.dispositivo.findFirst({
          where: { ip },
          select: { id: true, mikId: true },
        });
        if (device) {
          deviceId = device.id;
          mikId = device.mikId;
          logger.info(
            { ip, deviceId, mikId },
            '[detect-client] Dispositivo encontrado pelo IP'
          );
        }
      } catch (err) {
        logger.error(
          { error: err?.message },
          '[detect-client] Erro ao buscar dispositivo por IP'
        );
      }
    }

    if (!deviceId && !mikId && isLocal && ip && ip !== 'unknown') {
      try {
        const parts = ip.split('.');
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
          const allDevices = await prisma.dispositivo.findMany({
            select: { id: true, mikId: true, ip: true, mikrotikHost: true },
          });
          const devicesInSubnet = allDevices.filter((d) => {
            const deviceIp = String(d.ip || '').trim();
            const deviceHost = String(d.mikrotikHost || '').trim();
            return (
              deviceIp.startsWith(subnet) || deviceHost.startsWith(subnet)
            );
          });

          if (devicesInSubnet.length === 1) {
            deviceId = devicesInSubnet[0].id;
            mikId = devicesInSubnet[0].mikId;
            logger.info(
              { subnet, deviceId, mikId },
              '[detect-client] Dispositivo encontrado por subnet (único)'
            );
          } else if (devicesInSubnet.length > 1) {
            const preferByHost = devicesInSubnet.find((d) => {
              const host = String(d.mikrotikHost || '').trim();
              return host && host.startsWith(subnet);
            });
            const chosen = preferByHost || devicesInSubnet[0];
            deviceId = chosen.id;
            mikId = chosen.mikId;
            logger.info(
              { subnet, deviceId, mikId },
              '[detect-client] Dispositivo escolhido entre múltiplos'
            );
          }
        }
      } catch (err) {
        logger.error(
          { error: err?.message },
          '[detect-client] Erro ao buscar dispositivo por subnet'
        );
      }
    }

    const payload = {
      ip,
      isLocal,
      deviceId,
      mikId,
      deviceIdentifier: deviceId || mikId || null,
    };

    recordApiMetric('detect-client', {
      durationMs: Date.now() - started,
      ok: true,
    });
    return NextResponse.json(payload);
  } catch (err) {
    logger.error(
      { error: err?.message },
      '[detect-client] Erro inesperado'
    );
    recordApiMetric('detect-client', {
      durationMs: Date.now() - started,
      ok: false,
    });
    return NextResponse.json(
      { error: 'Erro ao detectar cliente' },
      { status: 500 }
    );
  }
}
