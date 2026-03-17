// src/lib/mikrotik.js
import { relayFetchSigned } from './relayFetchSigned';
import {
  conectarMikrotik as conectarMikrotikBase,
  resolveMikrotikConfig,
} from '../../lib/mikrotik.js';

function resolveRouterConfig(router = {}) {
  const options = {
    host: router.host || process.env.MIKROTIK_HOST,
    user: router.user || process.env.MIKROTIK_USER,
    port:
      router.port ??
      process.env.MIKROTIK_PORT ??
      process.env.PORTA_MIKROTIK ??
      8728,
    timeout:
      router.timeout ??
      process.env.MIKROTIK_TIMEOUT_MS ??
      process.env.MIKROTIK_TIMEOUT ??
      5000,
  };

  return resolveMikrotikConfig(options);
}

function closeConnection(conn) {
  try {
    conn?.close?.();
  } catch (err) {
    console.warn('[MIKROTIK] erro ao fechar conexão:', err?.message || err);
  }
}

async function executeDirectCommands({ router, sentences, label }) {
  const conn = await conectarMikrotik(router);
  try {
    for (const sentence of sentences) {
      console.log(`[MIKROTIK] Executando (${label}):`, sentence);
      await conn.write(sentence);
    }
  } finally {
    closeConnection(conn);
  }
}

export async function conectarMikrotik(router = {}) {
  const cfg = resolveRouterConfig(router);
  return conectarMikrotikBase(cfg);
}

/** ============================
 * PING TESTE (usa API, não SSH)
 * ============================ */
export async function getStarlinkStatus(router) {
  const conn = await conectarMikrotik(router);
  try {
    const pingTarget = process.env.STARLINK_PING_TARGET || '1.1.1.1';
    const rows = await conn.write(`/ping address=${pingTarget} count=3`);
    const list = Array.isArray(rows) ? rows : [];
    const rowWithTime = list.find((item) => item && typeof item === 'object' && item.time);
    const raw = rowWithTime?.time ? String(rowWithTime.time).replace(/ms$/i, '') : '';
    const parsed = Number(raw);
    const rtt = Number.isFinite(parsed) ? parsed : null;

    return { ok: true, connected: true, rtt_ms: rtt };
  } catch (err) {
    console.error('[MIKROTIK] API ping error:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    closeConnection(conn);
  }
}

/** ============================
 * LISTA SESSÕES PPP
 * ============================ */
export async function listPppActive(router) {
  const conn = await conectarMikrotik(router);
  try {
    const data = await conn.write('/ppp/active/print detail');
    return { ok: true, data };
  } catch (err) {
    console.error('[MIKROTIK] API list error:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    closeConnection(conn);
  }
}

/** ============================
 * LIBERAR ACESSO (preset completo: paid_clients + bypass + matar sessão)
 * ============================ */
export async function liberarAcesso({
  ip,
  mac,
  orderId,
  comment,
  router,
  pedidoId,
  deviceId,
  mikId,
} = {}) {
  if (!ip || ip === '0.0.0.0') {
    throw new Error(`[MIKROTIK] IP inválido para liberação: ${ip}`);
  }
  if (!mac) {
    throw new Error('[MIKROTIK] MAC inválido para liberação');
  }

  const finalComment = comment || `paid:${orderId || pedidoId || 'sem-order'}`;

  const sentences = [
    `/ip/firewall/address-list/add list=paid_clients address=${ip} comment="${finalComment}"`,
    `/ip/hotspot/ip-binding/add address=${ip} mac-address=${mac} server=hotspot1 type=bypassed comment="${finalComment}"`,
    `/ip/hotspot/host/remove [find mac-address="${mac}"]`,
    `/ip/hotspot/active/remove [find address="${ip}" or mac-address="${mac}"]`,
    `/ip/firewall/connection/remove [find src-address~"${ip}" or dst-address~"${ip}"]`,
  ];

  // ===== MODO INTELIGENTE (prioridade) =====
  if (pedidoId || deviceId || mikId) {
    try {
      const endpoint = pedidoId ? '/relay/exec-by-pedido' : '/relay/exec-by-device';
      const body = pedidoId
        ? { pedidoId, command: '' }
        : { deviceId, mikId, command: '' };

      console.log('[MIKROTIK] Tentando modo inteligente:', endpoint, {
        pedidoId,
        deviceId,
        mikId,
      });

      let shouldFallback = false;

      for (const cmd of sentences) {
        try {
          const response = await relayFetchSigned({
            method: 'POST',
            originalUrl: endpoint,
            body: { ...body, command: cmd },
          }).catch((err) => ({
            ok: false,
            status: err?.status || 0,
            data: err?.data || { error: err?.message || 'relay_error' },
          }));

          const result = response?.data || {};
          if (!response?.ok || !result.ok) {
            if (result.error === 'database_not_available') {
              console.log('[MIKROTIK] Relay sem DB, usando modo direto');
              shouldFallback = true;
              break;
            }
            console.warn('[MIKROTIK] Comando falhou via relay inteligente:', cmd, result.error);
          } else {
            console.log('[MIKROTIK] Comando executado via relay inteligente:', cmd);
          }
        } catch (cmdErr) {
          if (cmdErr?.message?.includes('RELAY') || cmdErr?.message?.includes('fetch')) {
            console.log('[MIKROTIK] Relay indisponível, usando modo direto');
            shouldFallback = true;
            break;
          }
          console.error('[MIKROTIK] Erro ao executar comando via relay inteligente:', cmd, cmdErr?.message || cmdErr);
        }
      }

      if (!shouldFallback) {
        console.log(
          '[MIKROTIK] Acesso liberado com sucesso via relay inteligente para',
          ip,
          mac,
          finalComment
        );
        return { ok: true, cmds: sentences, via: 'relay_inteligente' };
      }
    } catch (err) {
      console.warn('[MIKROTIK] Modo inteligente falhou, tentando modo direto:', err?.message || err);
    }
  }

  // ===== MODO DIRETO (compatibilidade) =====
  if (router && router.host) {
    try {
      const cfg = resolveRouterConfig(router);
      console.log('[MIKROTIK] Usando relay direto para liberar acesso:', ip, mac);

      for (const cmd of sentences) {
        console.log('[MIKROTIK] Executando via relay direto:', cmd);
        try {
          const response = await relayFetchSigned({
            method: 'POST',
            originalUrl: '/relay/exec',
            body: {
              host: cfg.host,
              user: cfg.user,
              pass: process.env.MIKROTIK_PASS,
              port: cfg.port,
              command: cmd,
            },
          }).catch((err) => ({
            ok: false,
            status: err?.status || 0,
            data: err?.data || { error: err?.message || 'relay_error' },
          }));

          const result = response?.data || {};
          if (!response?.ok || !result.ok) {
            console.warn('[MIKROTIK] Comando falhou via relay direto:', cmd, result.error);
          }
        } catch (cmdErr) {
          console.error('[MIKROTIK] Erro ao executar comando via relay direto:', cmd, cmdErr?.message || cmdErr);
        }
      }

      console.log('[MIKROTIK] Acesso liberado com sucesso via relay direto para', ip, mac, finalComment);
      return { ok: true, cmds: sentences, via: 'relay_direto' };
    } catch (err) {
      console.error('[MIKROTIK] Erro ao usar relay direto, tentando API direta:', err?.message || err);
    }
  }

  // Fallback: API direta (routeros-api)
  try {
    await executeDirectCommands({
      router,
      sentences,
      label: 'API direta',
    });

    console.log('[MIKROTIK] Acesso liberado com sucesso (API direta) para', ip, mac, finalComment);
    return { ok: true, cmds: sentences, via: 'api_direta_routeros_api' };
  } catch (err) {
    console.error('[MIKROTIK] liberarAcesso API error:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/** ============================
 * REVOGAR ACESSO
 * ============================ */
export async function revogarAcesso({ ip, mac, username, router } = {}) {
  const cmds = [];
  if (ip) cmds.push(`/ip/firewall/address-list/remove [find address=${ip}]`);
  if (mac) cmds.push(`/interface/wireless/access-list/remove [find mac-address=${mac}]`);
  if (username) cmds.push(`/ip/hotspot/user/remove [find name=${username}]`);

  if (!cmds.length) {
    return { ok: true, cmds: [] };
  }

  try {
    await executeDirectCommands({
      router,
      sentences: cmds,
      label: 'revogar',
    });
    return { ok: true, cmds };
  } catch (err) {
    console.error('[MIKROTIK] revogarAcesso API error:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export const revogarCliente = revogarAcesso;

export default {
  conectarMikrotik,
  getStarlinkStatus,
  listPppActive,
  liberarAcesso,
  revogarAcesso,
  revogarCliente,
};
