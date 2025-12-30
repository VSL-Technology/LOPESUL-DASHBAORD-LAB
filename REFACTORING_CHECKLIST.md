# ✅ Refatoração Iniciada - Checklist de Implementação

## 📦 FASE 1: Fundação & Segurança

### Setup Inicial
- [x] Criar `REFACTORING_PLAN.md` (estratégia completa)
- [x] Criar `REFACTORING_STARTED.md` (guia prático)
- [x] Criar `REFACTORING_SUMMARY.md` (sumário executivo)
- [x] Criar `REFACTORING_EXAMPLES.md` (antes/depois)
- [x] Criar `README_REFACTORING.md` (roadmap)
- [x] Criar `scripts/install-refactoring-deps.sh`

### Validação Centralizada (Zod)
- [x] Criar `src/lib/schemas/index.ts`
  - [x] Tipos básicos (UUID, IP, MAC, Email, etc)
  - [x] Schemas de domínio (Frota, Roteador, etc)
  - [x] Query validators (Pagination, DateRange)
  - [x] Utilitários (safeParse, validateParams)
  - [x] ValidationError customizado

### Error Handling
- [x] Criar `src/lib/api/errors.ts`
  - [x] Classes customizadas (ApiError, ValidationError, etc)
  - [x] Formatter para erros Zod
  - [x] `withErrorHandling()` wrapper
  - [x] `createErrorResponse()` builder
  - [x] Response formatado consistentemente

### Logging Estruturado (Pino)
- [x] Criar `src/lib/logger.ts`
  - [x] Logger base configurável
  - [x] Child logger factory
  - [x] Pretty printing em dev
  - [x] JSON em prod
  - [x] Request logger helper

### Exemplo de Refatoração
- [x] Criar `src/app/api/_examples/frotas-refactored-example.ts`
  - [x] GET com paginação validada
  - [x] POST com Zod validation
  - [x] Error handling centralizado
  - [x] Logging em cada etapa
  - [x] PUT e DELETE examples

### Documentação
- [x] Adicionar seção SETUP no README principal
- [x] Criar guia de instalação

---

## ⏭️ FASE 1.2: Autenticação (Próximas 2 Semanas)

### NextAuth.js Setup
- [ ] Instalar `next-auth@5`, `jose`
- [ ] Criar `src/lib/auth.ts`
  - [ ] Config de providers (Credentials)
  - [ ] JWT callbacks
  - [ ] Session callbacks
  - [ ] Error handling
- [ ] Implementar `/api/auth/[...nextauth]/route.ts`
- [ ] Criar login page refatorada
- [ ] Implementar logout

### Migração de Auth
- [ ] Atualizar `middleware.ts` para usar `getSession()`
- [ ] Remover cookie manual de `/api/login`
- [ ] Migrar estado de session para NextAuth
- [ ] Testar fluxo de login completo
- [ ] Remover `src/lib/clientToken.ts` (será substituído)

### Rate Limiting
- [ ] Integrar Upstash Redis
- [ ] Implementar rate limiter para login (5/15min)
- [ ] Implementar rate limiter para API geral (100/1h)
- [ ] Adicionar headers de retry-after

### MFA (Multi-Factor Auth)
- [ ] Setup TOTP provider
- [ ] Criar página de setup de MFA
- [ ] Testes de MFA

### Testes de Auth
- [ ] Teste de login válido
- [ ] Teste de login inválido
- [ ] Teste de expiração de token
- [ ] Teste de refresh token
- [ ] Teste de rate limiting

---

## ⏭️ FASE 1.3: Segurança (Semana 3)

### CSRF Protection
- [ ] Implementar CSRF token generation
- [ ] Adicionar validação em POST/PUT/DELETE
- [ ] Testar CSRF bypass attempts

### Input Sanitization
- [ ] Instalar `sanitize-html`, `xss`
- [ ] Criar sanitize helper
- [ ] Aplicar em inputs de usuário
- [ ] Testar com payloads maliciosos

### Content Security Policy
- [ ] Implementar CSP headers
- [ ] Testar bloqueio de inline scripts
- [ ] Whitelist domínios necessários

### Testes de Segurança
- [ ] OWASP Top 10 basic check
- [ ] SQL injection attempts
- [ ] XSS injection attempts
- [ ] CSRF attempts

---

## ⏭️ FASE 2: TypeScript & Frontend (Semanas 4-5)

### Conversão para TypeScript
- [ ] Update `tsconfig.json` (strict: true, allowJs: false)
- [ ] Converter `src/lib/*.js` → `src/lib/*.ts`
- [ ] Converter `src/app/api/**/*.js` → `.ts`
- [ ] Resolver todos erros TypeScript strict
- [ ] Gerar tipos do Prisma

### Frontend - React
- [ ] Instalar `react-hook-form`, `@hookform/resolvers`
- [ ] Converter `/public/pagamento.html` → `/src/app/pagamento/page.tsx`
- [ ] Criar form components reutilizáveis
- [ ] Implementar validação com React Hook Form
- [ ] Setup Tailwind para SSR

### React Query
- [ ] Instalar `@tanstack/react-query`
- [ ] Criar query hooks para API
- [ ] Setup de cache strategy
- [ ] Implementar refetching automático

### SSR & Performance
- [ ] Implementar getServerSideProps onde necessário
- [ ] Lazy load componentes grandes
- [ ] Code splitting automático
- [ ] Image optimization

---

## ⏭️ FASE 3: Observabilidade (Semana 6)

### OpenTelemetry
- [ ] Instalar `@opentelemetry/*` packages
- [ ] Setup tracing básico
- [ ] Integrar com Jaeger/Datadog
- [ ] Criar spans para operações críticas

### Metricas
- [ ] Setup Prometheus metrics
- [ ] Monitorar latência de queries
- [ ] Monitorar taxa de erros
- [ ] Criar dashboards Grafana

### Alertas
- [ ] Setup alertas para erro rate > 1%
- [ ] Alertas para latência p95 > 200ms
- [ ] Alertas para rate limit atingido
- [ ] Alertas para autenticação falhada

---

## ⏭️ FASE 4: Testes & CI/CD (Semanas 7-8)

### Jest Setup
- [ ] Criar `jest.config.js`
- [ ] Setup de test utilities
- [ ] Mocks de Prisma
- [ ] Mocks de next-auth

### Unit Tests
- [ ] Tests para `lib/schemas/*`
- [ ] Tests para `lib/auth.ts`
- [ ] Tests para `lib/logger.ts`
- [ ] Tests para utils

### Integration Tests
- [ ] Tests para `/api/login`
- [ ] Tests para `/api/frotas`
- [ ] Tests para `/api/roteadores`
- [ ] Tests para `/api/pagamentos`

### E2E Tests (Playwright)
- [ ] Setup Playwright
- [ ] Login flow e2e
- [ ] Payment flow e2e
- [ ] Session management e2e

### CI/CD Pipeline
- [ ] GitHub Actions workflow
- [ ] Lint (ESLint)
- [ ] Type check (TypeScript)
- [ ] Tests (Jest + Playwright)
- [ ] Build test
- [ ] Security scan (Snyk)
- [ ] Auto-deploy em main

---

## ⏭️ FASE 5: Refatoração de Domínio (Semanas 9-12)

### Estrutura DDD
- [ ] Criar `src/domain/payment/`
  - [ ] `services/`
  - [ ] `repositories/`
  - [ ] `entities/`
- [ ] Criar `src/domain/router/`
- [ ] Criar `src/domain/fleet/`
- [ ] Criar `src/application/use-cases/`
- [ ] Criar `src/infrastructure/`

### Services Reutilizáveis
- [ ] `PaymentService`
- [ ] `MikrotikService`
- [ ] `SessionService`
- [ ] `DeviceService`

### Repositories
- [ ] `PedidoRepository`
- [ ] `SessaoRepository`
- [ ] `DispositivoRepository`
- [ ] `FrotaRepository`

### Dependency Injection
- [ ] Setup `tsyringe`
- [ ] Injetar dependências
- [ ] Facilitar testes

### Remover Tech Debt
- [ ] Converter scripts Bash → CLI Python/TS
- [ ] Documentar operações
- [ ] Criar playbooks para troubleshooting
- [ ] Runbooks para disaster recovery

---

## 🎯 Métricas de Sucesso

### Segurança
- [ ] Security score A (de D+)
- [ ] Zero vulnerabilidades conhecidas
- [ ] Rate limiting ativo
- [ ] CSRF protection em 100% de mutations
- [ ] MFA disponível

### Performance
- [ ] Bundle size 200KB (de 450KB)
- [ ] Response time p95 150ms (de 800ms)
- [ ] Lighthouse score 95 (de 65)
- [ ] Lighthouse CLS < 0.1
- [ ] Lighthouse LCP < 2.5s

### Qualidade
- [ ] Test coverage 70%+
- [ ] TypeScript 100%
- [ ] Zero `any` types
- [ ] ESLint passed
- [ ] Zero critical vulnerabilities

### Manutenibilidade
- [ ] Código 40% mais conciso
- [ ] Duração de onboarding reduzida 50%
- [ ] Tempo de bug fix reduzido 30%
- [ ] Documentação automática via tipos

---

## 📊 Status Atual: FASE 1 ✅

```
✅ Setup (100%)
├─ ✅ Documentação (5/5)
├─ ✅ Validação (1/1)
├─ ✅ Error Handling (1/1)
├─ ✅ Logging (1/1)
└─ ✅ Exemplo (1/1)

⏳ Fase 1.2: Auth (0%)
⏳ Fase 1.3: Security (0%)
⏳ Fase 2: TypeScript (0%)
⏳ Fase 3: Observability (0%)
⏳ Fase 4: Tests (0%)
⏳ Fase 5: DDD (0%)
```

---

## 🚀 Próxima Ação

```bash
# 1. Instalar dependências
bash scripts/install-refactoring-deps.sh

# 2. Verificar tipos
npm run type-check

# 3. Começar a refatorar
# → Escolha um endpoint
# → Use schemas + error handling
# → Envie PR
```

---

## 📞 Suporte

- Dúvidas sobre plan? → Leia `REFACTORING_PLAN.md`
- Não sabe como começar? → Estude `frotas-refactored-example.ts`
- Erro ao rodar? → Veja `REFACTORING_STARTED.md`
- Precisa de inspiração? → Veja `REFACTORING_EXAMPLES.md`

---

**Última atualização:** 5 de dezembro de 2025  
**Status:** ✅ Pronto para começar Fase 1.2  
**Estimado:** 12-16 semanas até conclusão

🚀 **Vamos começar!**
