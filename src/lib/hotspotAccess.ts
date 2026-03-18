import { logger } from '@/lib/logger';
import { relaySignedCall } from '@/lib/relayClient';

type HotspotOptions = {
  host: string;
  user: string;
  pass: string;
  port?: number;
  ip: string;
  mac?: string;
  comment?: string;
  identity?: string;
};

function ensureRequired(field: string, value?: string) {
  if (!value || !value.trim()) {
    throw new Error(`hotspotAccess:${field}_required`);
  }
}

function buildSentence(command: string, params: Record<string, string>): (string | string[])[] {
  const sentence: (string | string[])[] = [command];
  for (const [key, value] of Object.entries(params)) {
    sentence.push(`=${key}=${value}`);
  }
  return sentence;
}

function buildRelayPayload(options: HotspotOptions, command: string, params: Record<string, string>) {
  const port = options.port ?? 8728;
  const sentence = buildSentence(command, params);
  return {
    host: options.host,
    user: options.user,
    pass: options.pass,
    port,
    command,
    params,
    sentences: [sentence],
  };
}

async function callRelay(payload: Record<string, any>) {
  return relaySignedCall('/relay/exec', {
    method: 'POST',
    body: payload,
  });
}

export async function authorizeHotspotAccess(options: HotspotOptions) {
  ensureRequired('host', options.host);
  ensureRequired('user', options.user);
  ensureRequired('pass', options.pass);
  ensureRequired('ip', options.ip);

  const command = '/ip/hotspot/ip-binding/add';
  const params: Record<string, string> = {
    address: options.ip,
    type: 'bypassed',
  };
  if (options.comment) {
    params.comment = options.comment;
  }
  if (options.mac) {
    params.comment = params.comment ? `${params.comment} (${options.mac})` : `mac:${options.mac}`;
  }

  logger.info({ host: options.host, ip: options.ip, mac: options.mac, command }, '[hotspotAccess] authorize.requested');

  try {
    const payload = buildRelayPayload(options, command, params);
    const response = await callRelay(payload);
    logger.info({ host: options.host, ip: options.ip, command }, '[hotspotAccess] authorize.success');
    return response;
  } catch (error: any) {
    logger.error({ host: options.host, ip: options.ip, err: error?.message || error }, '[hotspotAccess] authorize.error');
    throw error;
  }
}

export async function ensureHotspotAccessAuthorized(options: HotspotOptions) {
  const port = options.port ?? 8728;
  const printCommand = '/ip/hotspot/ip-binding/print';
  const filterParams: Record<string, string> = options.ip ? { address: options.ip } : {};
  const printPayload = {
    host: options.host,
    user: options.user,
    pass: options.pass,
    port,
    command: printCommand,
    params: filterParams,
    sentences: [buildSentence(printCommand, filterParams)],
  };

  const existing = await callRelay(printPayload);
  const entries = Array.isArray(existing?.results) ? existing.results : [];
  const already = entries.find((entry: any) => entry?.address === options.ip && entry?.type === 'bypassed');

  if (already) {
    logger.info({ host: options.host, ip: options.ip }, '[hotspotAccess] authorize.already');
    return { ok: true, alreadyAuthorized: true, entry: already };
  }

  return authorizeHotspotAccess(options);
}

export { buildSentence };
