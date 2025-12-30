import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function authInternal(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = bearer || req.headers['x-relay-token'] || req.headers['x-internal-token'];

  if (!token || token !== env.relayToken) {
    logger.warn({ ip: req.ip, path: req.path }, '[relay] unauthorized request');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  return next();
}
