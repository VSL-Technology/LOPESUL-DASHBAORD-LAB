import express from 'express';
import { authorizeByPedido, resyncDevice } from '../services/accessService.js';

const router = express.Router();

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
