# 🚀 Iniciando Refatoração do Lopesul Dashboard

## ✅ Já Criado

Este foi o setup inicial da Fase 1. Os seguintes arquivos foram criados:

1. **`REFACTORING_PLAN.md`** - Plano estratégico completo
2. **`src/lib/schemas/index.ts`** - Schemas Zod para validação centralizada
3. **`src/lib/api/errors.ts`** - Error handling centralizado
4. **`src/lib/logger.ts`** - Logging estruturado com Pino
5. **`scripts/install-refactoring-deps.sh`** - Script de instalação de deps

## 📦 Próximo Passo: Instalar Dependências

```bash
# Execute este comando para instalar todas as deps novas
bash scripts/install-refactoring-deps.sh
```

Ou manualmente:

```bash
npm install zod react-hook-form @hookform/resolvers @tanstack/react-query pino pino-pretty sanitize-html xss next-auth@5.0.0-beta.20 jose @upstash/ratelimit @upstash/redis bcryptjs

npm install --save-dev jest ts-jest @testing-library/react @types/jest @types/node typescript ts-node eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier @playwright/test
```

## ✨ Depois de Instalar

### 1. Verificar erros de tipos

```bash
npm run type-check
```

(Deve mostrar erros dos deps faltando, que desaparecem após npm install)

### 2. Próximas tarefas recomendadas

**Ordem prioritária:**

1. **Refatorar autenticação** → `src/lib/auth.ts` (NextAuth.js)
   - Remover middleware de auth manual
   - Implementar JWT + refresh tokens
   - Adicionar MFA support

2. **Migrar APIs para usar Schemas** → Exemplo:
   ```typescript
   // src/app/api/frotas/route.ts (antes)
   export async function GET() {
     const limit = req.query.limit || 10;
     const offset = req.query.offset || 0;
   }

   // Depois: usar PaginationSchema
   ```

3. **Centralizar error handling** → Atualizar todos os endpoints
   ```typescript
   import { withErrorHandling, ValidationError } from '@/lib/api/errors';
   
   export const GET = withErrorHandling(async (req, context) => {
     // handler aqui
   });
   ```

4. **Remover .js files** → Converter tudo para TypeScript
   ```bash
   find src -name "*.js" -type f ! -path "*/node_modules/*" | head -20
   ```

5. **Setup Zod validation middleware**
   ```typescript
   // Middleware para validar query params automaticamente
   ```

## 📊 Checklist de Fase 1

- [ ] Instalar todas as dependências
- [ ] Criar `src/lib/auth.ts` com NextAuth config
- [ ] Atualizar `middleware.ts` para usar `getSession()`
- [ ] Criar exemplo de rota refatorada com Zod + error handling
- [ ] Remover 5 primeiros arquivos .js duplicados
- [ ] Criar testes básicos com Jest
- [ ] Documentar novas convenções de código

## 🔗 Links úteis

- [Zod Documentation](https://zod.dev)
- [NextAuth.js v5](https://next-auth.js.org)
- [Pino Logger](https://getpino.io)
- [React Hook Form](https://react-hook-form.com)
- [React Query](https://tanstack.com/query/latest)

## ⚠️ Importante

**NÃO PULE PASSOS:**
1. Instale as deps primeiro
2. Não delete código antigo ainda - faça lado a lado
3. Teste cada endpoint após refatoração
4. Use feature flags para ativar/desativar novas APIs

## 🆘 Se algo quebrar

1. Reverta o commit
2. Cheque os logs: `npm run dev 2>&1 | tail -50`
3. Verifique types: `npm run type-check`
4. Execute testes: `npm test`

---

**Próximo:** Execute `bash scripts/install-refactoring-deps.sh` e reporte qualquer erro 🚀
