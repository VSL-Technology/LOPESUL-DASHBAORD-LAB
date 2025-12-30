#!/bin/bash

# Script para configurar desenvolvimento local com SQLite
# Use: bash scripts/setup-dev-sqlite.sh

set -e

echo "🔧 Configurando ambiente local com SQLite..."

# 1. Atualizar .env.local para SQLite (usa variáveis já exportadas se existirem)
cat > .env.local << EOF
DATABASE_URL="file:./dev.db"
PAGARME_SECRET_KEY="${PAGARME_SECRET_KEY:-change-me}"
RELAY_URL="${RELAY_URL:-http://localhost:3001}"
RELAY_TOKEN="${RELAY_TOKEN:-change-me}"
APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"
CATIVE_BASE_URL="${CATIVE_BASE_URL:-http://localhost:3001}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-dev-secret-key-not-for-production}"
NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"
EOF

echo "✅ .env.local criado com SQLite"

# 2. Aplicar migrations
echo "📦 Aplicando migrations..."
npx prisma migrate deploy

# 3. Criar usuário de teste
echo "🔐 Criando usuário de teste..."
node scripts/criar-usuario-teste.js

echo ""
echo "✨ Setup completo! Agora execute:"
echo "   npm run dev"
echo ""
echo "📝 Login:"
echo "   Usuário: admin@lopesul.com.br"
echo "   Senha: Admin@123456"
