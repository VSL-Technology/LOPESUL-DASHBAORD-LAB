import MikroNode from 'mikronode-ng2';

const conn = new MikroNode.Connection({
  host: process.env.MIKROTIK_HOST,
  port: Number(process.env.MIKROTIK_PORT || 8728),
  user: process.env.MIKROTIK_USER,
  password: process.env.MIKROTIK_PASS,
  timeout: 10000
});

if (!process.env.MIKROTIK_HOST || !process.env.MIKROTIK_USER || !process.env.MIKROTIK_PASS) {
  throw new Error('Defina MIKROTIK_HOST/USER/PASS no ambiente antes de executar.');
}

async function main() {
  await conn.connect();
  const chan = conn.openChannel();
  await chan.write('/file/set', ['=numbers=hotspot-login.html', '=name=hotspot/login.html']);
  console.log('✅ login.html movido para hotspot/login.html');
  conn.close();
}

main().catch(e => { console.error(e); process.exit(1); });
