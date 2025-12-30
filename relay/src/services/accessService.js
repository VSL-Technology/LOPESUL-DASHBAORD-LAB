import { executeRouterCommands } from './mikrotikService.js';
import { logger } from '../utils/logger.js';
import { buildAuthorizeCommands } from './commandBuilder.js';
import { registerSession } from './sessionRegistry.js';

function sanitizeIp(ip) {
  if (!ip) return null;
  const value = String(ip).trim();
  if (!value) return null;
  const ipRegex =
    /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/; // aceita IPv4 ou IPv6 básica
  return ipRegex.test(value) ? value : null;
}

function sanitizeMac(mac) {
  if (!mac) return null;
  const value = String(mac).trim().toUpperCase();
  const macRegex = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;
  return macRegex.test(value) ? value : null;
}

function sanitizeComment(comment) {
  if (!comment) return 'relay';
  return String(comment).replace(/"/g, '').slice(0, 64);
}

function sanitizeUsername(username, fallback) {
  const source = username || fallback;
  if (!source) return null;
  return String(source)
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 32);
}

function ensureRouterPayload(router = {}) {
  const host = router.host?.trim();
  const user = router.user?.trim();
  const pass = router.pass?.trim();
  const port = router.port || 8728;

  if (!host || !user || !pass) {
    throw new Error('router_credentials_missing');
  }

  return { host, user, pass, port };
}

async function runCommands(router, commands) {
  if (!commands.length) {
    return { ok: true, results: [] };
  }

  const result = await executeRouterCommands({
    host: router.host,
    user: router.user,
    pass: router.pass,
    port: router.port,
    sentences: commands,
  });

  return {
    ok: result?.ok !== false,
    results: result?.results ?? result,
  };
}

export async function authorizeByPedido(payload = {}, options = {}) {
  try {
    const router = ensureRouterPayload(payload.router);
    const ip = sanitizeIp(payload.ipAtual);
    const mac = sanitizeMac(payload.macAtual);

    if (!ip && !mac) {
      return { ok: false, error: 'missing_ip_or_mac' };
    }

    const username = sanitizeUsername(
      payload.username,
      payload.token || payload.pedidoId
    );
    const comment = sanitizeComment(
      payload.comment ||
        `pedido:${(payload.pedidoId || '').slice(0, 8)} plano:${payload.plano || ''}`
    );

    const commands = buildAuthorizeCommands({
      ip,
      mac,
      username,
      comment,
      resync: options.resync === true,
    });

    const execResult = await runCommands(router, commands);
    const response = {
      ok: execResult.ok,
      routerHost: router.host,
      commandCount: commands.length,
      expiresAt: payload.expiresAt || null,
      token: payload.token || null,
      mikrotik: execResult.results,
    };

    if (execResult.ok) {
      registerSession({
        token: payload.token || null,
        ip,
        mac,
        username,
        expiresAt: payload.expiresAt,
        router,
      });
    }

    return response;
  } catch (error) {
    logger.error(
      { error: error?.message || error },
      '[relay] authorizeByPedido falhou'
    );
    return { ok: false, error: error?.message || 'access_error' };
  }
}

export async function resyncDevice(payload = {}) {
  return authorizeByPedido(payload, { resync: true });
}
