// src/lib/env.ts
import 'server-only';
import { z } from 'zod';

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['0', 'false', 'no', 'off']);

const booleanFromEnv = (defaultValue = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (TRUE.has(normalized)) return true;
      if (FALSE.has(normalized)) return false;
    }
    return value;
  }, z.boolean());

const numberFromEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, z.number().int().positive());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().trim().url().optional(),

  DATABASE_URL: z.string().trim().url(),

  PAGARME_SECRET_KEY: z.string().trim().min(1, 'PAGARME_SECRET_KEY é obrigatório'),
  PAGARME_WEBHOOK_SECRET: z.string().trim().optional(),
  PAGARME_BASE_URL: z.string().trim().url().default('https://api.pagar.me/core/v5'),

  RELAY_TOKEN: z.string().trim().min(10, 'RELAY_TOKEN é obrigatório'),
  RELAY_URL: z.string().trim().url().optional(),
  RELAY_BASE: z.string().trim().url().optional(),
  RELAY_HOTSPOT_SERVER: z.string().trim().default('hotspot1'),
  RELAY_PAID_LIST: z.string().trim().default('paid_clients'),
  RELAY_API_SECRET: z.string().trim().optional(),
  NEXT_PUBLIC_RELAY_URL: z.string().trim().url().optional(),
  NEXT_PUBLIC_RELAY_TOKEN: z.string().trim().optional(),

  MIKROTIK_HOST: z.string().trim().min(1, 'MIKROTIK_HOST é obrigatório'),
  MIKROTIK_USER: z.string().trim().min(1, 'MIKROTIK_USER é obrigatório'),
  MIKROTIK_PASS: z.string().trim().min(1, 'MIKROTIK_PASS é obrigatório'),
  MIKROTIK_PORT: numberFromEnv(8728),
  PORTA_MIKROTIK: z.coerce.number().int().positive().optional(),
  MIKROTIK_SSL: booleanFromEnv(false),
  MIKROTIK_TIMEOUT_MS: numberFromEnv(8000),
  MIKROTIK_TIMEOUT: z.coerce.number().int().positive().optional(),
  MIKROTIK_VIA_VPS: booleanFromEnv(false),

  STARLINK_HOST: z.string().trim().optional(),
  STARLINK_VIA_VPS: booleanFromEnv(false),
  STARLINK_PING_TARGET: z.string().trim().optional(),

  BACKEND_ALLOW_NETCHECK: booleanFromEnv(false),
  NETCHECK_PING: booleanFromEnv(true),

  SESSION_SECRET: z.string().trim().min(1, 'SESSION_SECRET é obrigatório'),
  INTERNAL_API_TOKEN: z.string().trim().min(1, 'INTERNAL_API_TOKEN é obrigatório'),
  INTERNAL_DEBUG_TOKEN: z.string().trim().optional(),

  LOG_LEVEL: z.string().trim().default('info'),
  APP_VERSION: z.string().trim().default('1.0.0'),

  PIX_EXPIRES_SEC: numberFromEnv(1800),

  ALERT_SLACK_WEBHOOK_URL: z.string().trim().url().optional(),

  WG_MANAGER_URL: z.string().trim().url().default('http://127.0.0.1:4001'),
  WG_MANAGER_TOKEN: z.string().trim().optional().default(''),
}).superRefine((val, ctx) => {
  if (!val.RELAY_URL && !val.RELAY_BASE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Defina RELAY_URL ou RELAY_BASE',
      path: ['RELAY_URL'],
    });
  }
});

const parsed = envSchema.safeParse({
  ...process.env,
  // aceita env legacy MIKOTIK_HOST (sem "r")
  MIKROTIK_HOST: process.env.MIKROTIK_HOST || process.env.MIKOTIK_HOST,
  MIKROTIK_TIMEOUT_MS: process.env.MIKROTIK_TIMEOUT_MS || process.env.MIKROTIK_TIMEOUT,
});

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n  - ');
  throw new Error(`Configuração de ambiente inválida:\n  - ${formatted}`);
}

const env = parsed.data;
const relayBase = (env.RELAY_URL || env.RELAY_BASE || '').replace(/\/+$/, '');
const relayPublic = env.NEXT_PUBLIC_RELAY_URL
  ? env.NEXT_PUBLIC_RELAY_URL.replace(/\/+$/, '')
  : null;

export const ENV = {
  NODE_ENV: env.NODE_ENV,
  APP_URL: env.APP_URL || null,
  DATABASE_URL: env.DATABASE_URL,

  PAGARME_SECRET_KEY: env.PAGARME_SECRET_KEY,
  PAGARME_WEBHOOK_SECRET: env.PAGARME_WEBHOOK_SECRET || null,
  PAGARME_BASE_URL: env.PAGARME_BASE_URL,

  RELAY_TOKEN: env.RELAY_TOKEN,
  RELAY_BASE: relayBase,
  RELAY_URL: relayBase,
  RELAY_HOTSPOT_SERVER: env.RELAY_HOTSPOT_SERVER,
  RELAY_PAID_LIST: env.RELAY_PAID_LIST,
  RELAY_API_SECRET: env.RELAY_API_SECRET || null,
  NEXT_PUBLIC_RELAY_URL: relayPublic,
  NEXT_PUBLIC_RELAY_TOKEN: env.NEXT_PUBLIC_RELAY_TOKEN || null,

  MIKROTIK_HOST: env.MIKROTIK_HOST,
  MIKROTIK_USER: env.MIKROTIK_USER,
  MIKROTIK_PASS: env.MIKROTIK_PASS,
  MIKROTIK_PORT: env.PORTA_MIKROTIK || env.MIKROTIK_PORT,
  MIKROTIK_SSL: env.MIKROTIK_SSL,
  MIKROTIK_TIMEOUT_MS: env.MIKROTIK_TIMEOUT_MS,
  MIKROTIK_VIA_VPS: env.MIKROTIK_VIA_VPS,

  STARLINK_HOST: env.STARLINK_HOST || null,
  STARLINK_VIA_VPS: env.STARLINK_VIA_VPS,
  STARLINK_PING_TARGET: env.STARLINK_PING_TARGET || null,

  BACKEND_ALLOW_NETCHECK: env.BACKEND_ALLOW_NETCHECK,
  NETCHECK_PING: env.NETCHECK_PING,

  SESSION_SECRET: env.SESSION_SECRET,
  INTERNAL_API_TOKEN: env.INTERNAL_API_TOKEN,
  INTERNAL_DEBUG_TOKEN: env.INTERNAL_DEBUG_TOKEN || null,

  LOG_LEVEL: env.LOG_LEVEL,
  APP_VERSION: env.APP_VERSION,
  PIX_EXPIRES_SEC: env.PIX_EXPIRES_SEC,

  ALERT_SLACK_WEBHOOK_URL: env.ALERT_SLACK_WEBHOOK_URL || null,

  WG_MANAGER_URL: env.WG_MANAGER_URL,
  WG_MANAGER_TOKEN: env.WG_MANAGER_TOKEN,
} as const;

export type Env = typeof ENV;

export const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'PAGARME_SECRET_KEY',
  'RELAY_TOKEN',
  'RELAY_URL|RELAY_BASE',
  'MIKROTIK_HOST',
  'MIKROTIK_USER',
  'MIKROTIK_PASS',
  'MIKROTIK_PORT',
  'SESSION_SECRET',
  'INTERNAL_API_TOKEN',
];
