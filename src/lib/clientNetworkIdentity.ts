import { isIP } from 'net';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

function coerceHeader(headers: HeaderBag, key: string): string | null {
  if (!headers) return null;
  const raw = headers[key] || headers[key.toLowerCase()];
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.split(',')[0].trim();
  if (!trimmed) return null;
  if (isIP(trimmed)) {
    return trimmed;
  }
  return null;
}

function normalizeMac(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  const match = cleaned.match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
  if (match) {
    return match[0];
  }
  return null;
}

function resolveFromHeaders(headers: HeaderBag, key: string) {
  const candidate = coerceHeader(headers, key);
  return normalizeIp(candidate);
}

export type ClientNetworkInput = {
  ip?: string;
  clientIp?: string;
  ipAddress?: string;
  mac?: string;
  clientMac?: string;
  query?: Record<string, any>;
  params?: Record<string, any>;
  headers?: HeaderBag;
};

export function resolveClientIp(input: ClientNetworkInput): string | null {
  const sources = [
    input.ip,
    input.clientIp,
    input.ipAddress,
    input.query?.ip,
    input.params?.ip,
    resolveFromHeaders(input.headers, 'x-forwarded-for'),
    resolveFromHeaders(input.headers, 'x-real-ip'),
  ];

  for (const candidate of sources) {
    const normalized = normalizeIp(typeof candidate === 'string' ? candidate : null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function resolveClientMac(input: ClientNetworkInput): string | null {
  const sources = [
    input.mac,
    input.clientMac,
    input.query?.mac,
    input.params?.mac,
  ];

  for (const candidate of sources) {
    const normalized = normalizeMac(typeof candidate === 'string' ? candidate : null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
