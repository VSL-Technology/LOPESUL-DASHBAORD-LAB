// src/lib/env.js

const requiredVars = [
  'DATABASE_URL',
  'PAGARME_SECRET_KEY',
  'RELAY_TOKEN',
  'RELAY_BASE',
  'MIKROTIK_HOST',
  'MIKROTIK_USER',
  'MIKROTIK_PASS',
  'MIKROTIK_PORT',
  'SESSION_SECRET',
  'INTERNAL_API_TOKEN',
];

const skipEnvValidation =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.SKIP_ENV_VALIDATION === '1';

function getEnvVar(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    if (skipEnvValidation) return '';
    throw new Error(`[ENV] Variável obrigatória ausente: ${name}`);
  }
  return String(value).trim();
}

function getOptionalEnvVar(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    return null;
  }
  return String(value).trim();
}

export const ENV = {
  DATABASE_URL: getEnvVar('DATABASE_URL'),
  PAGARME_SECRET_KEY: getEnvVar('PAGARME_SECRET_KEY'),
  PAGARME_WEBHOOK_SECRET: getOptionalEnvVar('PAGARME_WEBHOOK_SECRET'),
  RELAY_TOKEN: getEnvVar('RELAY_TOKEN'),
  RELAY_BASE: getEnvVar('RELAY_BASE'),
  MIKROTIK_HOST: getEnvVar('MIKROTIK_HOST'),
  MIKROTIK_USER: getEnvVar('MIKROTIK_USER'),
  MIKROTIK_PASS: getEnvVar('MIKROTIK_PASS'),
  MIKROTIK_PORT: getEnvVar('MIKROTIK_PORT'),
  SESSION_SECRET: getEnvVar('SESSION_SECRET'),
  INTERNAL_API_TOKEN: getEnvVar('INTERNAL_API_TOKEN'),
  INTERNAL_DEBUG_TOKEN: getOptionalEnvVar('INTERNAL_DEBUG_TOKEN'),
  APP_URL: getOptionalEnvVar('APP_URL'),
  NODE_ENV: getOptionalEnvVar('NODE_ENV') || 'development',
};

export const REQUIRED_ENV_VARS = [...requiredVars];
