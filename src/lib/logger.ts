// lib/logger.ts
/**
 * Centralized structured logging using Pino
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

const SENSITIVE_KEYS = [
  'PAGARME_SECRET_KEY',
  'PAGARME_WEBHOOK_SECRET',
  'DATABASE_URL',
  'RELAY_TOKEN',
  'MIKROTIK_PASS',
  'INTERNAL_DEBUG_TOKEN',
];

function redactEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  const clone: Record<string, string | undefined> = {};
  const source = env || {};

  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (!value) return;
    clone[key] = SENSITIVE_KEYS.includes(key) ? '***REDACTED***' : value;
  });

  return clone;
}
// Create base logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  base: {
    service: 'lopesul-dashboard',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

function envSnapshot() {
  baseLogger.info({ env: redactEnv(process?.env) }, '[ENV SNAPSHOT SEGURO]');
}

export const logger = Object.assign(baseLogger, { envSnapshot });

// Child logger factory
export function createChildLogger(context: Record<string, any>) {
  return baseLogger.child(context);
}

// HTTP request logger
export function createRequestLogger(req: any) {
  return baseLogger.child({
    requestId: req.headers?.get?.('x-request-id') || crypto.randomUUID(),
    method: req.method,
    path: req.nextUrl?.pathname || req.url,
    ip: req.headers?.get?.('x-forwarded-for') || req.headers?.get?.('x-real-ip'),
  });
}

// Convenience loggers
export const log = {
  debug: (data: any, message: string) => logger.debug(data, message),
  info: (data: any, message: string) => logger.info(data, message),
  warn: (data: any, message: string) => logger.warn(data, message),
  error: (data: any, message: string) => logger.error(data, message),
};

export default logger;
