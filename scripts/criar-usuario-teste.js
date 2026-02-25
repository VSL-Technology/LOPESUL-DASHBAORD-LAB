// scripts/criar-usuario-teste.js
/**
 * Script para criar um usuário de teste para login
 * Usage: node scripts/criar-usuario-teste.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Usuário de teste
    const email = 'admin@lopesul.com.br';
    const password = 'Admin@123456';
    const nome = 'Admin Lopesul';

    console.log('🔐 Criando usuário de teste...');
    console.log(`   Email: ${email}`);
    console.log(`   Senha: ${password}`);
    console.log(`   Nome: ${nome}`);
    console.log('');

    // Hash da senha
    const senhaHash = await bcrypt.hash(password, 10);

    // Criar (ou atualizar) usuário com permissão MASTER
    const operador = await prisma.operador.upsert({
      where: { nome: email },
      update: {
        senha: senhaHash,
        ativo: true,
        role: 'MASTER',
      },
      create: {
        nome: email,
        senha: senhaHash,
        ativo: true,
        role: 'MASTER',
      },
    });

    console.log('✅ Usuário MASTER pronto para login!');
    console.log('');
    console.log('📝 Use essas credenciais para fazer login:');
    console.log(`   Usuário: ${email}`);
    console.log(`   Senha: ${password}`);
    console.log('');
    console.log(`ID: ${operador.id}`);
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
