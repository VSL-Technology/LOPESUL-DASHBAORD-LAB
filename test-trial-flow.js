const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const MAC = 'AA:BB:CC:DD:EE:99';
const IP = '192.168.88.50';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkin() {
  const res = await fetch(`${BASE_URL}/api/trial/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ macAddress: MAC, ip: IP }),
  });
  return res.json();
}

async function state() {
  const res = await fetch(`${BASE_URL}/api/trial/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ macAddress: MAC, ip: IP }),
  });
  return res.json();
}

async function run() {
  console.log('🔥 TESTE INICIADO');

  console.log('\n1️⃣ PRIMEIRO CHECKIN (esperado: TRIAL)');
  let res = await checkin();
  console.log(res);

  console.log('\n⏳ Esperando 6 minutos (simular expiração)');
  await sleep(6 * 60 * 1000);

  console.log('\n2️⃣ STATE APÓS EXPIRAÇÃO (esperado: BLOCKED)');
  res = await state();
  console.log(res);

  console.log('\n3️⃣ NOVO CHECKIN (esperado: BLOCKED)');
  res = await checkin();
  console.log(res);

  console.log('\n4️⃣ SIMULANDO PAGAMENTO (PAID)');
  await fetch(`${BASE_URL}/api/dev/force-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      macAddress: MAC,
      ip: IP,
      plan: '2h',
    }),
  });

  console.log('\n5️⃣ STATE APÓS PAGAMENTO (esperado: PAID)');
  res = await state();
  console.log(res);

  console.log('\n⏳ Esperando expiração do plano...');
  await sleep(2 * 60 * 1000);

  console.log('\n6️⃣ STATE FINAL (esperado: BLOCKED)');
  res = await state();
  console.log(res);
}

run();
