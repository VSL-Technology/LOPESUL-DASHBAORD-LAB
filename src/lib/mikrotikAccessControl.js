import { conectarMikrotik } from '@/lib/mikrotik';
import { logger } from '@/lib/logger';
import { normalizeIpAddress, normalizeMacAddress } from '@/lib/trial/validators';

async function withConnection(action) {
  const conn = await conectarMikrotik();
  try {
    return await action(conn);
  } finally {
    try {
      conn?.close?.();
    } catch (err) {
      logger.warn({ err }, '[mikrotikAccessControl] falha ao fechar conexão');
    }
  }
}

function buildFilter(ip, mac) {
  const filters = [];
  if (ip) filters.push(`address="${ip}"`);
  if (mac) filters.push(`mac-address="${mac}"`);
  return filters.join(' or ');
}

async function ensureListEntry(conn, ip, comment) {
  try {
    await conn.write('/ip/firewall/address-list/add', [
      'list=paid_clients',
      `address=${ip}`,
      `comment=${comment}`,
    ]);
  } catch (error) {
    logger.info({ ip, comment, error: error?.message || error }, '[mikrotikAccessControl] address-list add falhou');
  }
}

async function removeListEntry(conn, filter) {
  if (!filter) return;
  await conn.write('/ip/firewall/address-list/remove', [`=.id=[find list=paid_clients ${filter}]`]).catch((err) => {
    logger.info({ filter, err: err?.message || err }, '[mikrotikAccessControl] address-list remove falhou');
  });
}

async function removeBinding(conn, filter) {
  if (!filter) return;
  await conn.write('/ip/hotspot/ip-binding/remove', [`=.id=[find ${filter}]`]).catch((err) => {
    logger.info({ filter, err: err?.message || err }, '[mikrotikAccessControl] ip-binding remove falhou');
  });
}

async function killActiveSessions(conn, ip, mac) {
  const findParts = [];
  if (ip) findParts.push(`address="${ip}"`);
  if (mac) findParts.push(`mac-address="${mac}"`);
  if (!findParts.length) return;

  const findFilter = findParts.join(' or ');
  await conn.write('/ip/hotspot/active/remove', [`[find ${findFilter}]`]).catch((err) => {
    logger.info({ findFilter, err: err?.message || err }, '[mikrotikAccessControl] active remove falhou');
  });

  if (ip) {
    await conn.write('/ip/firewall/connection/remove', [`[find src-address~"${ip}" or dst-address~"${ip}"]`]).catch((err) => {
      logger.info({ ip, err: err?.message || err }, '[mikrotikAccessControl] connection remove falhou');
    });
  }
}

export async function liberarTrial({ ip, macAddress }) {
  const ipAddress = normalizeIpAddress(ip);
  if (!ipAddress) throw new Error('IP inválido para liberação de trial');
  const mac = normalizeMacAddress(macAddress);

  logger.info({ ip: ipAddress, mac }, '[mikrotikAccessControl] liberando trial');

  return withConnection(async (conn) => {
    const bindingArgs = [
      `=address=${ipAddress}`,
      '=type=bypassed',
      '=comment=TRIAL-LOPESUL',
    ];
    if (mac) bindingArgs.push(`=mac-address=${mac}`);
    await conn.write('/ip/hotspot/ip-binding/add', bindingArgs);
    await ensureListEntry(conn, ipAddress, 'TRIAL-LOPESUL');
    await killActiveSessions(conn, ipAddress, mac);
  });
}

export async function liberarPago({ ip, macAddress, planName }) {
  const ipAddress = normalizeIpAddress(ip);
  if (!ipAddress) throw new Error('IP inválido para liberação paga');
  const mac = normalizeMacAddress(macAddress);

  logger.info({ ip: ipAddress, mac, planName }, '[mikrotikAccessControl] liberando acesso pago');

  return withConnection(async (conn) => {
    const bindingArgs = [
      `=address=${ipAddress}`,
      '=type=bypassed',
      '=comment=PAGO-LOPESUL',
    ];
    if (mac) bindingArgs.push(`=mac-address=${mac}`);
    await conn.write('/ip/hotspot/ip-binding/add', bindingArgs);
    await ensureListEntry(conn, ipAddress, 'PAGO-LOPESUL');
    await killActiveSessions(conn, ipAddress, mac);
  });
}

export async function bloquearAcesso({ ip, macAddress, reason }) {
  const ipAddress = normalizeIpAddress(ip);
  const mac = normalizeMacAddress(macAddress);
  if (!ipAddress && !mac) {
    logger.warn({ ip, mac: macAddress }, '[mikrotikAccessControl] nada para bloquear');
    return;
  }

  const filter = buildFilter(ipAddress, mac);
  logger.info({ filter, reason }, '[mikrotikAccessControl] bloqueando acesso');

  return withConnection(async (conn) => {
    await removeBinding(conn, filter);
    await removeListEntry(conn, filter);
    await killActiveSessions(conn, ipAddress, mac);
  });
}

export async function garantirEstadoMikrotik({ status, ip, macAddress, planName }) {
  const normalizedStatus = String(status || '').toUpperCase();
  try {
    if (normalizedStatus === 'TRIAL') {
      await liberarTrial({ ip, macAddress });
      return;
    }

    if (normalizedStatus === 'PAID') {
      await liberarPago({ ip, macAddress, planName });
      return;
    }

    if (normalizedStatus === 'BLOCKED' || normalizedStatus === 'EXPIRED') {
      await bloquearAcesso({ ip, macAddress, reason: `status_${normalizedStatus.toLowerCase()}` });
      return;
    }

    logger.warn({ status }, '[mikrotikAccessControl] estado desconhecido');
  } catch (error) {
    logger.error({ error: error?.message || error, status }, '[mikrotikAccessControl] falha ao sincronizar estado');
    throw error;
  }
}
