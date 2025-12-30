// Execute comando no MikroTik: /file set hotspot-redirect.html name=hotspot/redirect.html

import MikroNode from 'mikronode-ng2';

const conn = new MikroNode.Connection({
  host: process.env.MIKROTIK_HOST,
  port: Number(process.env.MIKROTIK_PORT || 8728),
  user: process.env.MIKROTIK_USER,
  password: process.env.MIKROTIK_PASS,
  timeout: 10000,
});

if (!process.env.MIKROTIK_HOST || !process.env.MIKROTIK_USER || !process.env.MIKROTIK_PASS) {
  throw new Error('Defina MIKROTIK_HOST/USER/PASS no ambiente antes de rodar este script.');
}

console.log('🔧 Executando: /file set hotspot-redirect.html name=hotspot/redirect.html\n');

async function main() {
  try {
    await conn.connect();
    console.log('✅ Conectado ao MikroTik!\n');
    
    const chan = conn.openChannel();
  
  try {
    // Executar comando para renomear/mover arquivo
    console.log('📝 Movendo arquivo...');
    await chan.write('/file/set', [
      '=numbers=hotspot-redirect.html',
      '=name=hotspot/redirect.html'
    ]);
    
    console.log('✅ Arquivo movido com sucesso!\n');
    console.log('🎉 redirect.html agora está em hotspot/redirect.html');
    console.log('\n📋 Teste agora:');
    console.log('   1. Conecte celular no WiFi');
    console.log('   2. Acesse http://neverssl.com');
    console.log('   3. Deve redirecionar com ?mac= e &ip=\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('\nTentando método alternativo...\n');
    
    // Método alternativo: usar .id
    try {
      // Primeiro listar arquivos para pegar o .id
      const listResult = await chan.write('/file/print');
      console.log('Resultado do print:', listResult);
      
    } catch (err2) {
      console.error('❌ Erro no método alternativo:', err2.message);
    }
  }
  
  conn.close();
  } catch (err) {
    console.error('❌ Erro ao conectar:', err.message);
    conn.close();
    process.exit(1);
  }
}

main();
