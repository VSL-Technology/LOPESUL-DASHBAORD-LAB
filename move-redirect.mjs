#!/usr/bin/env node

import { conectarMikrotik } from './lib/mikrotik.js';

const MIKROTIK_HOST = process.env.MIKROTIK_HOST;
const MIKROTIK_PORT = Number(process.env.MIKROTIK_PORT || 8728);
const MIKROTIK_USER = process.env.MIKROTIK_USER;
const MIKROTIK_PASS = process.env.MIKROTIK_PASS;

if (!MIKROTIK_HOST || !MIKROTIK_USER || !MIKROTIK_PASS) {
  throw new Error('MIKROTIK_HOST/USER/PASS devem estar configurados no ambiente (.env)');
}

async function main() {
  let conn = null;
  try {
    console.log('📁 Movendo redirect.html para pasta hotspot\n');
    conn = await conectarMikrotik({
      host: MIKROTIK_HOST,
      user: MIKROTIK_USER,
      port: MIKROTIK_PORT,
      timeout: 5000,
    });

    console.log('1️⃣  Verificando arquivos...');
    const files = await conn.write('/file/print');
    const list = Array.isArray(files) ? files : [];

    const redirectFile = list.find((f) => f?.name === 'redirect.html');
    if (!redirectFile) {
      console.log('   ❌ Arquivo redirect.html não encontrado na raiz!');
      process.exitCode = 1;
      return;
    }

    console.log(`   ✅ Arquivo encontrado: ${redirectFile.name} (${redirectFile.size || 'N/A'} bytes)`);

    const fileId = redirectFile['.id'] || redirectFile.id;
    if (!fileId) {
      throw new Error('Não foi possível identificar o .id do arquivo redirect.html');
    }

    console.log('\n2️⃣  Movendo arquivo para hotspot/redirect.html...');
    await conn.write('/file/set', [
      `=.id=${fileId}`,
      '=name=hotspot/redirect.html',
    ]);
    console.log('   ✅ Arquivo movido com sucesso!');

    console.log('\n3️⃣  Verificando resultado...');
    const filesAfter = await conn.write('/file/print');
    const finalList = Array.isArray(filesAfter) ? filesAfter : [];
    const finalFile = finalList.find((f) =>
      typeof f?.name === 'string' && f.name.includes('hotspot') && f.name.includes('redirect')
    );

    if (finalFile) {
      console.log(`   ✅ Confirmado: ${finalFile.name}`);
    } else {
      console.log('   ⚠️  Arquivo não encontrado após mover');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('\n❌ Erro:', error?.message || error);
    process.exitCode = 1;
  } finally {
    try {
      if (conn) conn.close();
    } catch {}
    console.log('\n✅ Concluído!');
  }
}

await main();
