import 'server-only';
import crypto from 'crypto';

const HEADER_TS = 'x-relay-ts';
const HEADER_NONCE = 'x-relay-nonce';
const HEADER_SIGNATURE = 'x-relay-signature';

function canonicalPath(req: Request) {
  const url = new URL(req.url);
  return `${url.pathname}${url.search}`;
}

async function readBody(req: Request) {
  try {
    return (await req.text()) || '';
  } catch {
    return '';
  }
}

export async function verifyRelayRequest(req: Request): Promise<boolean> {
  const ts = req.headers.get(HEADER_TS);
  const nonce = req.headers.get(HEADER_NONCE);
  const signature = req.headers.get(HEADER_SIGNATURE);
  const secret = process.env.RELAY_API_SECRET;

  if (!ts || !nonce || !signature || !secret) {
    return false;
  }

  const method = (req.method || 'GET').toUpperCase();
  const path = canonicalPath(req);
  const body = await readBody(req);
  const base = `${method}\n${path}\n${ts}\n${nonce}\n${body}`;

  const expected = crypto.createHmac('sha256', secret).update(base).digest('hex');
  return expected === signature;
}
