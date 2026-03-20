#!/usr/bin/env node

import { execFile } from 'child_process';
import { unlinkSync, writeFileSync } from 'fs';
import { conectarMikrotik } from './lib/mikrotik.js';

const MIKROTIK_HOST = process.env.MIKROTIK_HOST;
const MIKROTIK_PORT = Number(process.env.MIKROTIK_PORT || 8728);
const MIKROTIK_USER = process.env.MIKROTIK_USER;
const MIKROTIK_PASS = process.env.MIKROTIK_PASS;

if (!MIKROTIK_HOST || !MIKROTIK_USER || !MIKROTIK_PASS) {
  throw new Error('MIKROTIK_HOST/USER/PASS devem estar configurados no ambiente (.env)');
}

const content = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=https://cativo.lopesuldashboardwifi.com/pagamento.html?mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)">
<title>Redirecionando...</title>
</head>
<body>
<h2>Aguarde, redirecionando para o portal de pagamento...</h2>
</body>
</html>`;

function runCurlUpload(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      [
        '--fail',
        '-sS',
        '-T',
        filePath,
        `ftp://${MIKROTIK_HOST}/hotspot/redirect.html`,
        '--user',
        `${MIKROTIK_USER}:${MIKROTIK_PASS}`,
      ],
      (error, stdout, stderr) => {
        if (error) {
          return reject(
            new Error(stderr?.trim() || stdout?.trim() || error.message || 'Erro no upload FTP')
          );
        }
        resolve(stdout);
      }
    );
  });
}

async function main() {
  const tempFile = '/tmp/redirect.html';
  let conn = null;

  try {
    console.log('📤 Fazendo upload do redirect.html para o MikroTik\n');
    conn = await conectarMikrotik({
      host: MIKROTIK_HOST,
      user: MIKROTIK_USER,
      port: MIKROTIK_PORT,
      timeout: 5000,
    });
    conn.close();
    conn = null;

    writeFileSync(tempFile, content, 'utf8');
    await runCurlUpload(tempFile);
    console.log('✅ Upload realizado com sucesso via FTP!');
  } catch (error) {
    console.error('❌ Falha no upload:', error?.message || error);
    console.log('\n📋 Faça o upload manual:');
    console.log(`1. Conecte via FTP em ${MIKROTIK_HOST}`);
    console.log('2. Entre na pasta hotspot');
    console.log('3. Envie o arquivo redirect.html');
    process.exitCode = 1;
  } finally {
    try {
      if (conn) conn.close();
    } catch {}
    try {
      unlinkSync(tempFile);
    } catch {}
  }
}

await main();
