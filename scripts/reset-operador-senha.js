// scripts/reset-operador-senha.js
/**
 * Reseta a senha de um operador existente e imprime a nova senha temporária.
 *
 * Uso:
 *   node scripts/reset-operador-senha.js usuario@email.com
 *
 * Se o usuário não for informado, assume "admin@lopesul.com.br".
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generatePassword(length = 16) {
  // base64url evita caracteres estranhos e continua forte
  return randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length);
}

async function main() {
  const usuario = (process.argv[2] || 'admin@lopesul.com.br').trim();

  if (!usuario) {
    console.error('❌ Informe o nome/usuário do operador.');
    process.exit(1);
  }

  const operador = await prisma.operador.findUnique({
    where: { nome: usuario },
  });

  if (!operador) {
    console.error(`❌ Operador "${usuario}" não encontrado.`);
    process.exit(1);
  }

  const novaSenha = generatePassword(18);
  const hash = await bcrypt.hash(novaSenha, 12);

  await prisma.operador.update({
    where: { nome: usuario },
    data: { senha: hash },
  });

  console.log('✅ Senha redefinida com sucesso!');
  console.log(`👤 Operador: ${usuario}`);
  console.log(`🔑 Nova senha temporária: ${novaSenha}`);
  console.log('⚠️ Recomendado alterar essa senha após o primeiro login.');
}

main()
  .catch((err) => {
    console.error('❌ Erro ao redefinir senha:', err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
