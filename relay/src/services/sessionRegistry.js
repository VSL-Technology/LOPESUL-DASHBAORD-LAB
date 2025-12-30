import { executeRouterCommands } from './mikrotikService.js';
import { buildRemovalCommands } from './commandBuilder.js';
import { logger } from '../utils/logger.js';

const sessions = new Map();

function getKey(entry) {
  return entry.token || `${entry.ip || 'noip'}-${entry.mac || 'nomac'}`;
}

async function revokeEntry(key) {
  const entry = sessions.get(key);
  if (!entry) return;
  sessions.delete(key);

  try {
    const sentences = buildRemovalCommands({
      ip: entry.ip,
      mac: entry.mac,
      username: entry.username,
    });

    if (!sentences.length) return;

    await executeRouterCommands({
      host: entry.router.host,
      user: entry.router.user,
      pass: entry.router.pass,
      port: entry.router.port,
      sentences,
    });
    logger.info(
      { key, ip: entry.ip, mac: entry.mac },
      '[relay] sessão expirada revogada automaticamente'
    );
  } catch (error) {
    logger.error(
      { key, error: error?.message || error },
      '[relay] falha ao revogar sessão expirada'
    );
  }
}

export function registerSession(entry = {}) {
  const key = getKey(entry);
  if (!key) return;

  if (sessions.has(key)) {
    clearTimeout(sessions.get(key).timer);
  }

  const expiresAt = entry.expiresAt ? new Date(entry.expiresAt) : null;
  const fallback = new Date(Date.now() + 5 * 60 * 1000);
  const finalExpires = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : fallback;

  const delay = Math.max(finalExpires.getTime() - Date.now(), 0);
  const timer = setTimeout(() => revokeEntry(key), delay);

  sessions.set(key, {
    token: entry.token || null,
    ip: entry.ip || null,
    mac: entry.mac || null,
    username: entry.username || null,
    router: entry.router,
    expiresAt: finalExpires,
    timer,
  });

  logger.info(
    { key, expiresAt: finalExpires.toISOString(), ip: entry.ip, mac: entry.mac },
    '[relay] sessão registrada para auto-revogação'
  );
}

export function unregisterSessionByToken(token) {
  if (!token) return;
  for (const [key, value] of sessions.entries()) {
    if (value.token === token) {
      clearTimeout(value.timer);
      sessions.delete(key);
      return;
    }
  }
}
