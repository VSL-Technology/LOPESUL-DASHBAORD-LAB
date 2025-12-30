// scripts/seed-lab.js

// 1) Carrega variáveis do .env (DATABASE_URL)
try {
  // Se não tiver `dotenv` instalado, roda: npm install dotenv --save-dev
  require('dotenv').config();
  console.log('[seed-lab] .env carregado.');
} catch (e) {
  console.warn('[seed-lab] Atenção: não consegui carregar dotenv. Certifique-se de exportar DATABASE_URL.');
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('==============================');
  console.log(' SEED LAB - LOPESUL DASHBOARD ');
  console.log('==============================\n');

  // Ajusta aqui pros valores do teu cenário LAB
  const ROTEADOR_NOME = process.env.SEED_ROTEADOR_NOME || 'LAB-BUS06';
  const FROTA_PLACA = process.env.SEED_FROTA_PLACA || 'LAB-TEST-06';
  const FROTA_ROTA = process.env.SEED_FROTA_ROTA || 'LAB - Onibus 06';
  const MIK_ID = process.env.SEED_MIK_ID || 'TESTE'; // esse vai casar com deviceId=TESTE na pagamento.html

  const MIKROTIK_HOST = process.env.MIKROTIK_HOST;
  const MIKROTIK_API_USER = process.env.MIKROTIK_USER;
  const MIKROTIK_API_PASS = process.env.MIKROTIK_PASS;
  const MIKROTIK_API_PORT = Number(process.env.MIKROTIK_PORT || 8728);

  if (!MIKROTIK_HOST || !MIKROTIK_API_USER || !MIKROTIK_API_PASS) {
    throw new Error('Defina MIKROTIK_HOST/USER/PASS no ambiente antes de rodar scripts/seed-lab.cjs');
  }

  console.log('[1] Criando / achando Roteador LAB...');

  // Como nome não é unique, vamos usar findFirst + create/update
  let roteador = await prisma.roteador.findFirst({
    where: { nome: ROTEADOR_NOME },
  });

  if (!roteador) {
    roteador = await prisma.roteador.create({
      data: {
        nome: ROTEADOR_NOME,
        ipLan: MIKROTIK_HOST, // aqui pode ser IP de gestão do Mikrotik
        usuario: MIKROTIK_API_USER,
        senhaHash: MIKROTIK_API_PASS, // em produção deveria ser hash, aqui é LAB
        portaApi: MIKROTIK_API_PORT,
        portaSsh: 22,
        wgPublicKey: null,
        wgIp: null,
        statusMikrotik: 'DESCONHECIDO',
        statusWireguard: 'DESCONHECIDO',
      },
    });
    console.log('  → Roteador criado:', roteador.id);
  } else {
    console.log('  → Roteador já existia:', roteador.id);
  }

  console.log('\n[2] Criando / achando Frota LAB...');

  let frota = await prisma.frota.findFirst({
    where: { placa: FROTA_PLACA },
  });

  if (!frota) {
    frota = await prisma.frota.create({
      data: {
        placa: FROTA_PLACA,
        rotaLinha: FROTA_ROTA,
        status: 'ATIVO',
        observacoes: 'Frota LAB para testes locais (BUS06)',
        roteadorId: roteador.id,
      },
    });
    console.log('  → Frota criada:', frota.id);
  } else {
    console.log('  → Frota já existia:', frota.id);

    // Garante que está ligada ao roteador LAB
    if (!frota.roteadorId) {
      frota = await prisma.frota.update({
        where: { id: frota.id },
        data: { roteadorId: roteador.id },
      });
      console.log('  → Frota atualizada com roteadorId:', roteador.id);
    }
  }

  console.log('\n[3] Criando / atualizando Dispositivo LAB (mikId=TESTE)...');

  const dispositivo = await prisma.dispositivo.upsert({
    where: {
      mikId: MIK_ID, // unique
    },
    update: {
      frotaId: frota.id,
      ip: '192.168.88.1', // aqui pode ser o IP do hotspot ou de gestão que você quer associar
      mikrotikHost: MIKROTIK_HOST,
      mikrotikUser: MIKROTIK_API_USER,
      mikrotikPass: MIKROTIK_API_PASS,
      mikrotikPort: MIKROTIK_API_PORT,
      mikrotikUseSsl: false,
    },
    create: {
      frotaId: frota.id,
      ip: '192.168.88.1', // precisa ser um IP válido conforme @db.Inet
      mikId: MIK_ID,
      mikrotikHost: MIKROTIK_HOST,
      mikrotikUser: MIKROTIK_API_USER,
      mikrotikPass: MIKROTIK_API_PASS,
      mikrotikPort: MIKROTIK_API_PORT,
      mikrotikUseSsl: false,
    },
  });

  console.log('  → Dispositivo LAB pronto:');
  console.log('     id:       ', dispositivo.id);
  console.log('     mikId:    ', dispositivo.mikId);
  console.log('     frotaId:  ', dispositivo.frotaId);
  console.log('     ip:       ', dispositivo.ip);
  console.log('     host API: ', dispositivo.mikrotikHost + ':' + dispositivo.mikrotikPort);

  console.log('\n✅ Seed LAB finalizado com sucesso.');
}

main()
  .catch((err) => {
    console.error('\n🔥 Erro no seed LAB:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
