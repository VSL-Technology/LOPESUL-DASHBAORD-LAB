// src/app/api/verificar-acesso-por-ip/route.js
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { recordApiMetric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOCAL_IP_REGEX =
  /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/;
const MAC_REGEX = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

const QuerySchema = z.object({
  ip: z.string().trim().optional(),
  mac: z.string().trim().optional(),
  pedidoCode: z.string().trim().optional(),
  deviceId: z.string().trim().optional(),
  mikId: z.string().trim().optional(),
});

function isLocalIp(ip) {
  return Boolean(ip && LOCAL_IP_REGEX.test(ip));
}

function normalizeIp(ip) {
  if (!ip) return null;
  const trimmed = String(ip).trim();
  if (!trimmed || trimmed === 'unknown' || trimmed === '127.0.0.1') {
    return null;
  }
  return trimmed;
}

function decodeParam(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeMac(value) {
  if (!value) return null;
  const decoded = decodeParam(value)
    .trim()
    .toUpperCase()
    .replace(/%3A/gi, ':')
    .replace(/-/g, ':');
  return MAC_REGEX.test(decoded) ? decoded : null;
}

function detectIpFromHeaders(req) {
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
    normalizeIp(mikrotikIp) ||
    normalizeIp(realIp) ||
    normalizeIp(cfConnectingIp) ||
    normalizeIp(forwarded.split(',')[0]) ||
    normalizeIp(remoteAddr);

  if (forwarded && (!ip || !isLocalIp(ip))) {
    const localIp = forwarded
      .split(',')
      .map((i) => i.trim())
      .find((candidate) => isLocalIp(candidate));
    if (localIp) {
      ip = localIp;
    }
  }

  if (!ip) {
    logger.info(
      {
        forwarded,
        realIp,
        cfConnectingIp,
        remoteAddr,
      },
      '[verificar-acesso-por-ip] Headers insuficientes para determinar IP'
    );
  }

  return ip;
}

function extractPedidoCodeFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/pedidoCode=([^;]+)/);
  return match ? decodeParam(match[1]) : null;
}

async function resolveRouterInfo(pedido) {
  try {
    const { requireDeviceRouter } = await import('@/lib/device-router');
    return await requireDeviceRouter({
      deviceId: pedido.deviceId,
      mikId: pedido.device?.mikId || pedido.deviceIdentifier,
    });
  } catch (err) {
    logger.warn(
      { pedidoId: pedido.id, error: err?.message },
      '[verificar-acesso-por-ip] Não foi possível localizar device-router'
    );
    return null;
  }
}

async function ensureSessaoAtiva({ pedido, ip, mac, routerInfo }) {
  try {
    const macFinal = mac || pedido.deviceMac || null;
    let roteadorId = null;
    if (routerInfo?.router?.host) {
      const roteador = await prisma.roteador.findFirst({
        where: {
          ipLan: routerInfo.router.host,
          usuario: routerInfo.router.user,
        },
      });
      roteadorId = roteador?.id || null;
    }

    const { calcularMinutosPlano } = await import('@/lib/plan-duration');
    const minutos = calcularMinutosPlano(
      pedido.description || pedido
    );
    const now = new Date();
    const expiraEm = new Date(now.getTime() + minutos * 60 * 1000);

    const existing = await prisma.sessaoAtiva.findFirst({
      where: { pedidoId: pedido.id, ativo: true },
    });

    if (existing) {
      await prisma.sessaoAtiva.update({
        where: { id: existing.id },
        data: {
          ipCliente: ip || existing.ipCliente,
          macCliente: macFinal || existing.macCliente,
          expiraEm,
          roteadorId: roteadorId || existing.roteadorId,
        },
      });
      logger.info(
        { sessaoId: existing.id },
        '[verificar-acesso-por-ip] Sessão ativa atualizada'
      );
    } else {
      const sessao = await prisma.sessaoAtiva.create({
        data: {
          ipCliente: ip || `sem-ip-${pedido.id}`.slice(0, 255),
          macCliente: macFinal || null,
          plano: pedido.description || 'Acesso',
          inicioEm: now,
          expiraEm,
          ativo: true,
          pedidoId: pedido.id,
          roteadorId,
        },
      });
      logger.info(
        { sessaoId: sessao.id },
        '[verificar-acesso-por-ip] Sessão ativa criada'
      );
    }
  } catch (err) {
    logger.error(
      { error: err?.message, pedidoId: pedido.id },
      '[verificar-acesso-por-ip] Erro ao sincronizar sessão ativa'
    );
  }
}

async function autoLiberarAcesso({ pedido, ip, mac }) {
  try {
    const routerInfo = await resolveRouterInfo(pedido);
    const { liberarAcesso } = await import('@/lib/mikrotik');

    await liberarAcesso({
      ip,
      mac: mac || pedido.deviceMac,
      orderId: pedido.code,
      pedidoId: pedido.id,
      deviceId: pedido.deviceId,
      mikId: routerInfo?.device?.mikId,
      comment: `auto-liberado:${pedido.code}`,
      router: routerInfo?.router,
    });

    await ensureSessaoAtiva({
      pedido,
      ip,
      mac: mac || pedido.deviceMac,
      routerInfo,
    });

    logger.info(
      { pedidoId: pedido.id, ip, mac: mac || pedido.deviceMac },
      '[verificar-acesso-por-ip] Acesso liberado automaticamente'
    );
  } catch (err) {
    logger.error(
      { error: err?.message, pedidoId: pedido.id },
      '[verificar-acesso-por-ip] Falha ao liberar acesso automaticamente'
    );
  }
}

export async function GET(req) {
  const started = Date.now();
  let ok = false;

  try {
    const queryResult = QuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
    if (!queryResult.success) {
      logger.warn(
        { issues: queryResult.error.issues },
        '[verificar-acesso-por-ip] Query inválida'
      );
      return NextResponse.json(
        { temAcesso: false, erro: 'Query inválida' },
        { status: 400 }
      );
    }

    const { ip: ipParam, mac: macParam, pedidoCode, deviceId, mikId } =
      queryResult.data;

    let ip = normalizeIp(ipParam) || detectIpFromHeaders(req);
    if (!ip || !isLocalIp(ip)) {
      logger.warn(
        { ip: ip || null },
        '[verificar-acesso-por-ip] IP não identificado'
      );
      return NextResponse.json({
        temAcesso: false,
        motivo: 'IP não identificado',
      });
    }

    const mac = normalizeMac(macParam);
    const cookieHeader = req.headers.get('cookie') || '';
    const pedidoCodeCookie = extractPedidoCodeFromCookie(cookieHeader);
    const finalPedidoCode = pedidoCode || pedidoCodeCookie || null;

    const tresHorasAtras = new Date(Date.now() - THREE_HOURS_MS);
    const whereClause = {
      status: 'PAID',
      createdAt: { gte: tresHorasAtras },
      OR: [{ ip }],
    };

    if (mac) {
      whereClause.OR.push({ deviceMac: mac });
    }
    if (finalPedidoCode) {
      whereClause.OR.push({ code: finalPedidoCode });
    }
    if (deviceId) {
      whereClause.OR.push({ deviceId });
    }
    if (mikId) {
      whereClause.OR.push({
        device: {
          mikId,
        },
      });
    }
    if (
      ip.startsWith('192.168.88.') &&
      !finalPedidoCode &&
      !deviceId &&
      !mikId
    ) {
      whereClause.OR.push({
        ip: {
          startsWith: '192.168.88.',
        },
      });
    }

    const pedidoPago = await prisma.pedido.findFirst({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        device: {
          select: {
            id: true,
            mikId: true,
            mikrotikHost: true,
          },
        },
        SessaoAtiva: {
          where: {
            ativo: true,
            expiraEm: {
              gte: new Date(),
            },
          },
          take: 1,
        },
      },
    });

    if (pedidoPago) {
      logger.info(
        { pedidoId: pedidoPago.id, ip, mac },
        '[verificar-acesso-por-ip] Pedido pago encontrado'
      );

      const sessaoAtivaPorIp = await prisma.sessaoAtiva.findFirst({
        where: {
          ipCliente: ip,
          ativo: true,
          expiraEm: {
            gte: new Date(),
          },
        },
      });

      const ipMudou =
        pedidoPago.ip && pedidoPago.ip !== ip;
      const macMudou =
        pedidoPago.deviceMac &&
        mac &&
        pedidoPago.deviceMac.toUpperCase() !== mac.toUpperCase();
      const pedidoSemIpMac = !pedidoPago.ip && !pedidoPago.deviceMac;

      if (!sessaoAtivaPorIp && (ipMudou || macMudou || pedidoSemIpMac)) {
        await autoLiberarAcesso({ pedido: pedidoPago, ip, mac });
      } else if (sessaoAtivaPorIp) {
        logger.info(
          { ip, sessaoId: sessaoAtivaPorIp.id },
          '[verificar-acesso-por-ip] Sessão ativa já existe para IP'
        );
      }

      const sessaoAtiva = pedidoPago.SessaoAtiva[0];
      ok = true;
      return NextResponse.json({
        temAcesso: true,
        pedidoId: pedidoPago.id,
        pedidoCode: pedidoPago.code,
        createdAt: pedidoPago.createdAt,
        temSessaoAtiva: Boolean(sessaoAtiva),
        sessaoId: sessaoAtiva?.id || null,
        expiraEm: sessaoAtiva?.expiraEm || null,
        liberadoAutomaticamente: Boolean(ipMudou || macMudou),
      });
    }

    const sessaoWhere = {
      ativo: true,
      expiraEm: { gte: new Date() },
      OR: [{ ipCliente: ip }],
    };
    if (mac) {
      sessaoWhere.OR.push({ macCliente: mac });
    }
    if (finalPedidoCode) {
      const pedidoPorCode = await prisma.pedido.findFirst({
        where: { code: finalPedidoCode },
        select: { id: true },
      });
      if (pedidoPorCode) {
        sessaoWhere.OR.push({ pedidoId: pedidoPorCode.id });
      }
    }

    const sessaoAtiva = await prisma.sessaoAtiva.findFirst({
      where: sessaoWhere,
      orderBy: { expiraEm: 'desc' },
    });

    if (sessaoAtiva) {
      logger.info(
        { sessaoId: sessaoAtiva.id },
        '[verificar-acesso-por-ip] Sessão ativa encontrada (fallback)'
      );
      ok = true;
      return NextResponse.json({
        temAcesso: true,
        temSessaoAtiva: true,
        sessaoId: sessaoAtiva.id,
        expiraEm: sessaoAtiva.expiraEm,
        pedidoId: sessaoAtiva.pedidoId,
      });
    }

    logger.info({ ip }, '[verificar-acesso-por-ip] Nenhum acesso encontrado');
    ok = true;
    return NextResponse.json({
      temAcesso: false,
      motivo: 'Nenhum pedido pago recente ou sessão ativa encontrada',
    });
  } catch (err) {
    logger.error(
      { error: err?.message },
      '[verificar-acesso-por-ip] Erro inesperado'
    );
    return NextResponse.json(
      { temAcesso: false, erro: 'Erro interno' },
      { status: 500 }
    );
  } finally {
    recordApiMetric('verificar-acesso-por-ip', {
      durationMs: Date.now() - started,
      ok,
    });
  }
}
