#!/bin/bash
# COMECE AQUI - Setup da Refatoração
# Execute: bash COMECE_AQUI.sh

set -e

echo "🚀 Refatoração Lopesul Dashboard - Setup"
echo "=========================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Passo 1: Instalando dependências...${NC}"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Por favor, instale Node.js 18+"
    exit 1
fi

# Install deps silently
npm install > /dev/null 2>&1 || npm install

echo -e "${GREEN}✅ Dependências instaladas${NC}"
echo ""

echo -e "${BLUE}📋 Passo 2: Verificando tipos TypeScript...${NC}"
npm run type-check 2>&1 | head -20 || true

echo ""
echo -e "${BLUE}📋 Passo 3: Estrutura criada${NC}"
echo ""

# List created files
echo -e "${GREEN}📄 Documentação:${NC}"
echo "   • REFACTORING_PLAN.md - Estratégia completa"
echo "   • REFACTORING_STARTED.md - Guia prático"
echo "   • REFACTORING_SUMMARY.md - Sumário executivo"
echo "   • REFACTORING_EXAMPLES.md - Antes/depois"
echo "   • README_REFACTORING.md - Roadmap"
echo "   • REFACTORING_CHECKLIST.md - Checklist de implementação"
echo ""

echo -e "${GREEN}💻 Código:${NC}"
echo "   • src/lib/schemas/index.ts - Validação com Zod"
echo "   • src/lib/api/errors.ts - Error handling"
echo "   • src/lib/logger.ts - Logging com Pino"
echo "   • src/app/api/_examples/frotas-refactored-example.ts - Exemplo"
echo ""

echo -e "${BLUE}📋 Passo 4: Próximos passos${NC}"
echo ""
echo "1️⃣  Leia a documentação (na ordem):"
echo "    → cat REFACTORING_PLAN.md | less"
echo "    → cat REFACTORING_EXAMPLES.md | less"
echo ""

echo "2️⃣  Estude o exemplo de refatoração:"
echo "    → cat src/app/api/_examples/frotas-refactored-example.ts"
echo ""

echo "3️⃣  Rode o servidor:"
echo "    → npm run dev"
echo ""

echo "4️⃣  Refatore seu primeiro endpoint:"
echo "    → Escolha um em src/app/api/"
echo "    → Use os schemas + error handling"
echo "    → Teste com: npm run dev"
echo ""

echo "5️⃣  Envie PR:"
echo "    → git checkout -b refactor/seu-endpoint"
echo "    → git commit -m 'refactor: modernizar seu-endpoint'"
echo "    → git push"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
echo "   • NÃO delete código antigo ainda (trabalhe lado-a-lado)"
echo "   • NÃO combine múltiplas mudanças em um PR"
echo "   • Teste cada endpoint após refactor"
echo "   • Use feature flags se necessário"
echo ""

echo -e "${GREEN}✅ Setup completo!${NC}"
echo ""
echo "📚 Para mais informações: cat README_REFACTORING.md"
echo "🚀 Bora começar! 🚀"
echo ""
