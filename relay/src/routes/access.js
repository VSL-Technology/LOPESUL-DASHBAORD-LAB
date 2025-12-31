import express from 'express';
import { authorizeByPedido, resyncDevice } from '../services/accessService.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limit básico por IP para evitar abuso (burst simples)
const limiter = rateLimit({
  windowMs: 60_000, // 60 seconds
  max: 60, // limit each IP to 60 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.use(limiter);

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
