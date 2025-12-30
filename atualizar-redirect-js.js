import MikroNode from 'mikronode-ng2';

const conn = new MikroNode.Connection({
  host: process.env.MIKROTIK_HOST,
  port: parseInt(process.env.MIKROTIK_PORT || '8728', 10),
  user: process.env.MIKROTIK_USER,
  password: process.env.MIKROTIK_PASS,
  timeout: 10000
});

if (!process.env.MIKROTIK_HOST || !process.env.MIKROTIK_USER || !process.env.MIKROTIK_PASS) {
  throw new Error('Defina MIKROTIK_HOST/USER/PASS no ambiente antes de executar');
}

async function main() {
  await conn.connect();
  const chan = conn.openChannel();
  
  console.log('🔄 Atualizando arquivos do hotspot...\n');
  
  try {
    await chan.write('/file/remove', ['=[find name="hotspot/redirect.html"]']);
    console.log('✅ redirect.html antigo removido');
  } catch {}
  
  try {
    await chan.write('/file/remove', ['=[find name="hotspot/login.html"]']);
    console.log('✅ login.html antigo removido');
  } catch {}
  
  await chan.write('/file/set', ['=numbers=redirect-new.html', '=name=hotspot/redirect.html']);
  console.log('✅ redirect.html criado com JavaScript!\n');
  
  // Copiar para login.html também
  await chan.write('/file/set', ['=numbers=hotspot/redirect.html', '=name=hotspot/login.html']);
  console.log('✅ login.html criado!\n');
  
  console.log('━'.repeat(60));
  console.log('✅ ARQUIVOS ATUALIZADOS COM JAVASCRIPT!');
  console.log('━'.repeat(60));
  console.log('Agora as variáveis MikroTik serão processadas corretamente.');
  console.log('\n🔄 Peça para o cliente testar novamente!');
  
  conn.close();
}

main().catch(e => { console.error(e); process.exit(1); });
