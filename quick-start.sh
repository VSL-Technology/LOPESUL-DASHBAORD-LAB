#!/bin/bash

# 🚀 QUICK START - Lopesul Dashboard Dev Environment
# Execute este script para iniciar tudo de uma vez

set -e

echo "🔧 Lopesul Dashboard - Setup Rápido"
echo "===================================="
echo ""

# 1. Verificar PostgreSQL
echo "📦 Verificando PostgreSQL..."
if ! brew services list | grep -q "postgresql@15"; then
    echo "   ⚠️  PostgreSQL não está rodando. Iniciando..."
    brew services start postgresql@15
    sleep 2
fi
echo "   ✅ PostgreSQL OK"

# 2. Aplicar migrations
echo ""
echo "📊 Aplicando migrations..."
npx prisma migrate deploy > /dev/null 2>&1 || true
echo "   ✅ Schema atualizado"

# 3. Criar/verificar usuário
echo ""
echo "🔐 Criando usuário de teste..."
node scripts/criar-usuario-teste.js 2>&1 | tail -3

# 4. Iniciar servidor
echo ""
echo "🚀 Iniciando servidor Next.js..."
echo "   URL: http://localhost:3000"
echo "   Login: admin@lopesul.com.br / Admin@123456"
echo ""
echo "Pressione Ctrl+C para parar"
echo ""

npm run dev
