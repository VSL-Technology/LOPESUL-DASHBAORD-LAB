import { getPlanDurationMinutes } from '../../src/lib/trial/planDuration.js';
import { normalizeIpAddress, normalizeMacAddress } from '../../src/lib/trial/validators.js';

const planTests = [
  { input: '2h', expected: 120 },
  { input: '4h', expected: 240 },
  { input: 'Plano 2h', expected: 120 },
  { input: 'R$10,00 - 2h', expected: 120 },
  { input: '2 horas', expected: 120 },
  { input: 'desconhecido', expected: null },
];

const macTests = [
  { value: 'aa:bb:cc:dd:ee:ff', ok: true },
  { value: 'AA-BB-CC-DD-EE-FF', ok: true },
  { value: 'invalid', ok: false },
];

const ipTests = [
  { value: '192.168.0.10', ok: true },
  { value: '999.999.999.999', ok: false },
];

let failures = 0;

for (const test of planTests) {
  const result = getPlanDurationMinutes(test.input);
  if (result !== test.expected) {
    console.error('[planDuration] falha', test);
    failures += 1;
  }
}

for (const test of macTests) {
  const valid = Boolean(normalizeMacAddress(test.value));
  if (valid !== test.ok) {
    console.error('[validators] mac inválido', test);
    failures += 1;
  }
}

for (const test of ipTests) {
  const valid = Boolean(normalizeIpAddress(test.value));
  if (valid !== test.ok) {
    console.error('[validators] ip inválido', test);
    failures += 1;
  }
}

if (failures === 0) {
  console.log('trial-engine smoke tests OK');
} else {
  console.error(`${failures} falhas detectadas`);
  process.exit(1);
}
