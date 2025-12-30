import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[relay] Missing required env var: ${name}`);
  }
  return value.trim();
}

export const env = {
  port: Number(process.env.PORT || 4000),
  relayToken: requireEnv('RELAY_TOKEN'),
  defaultHost: process.env.MIKROTIK_HOST?.trim() || null,
  defaultUser: process.env.MIKROTIK_USER?.trim() || null,
  defaultPass: process.env.MIKROTIK_PASS?.trim() || null,
  defaultPort: Number(process.env.MIKROTIK_PORT || 8728),
  logLevel: process.env.LOG_LEVEL?.trim() || 'info',
};
