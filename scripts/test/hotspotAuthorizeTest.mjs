import dotenv from 'dotenv';
import { ensureHotspotAccessAuthorized } from '../../src/lib/hotspotAccess';

dotenv.config();

const HOST = process.env.MIKROTIK_HOST;
const USER = process.env.MIKROTIK_USER;
const PASS = process.env.MIKROTIK_PASS;
const PORT = Number(process.env.MIKROTIK_PORT || 8728);
const IP = process.env.HOTSPOT_TEST_IP;
const MAC = process.env.HOTSPOT_TEST_MAC;

if (!IP) {
  console.error('HOTSPOT_TEST_IP is required for the test script');
  process.exit(1);
}
if (!HOST || !USER || !PASS) {
  console.error('MIKROTIK_HOST, MIKROTIK_USER and MIKROTIK_PASS must be defined');
  process.exit(1);
}

(async () => {
  try {
    const result = await ensureHotspotAccessAuthorized({
      host: HOST,
      user: USER,
      pass: PASS,
      port: PORT,
      ip: IP,
      mac: MAC,
      comment: 'Test run via scripts/test/hotspotAuthorizeTest.mjs',
    });

    console.log('hotspot authorize result:', result);
  } catch (error) {
    console.error('hotspot authorize failed:', error?.message || error);
    process.exit(1);
  }
})();
