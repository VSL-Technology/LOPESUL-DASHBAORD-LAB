import { RouterOSAPI } from 'routeros-api';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT = Number(process.env.MIKROTIK_TIMEOUT || process.env.MIKROTIK_TIMEOUT_MS || 8000);

function normalizeSentences({ command, sentences }) {
  const normalized = [];
  if (Array.isArray(sentences) && sentences.length) {
    sentences.forEach((sentence) => {
      if (!sentence) return;
      if (typeof sentence === 'string') {
        normalized.push(sentence.trim());
      } else if (Array.isArray(sentence) && sentence.length) {
        normalized.push(sentence.map((part) => String(part)));
      }
    });
  }
  if (!normalized.length && typeof command === 'string' && command.trim()) {
    normalized.push(command.trim());
  }
  return normalized;
}

function resolveCredentials(body) {
  const host = String(body?.host || env.defaultHost || '').trim();
  const user = String(body?.user || env.defaultUser || '').trim();
  const pass = String(env.defaultPass || '').trim();
  const port = Number(body?.port || env.defaultPort || 8728);

  if (!host || !user || !pass) {
    throw new Error('missing_router_credentials');
  }

  return { host, user, pass, port };
}

async function writeSentence(client, sentence) {
  if (typeof sentence === 'string') {
    return client.write(sentence);
  }

  const [command, ...args] = sentence;
  return client.write(command, args);
}

export async function executeRouterCommands(body) {
  const sentences = normalizeSentences(body);
  if (!sentences.length) {
    throw new Error('missing_command');
  }

  const creds = resolveCredentials(body);
  const client = new RouterOSAPI({
    host: creds.host,
    user: creds.user,
    password: creds.pass,
    port: creds.port,
    timeout: DEFAULT_TIMEOUT,
  });

  logger.info(
    { host: creds.host, port: creds.port },
    '[relay] conexão iniciada com MikroTik'
  );

  const results = [];
  try {
    await client.connect();
    logger.info(
      { host: creds.host, port: creds.port },
      '[relay] conexão sucesso com MikroTik'
    );

    for (const sentence of sentences) {
      logger.debug({ host: creds.host, sentence }, '[relay] executing sentence');
      const response = await writeSentence(client, sentence);
      results.push(response);
    }
    return { ok: true, results };
  } catch (error) {
    logger.error(
      {
        host: creds.host,
        port: creds.port,
        error: error?.message || error,
      },
      '[relay] erro ao executar no MikroTik'
    );
    throw error;
  } finally {
    try {
      client.close();
    } catch (err) {
      logger.warn({ error: err?.message || err }, '[relay] failed to close RouterOS session');
    }
  }
}
