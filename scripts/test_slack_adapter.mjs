import { sendSlack } from '../src/lib/alerts/adapters/slack.js';

(async ()=>{
  try {
    const ok = await sendSlack({
      rule: 'TEST_SLACK',
      severity: 'HIGH',
      summary: 'Test alert from local script',
      context: { mikrotikId: 'test-mik-1' },
      evidence: { count: 1, sampleEventIds: ['abc'] }
    });
    console.log('sendSlack returned', ok);
    process.exit(0);
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
