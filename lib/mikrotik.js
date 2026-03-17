import { RouterOSAPI } from 'routeros-api';

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveMikrotikConfig(options = {}) {
  const host = String(options.host || process.env.MIKROTIK_HOST || '').trim();
  const user = String(options.user || process.env.MIKROTIK_USER || '').trim();
  const password = String(process.env.MIKROTIK_PASS || '').trim();
  const port = toNumber(
    options.port ?? process.env.MIKROTIK_PORT ?? process.env.PORTA_MIKROTIK ?? 8728,
    8728
  );
  const timeout = toNumber(
    options.timeout ?? process.env.MIKROTIK_TIMEOUT_MS ?? process.env.MIKROTIK_TIMEOUT ?? 5000,
    5000
  );

  if (!host || !user || !password) {
    throw new Error('Faltam credenciais de MikroTik em process.env (MIKROTIK_HOST/MIKROTIK_USER/MIKROTIK_PASS).');
  }

  return { host, user, password, port, timeout };
}

export async function conectarMikrotik(options = {}) {
  const config = resolveMikrotikConfig(options);
  const conn = new RouterOSAPI({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    timeout: config.timeout,
  });

  console.log('[MIKROTIK] conexão iniciada', {
    host: config.host,
    port: config.port,
  });

  try {
    await conn.connect();
    console.log('[MIKROTIK] conexão sucesso', {
      host: config.host,
      port: config.port,
    });
    return conn;
  } catch (error) {
    console.error('[MIKROTIK] erro detalhado na conexão', {
      host: config.host,
      port: config.port,
      error: error?.message || error,
    });
    throw new Error('Falha na conexão com MikroTik');
  }
}

const mikrotikConnector = {
  conectarMikrotik,
  resolveMikrotikConfig,
};

export default mikrotikConnector;
