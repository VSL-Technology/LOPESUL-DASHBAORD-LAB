import express from 'express';
import { env } from '../config/env.js';

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lopesul-relay', timestamp: new Date().toISOString(), defaultHost: Boolean(env.defaultHost) });
});

export default router;
