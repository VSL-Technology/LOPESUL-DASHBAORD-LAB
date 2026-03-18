import crypto from 'crypto';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const RELAY_URL = process.env.RELAY_URL || process.env.RELAY_BASE || 'http://localhost:3000';
const RELAY_TOKEN = process.env.RELAY_TOKEN;
const RELAY_API_SECRET = process.env.RELAY_API_SECRET;

if (!RELAY_TOKEN || !RELAY_API_SECRET) {
  console.error('Missing RELAY_TOKEN or RELAY_API_SECRET in the environment.');
  process.exit(1);
}

const METHOD = 'POST';
const PATH = '/relay/exec';
const BODY = {
  host: process.env.MIKROTIK_HOST || '10.200.200.6',
  user: process.env.MIKROTIK_USER || 'relay-api',
  port: Number(process.env.MIKROTIK_PORT || 8728),
  sentences: ['/system/identity/print'],
};

const timestamp = String(Date.now());
const nonce = crypto.randomUUID().replace(/-/g, '');
const rawBody = JSON.stringify(BODY);
const base = `${METHOD}\n${PATH}\n${timestamp}\n${nonce}\n${rawBody}`;
const signature = crypto.createHmac('sha256', RELAY_API_SECRET).update(base).digest('hex');

async function run() {
  console.log(`Calling ${RELAY_URL}${PATH}`);
  console.log('Headers:');
  console.log({
    Authorization: `Bearer ${RELAY_TOKEN}`,
    'x-relay-ts': timestamp,
    'x-relay-nonce': nonce,
    'x-relay-signature': signature,
  });

  const response = await fetch(`${RELAY_URL}${PATH}`, {
    method: METHOD,
    headers: {
      Authorization: `Bearer ${RELAY_TOKEN}`,
      'Content-Type': 'application/json',
      'x-relay-ts': timestamp,
      'x-relay-nonce': nonce,
      'x-relay-signature': signature,
    },
    body: rawBody,
  });

  const text = await response.text();

  console.log('Status:', response.status);
  console.log('Response body:', text);

  if (response.ok) {
    const data = text ? JSON.parse(text) : null;
    console.log('Parsed JSON:', data);
  } else {
    console.error('Request failed');
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
