import express from 'express';
import { executeRouterCommands } from '../services/mikrotikService.js';

const router = express.Router();

async function handleExec(req, res, requireBodyHost = true) {
  try {
    if (requireBodyHost && !req.body?.host) {
      return res.status(400).json({ ok: false, error: 'host_required' });
    }

    const result = await executeRouterCommands(req.body || {});
    return res.json(result);
  } catch (error) {
    const message = error?.message || 'unknown_error';
    const status = message === 'missing_router_credentials' || message === 'missing_command' ? 400 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
}

router.post('/relay/exec', (req, res) => {
  return handleExec(req, res, true);
});

router.post('/relay/exec2', (req, res) => {
  return handleExec(req, res, false);
});

export default router;
