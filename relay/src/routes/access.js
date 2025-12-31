import express from 'express';
import { authorizeByPedido, resyncDevice } from '../services/accessService.js';

const router = express.Router();

// Rate limit básico por IP para evitar abuso (burst simples)
const recentHits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 60;

function rateLimit(req, res, next) {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const bucket = recentHits.get(key) || [];
  const filtered = bucket.filter((ts) => now - ts < WINDOW_MS);
  filtered.push(now);
  recentHits.set(key, filtered);
  if (filtered.length > MAX_HITS) {
    return res.status(429).json({ ok: false, code: 'rate_limited' });
  }
  return next();
}

router.use(rateLimit);

router.post('/relay/authorize-by-pedido', async (req, res) => {
  const result = await authorizeByPedido(req.body || {});
  const status = result.ok ? 200 : 400;
  return res.status(status).json(result);
});

router.post('/relay/resync-device', async (req, res) => {
  const result = await resyncDevice(req.body || {});
  const status = result.ok ? 200 : 400;
  return res.status(status).json(result);
});

export default router;
