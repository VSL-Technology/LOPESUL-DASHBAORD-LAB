import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { authInternal } from './middleware/authInternal.js';
import { rateLimit } from './middleware/rateLimit.js';
import healthRoutes from './routes/health.js';
import execRoutes from './routes/exec.js';
import accessRoutes from './routes/access.js';

const app = express();
app.disable('x-powered-by');

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, '[relay] incoming request');
  next();
});

app.use(healthRoutes);
app.use(authInternal);
app.use(execRoutes);
app.use(accessRoutes);

app.use((err, _req, res, _next) => {
  logger.error({ error: err?.message || err }, '[relay] unhandled error');
  res.status(500).json({ ok: false, error: 'internal_error' });
});

app.listen(env.port, () => {
  logger.info({ port: env.port }, '[relay] service running');
});
