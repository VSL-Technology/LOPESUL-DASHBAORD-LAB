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

    // Verificar se já existe
    const existente = await prisma.operador.findUnique({
      where: { nome: email },
    });

    if (existente) {
      console.log('⚠️  Usuário já existe!');
      console.log(`   ID: ${existente.id}`);
      console.log(`   Ativo: ${existente.ativo}`);
      return;
    }

    // Criar usuário
    const operador = await prisma.operador.create({
      data: {
        nome: email,
        senha: senhaHash,
        ativo: true,
        role: 'admin',
      },
    });

    console.log('✅ Usuário criado com sucesso!');
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
