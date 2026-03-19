import { relaySignedCall } from '@/lib/relayClient';

export async function relayServerRequest(path, opts = {}) {
  return relaySignedCall(path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: opts.headers,
  });
}
