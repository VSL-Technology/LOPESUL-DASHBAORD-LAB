// Limpar TODAS as sessões ativas do hotspot para forçar novo redirect

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

console.log('🧹 LIMPANDO SESSÕES ATIVAS DO HOTSPOT\n');

async function main() {
  await conn.connect();
  console.log('✅ Conectado!\n');
  
  const chan = conn.openChannel();
  
  console.log('🔍 Verificando sessões ativas...\n');
  
  try {
    // Listar sessões ativas
    await chan.write('/ip/hotspot/active/print');
    console.log('📊 Sessões ativas encontradas\n');
  } catch (e) {
    console.log('ℹ️  Nenhuma sessão ativa ou erro:', e.message, '\n');
  }
  
  console.log('🗑️  Removendo TODAS as sessões ativas...\n');
  
  try {
    // Remover todas as sessões ativas
    await chan.write('/ip/hotspot/active/remove', ['=[find]']);
    console.log('✅ Todas as sessões foram removidas!\n');
  } catch (e) {
    console.log('⚠️  Erro ou nenhuma sessão para remover:', e.message, '\n');
  }
  
  console.log('━'.repeat(60));
  console.log('✅ SESSÕES LIMPAS!');
  console.log('━'.repeat(60));
  console.log('');
  console.log('Isso significa que:');
  console.log('1. TODOS os clientes conectados foram desautenticados');
  console.log('2. Qualquer cookie/sessão anterior foi invalidada');
  console.log('3. Próximo acesso HTTP será interceptado e redirecionado');
  console.log('');
  console.log('🔄 PEÇA PARA O CLIENTE:');
  console.log('   1. Fechar o navegador completamente');
  console.log('   2. Abrir novamente');
  console.log('   3. Tentar acessar qualquer site');
  console.log('   4. AGORA deve redirecionar COM ?mac= e &ip=');
  console.log('━'.repeat(60));
  
  conn.close();
}

main().catch(e => { console.error(e); process.exit(1); });
