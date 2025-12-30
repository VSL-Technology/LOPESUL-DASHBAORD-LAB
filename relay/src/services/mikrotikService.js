import { RouterOSClient } from 'node-routeros';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT = Number(process.env.MIKROTIK_TIMEOUT || 8000);

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
  const host = (body?.host || env.defaultHost || '').trim();
  const user = (body?.user || env.defaultUser || '').trim();
  const pass = (body?.pass || env.defaultPass || '').trim();
  const port = Number(body?.port || env.defaultPort || 8728);

  if (!host || !user || !pass) {
    throw new Error('missing_router_credentials');
  }

  return { host, user, pass, port };
}

export async function executeRouterCommands(body) {
  const sentences = normalizeSentences(body);
  if (!sentences.length) {
    throw new Error('missing_command');
  }

  const creds = resolveCredentials(body);
  const client = new RouterOSClient({
    host: creds.host,
    user: creds.user,
    password: creds.pass,
    port: creds.port,
    timeout: DEFAULT_TIMEOUT,
    keepalive: false,
  });

  const api = await client.connect();
  const results = [];
  try {
    for (const sentence of sentences) {
      logger.debug({ host: creds.host, sentence }, '[relay] executing sentence');
      const response = await api.write(sentence);
      results.push(response);
    }
    return { ok: true, results };
  } finally {
    try {
      await api.close();
    } catch (err) {
      logger.warn({ error: err?.message || err }, '[relay] failed to close RouterOS session');
    }
  }
}
