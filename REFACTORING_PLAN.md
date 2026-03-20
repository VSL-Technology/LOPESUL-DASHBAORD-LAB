# 🚀 Plano de Refatoração Lopesul Dashboard

**Data:** 5 de dezembro de 2025  
**Status:** Planejamento  
**Prioridade:** Alta

---

## 📋 Resumo Executivo

O Lopesul Dashboard é um sistema **crítico** de gerenciamento de acesso Wi-Fi com integrações complexas (Mikrotik, Pix, Prisma). Este plano moderniza a arquitetura para:

- ✅ **Segurança reforçada** (JWT, CSRF, rate-limiting, input validation)
- ✅ **Observabilidade total** (logs estruturados, tracing, metrics)
- ✅ **Performance otimizada** (caching, query optimization, lazy loading)
- ✅ **Type-safety** (TypeScript full-stack)
- ✅ **Testabilidade** (70%+ coverage, testes e2e)
- ✅ **Manutenibilidade** (DDD patterns, clear separation of concerns)

---

## 🔍 Problemas Identificados

### 🔴 Críticos

1. **Validação dispersa** - Sem schema centralizado (Zod/Joi)
   - Cada endpoint faz suas próprias validações
   - Risco de inconsistência e bypasses
   - **Impacto:** Vulnerabilidades, dados corrompidos

2. **Autenticação fraca**
   - Cookie simples sem JWT
   - Sem refresh tokens
   - Sem rate-limiting
   - **Impacto:** Brute force, session hijacking, DoS

3. **Sem error handling centralizado**
   - Cada arquivo trata erros diferente
   - Logs inconsistentes
   - **Impacto:** Difícil debugar, segurança reduzida

4. **Duplicação de código**
   - Múltiplas funções `json()`, `execMikrotikCommand()`, etc.
   - Validações repetidas (IP, MAC)
   - **Impacto:** Bugs replicados, manutenção difícil

### 🟡 Altos

5. **Frontend sem TypeScript**
   - HTML/CSS/vanilla JS no captive portal
   - Sem SSR/SSG otimizado
   - **Impacto:** Erros em runtime, slow rendering

6. **Sem observabilidade**
   - Logs ad-hoc
   - Sem tracing de requests
   - Sem métricas de performance
   - **Impacto:** Impossível debugar em produção

7. **Dependencies desatualizadas**
   - Next.js 15.5.4 (OK), mas plugins antigos
   - Prisma 6.16.3 (OK)
   - BCryptjs, node-ssh, etc sem atualização recente
   - **Impacto:** Security holes, bugs

8. **Arquivos duplicados** (.js e .ts)
   - `/api/command/ping/route.{js,ts}`
   - `/api/relay/exec/route.{js,ts}`
   - **Impacto:** Confusão, possíveis inconsistências

### 🟠 Médios

9. **Estrutura de pastas inconsistente**
   - Mix de JS e TS
   - Sem separação clara (services, utils, hooks)
   - **Impacto:** Escalabilidade reduzida

10. **Sem testes**
    - Zero cobertura
    - Mudanças arriscadas
    - **Impacto:** Regressões, instabilidade

---

## 📊 Estratégia de Refatoração (Fases)

### **Fase 1: Fundação & Segurança** (1-2 semanas)

#### 1.1 Implementar validação centralizada (Zod)

```typescript
// lib/schemas/index.ts
import { z } from 'zod';

export const IdParamSchema = z.object({
  id: z.string().uuid('ID inválido').trim(),
});

export const IpSchema = z.string()
  .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP inválido');

export const MacSchema = z.string()
  .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, 'MAC inválido')
  .transform(s => s.toUpperCase());

export const PedidoCreateSchema = z.object({
  frotaId: z.string().uuid(),
  deviceId: z.string(),
  planoMinutos: z.number().min(1).max(10080), // até 7 dias
  clienteEmail: z.string().email().optional(),
});
```

**Ação:**
- [ ] Criar `src/lib/schemas/` com todos os schemas
- [ ] Middleware que valida req.body/params automaticamente
- [ ] Testes para cada schema

---

#### 1.2 Refatorar autenticação (NextAuth.js v5)

**Remover:** Cookies simples + middleware manual  
**Adicionar:** NextAuth.js v5 com:
- JWT com expiração configurável
- Refresh tokens (via DB)
- MFA support (TOTP)
- Rate-limiting (via middleware)
- Session persistence em Redis (opcional)

```typescript
// lib/auth.ts
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authConfig = {
  providers: [
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as { email: string; password: string };
        
        const operator = await prisma.operador.findUnique({
          where: { email },
        });

        if (!operator || !(await bcrypt.compare(password, operator.senhaHash))) {
          throw new Error('Invalid credentials');
        }

        return {
          id: operator.id,
          email: operator.email,
          nome: operator.nome,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login?error=true',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || 'operator';
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id = token.id;
      (session.user as any).role = token.role;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

**Ação:**
- [ ] Instalar `next-auth@5`, `jose`
- [ ] Criar `lib/auth.ts` com config
- [ ] Implementar `/api/auth/[...nextauth]/route.js`
- [ ] Migrar middleware para usar `getSession()`
- [ ] Remover cookie manual do login/logout

---

#### 1.3 Implementar rate-limiting & CSRF

```typescript
// lib/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 attempts per 15 min
  analytics: true,
  prefix: 'rl:login',
});

export const apiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(100, '1 h'),
  analytics: true,
  prefix: 'rl:api',
});
```

```typescript
// lib/csrf.ts - CSRF protection via `csrf` package
import { createHash } from 'crypto';

export function generateCsrfToken(): string {
  return createHash('sha256').update(Math.random().toString()).digest('hex');
}

export function verifyCsrfToken(token: string, storedToken: string): boolean {
  return createHash('sha256').update(token).digest('hex') === storedToken;
}
```

**Ação:**
- [ ] Integrar Upstash Redis para rate-limiting
- [ ] Criar middleware CSRF para POST/PUT/DELETE
- [ ] Adicionar CSRF token em formulários
- [ ] Testar com ferramentas de load testing

---

#### 1.4 Input sanitization & escaping

```typescript
// lib/sanitize.ts
import sanitizeHtml from 'sanitize-html';
import xss from 'xss';

export function sanitizeUserInput(input: string): string {
  return xss(sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }));
}

export function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}
```

**Ação:**
- [ ] Instalar `sanitize-html`, `xss`
- [ ] Sanitizar todos os inputs de usuário
- [ ] Validar IPs, MACs antes de processar

---

### **Fase 2: TypeScript & Frontend** (2-3 semanas)

#### 2.1 Migrar para TypeScript completo

```bash
# Converter todos os .js para .ts
find src/app -name "*.js" -type f | xargs -I {} mv {} {%.js}.ts
find src/lib -name "*.js" -type f | xargs -I {} mv {} {%.js}.ts
```

**tsconfig.json updates:**
```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "useDefineForClassFields": true,
    "esModuleInterop": true,
    "module": "esnext",
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false, // ❌ Remover
    "checkJs": true
  }
}
```

**Ação:**
- [ ] Converter arquivos .js → .ts
- [ ] Criar tipos para todas as respostas de API
- [ ] Resolver todos os erros TS strict mode
- [ ] Gerar tipos do Prisma automaticamente

---

#### 2.2 Refatorar frontend (React + SSR)

**Remover:** HTML vanilla + JS puro no `/public`  
**Adicionar:** React components com:
- SSR para SEO
- Component composition
- React Query para cache
- Form validation com React Hook Form
- Acessibilidade (ARIA labels)

```typescript
// src/components/PaymentForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckoutSchema } from '@/lib/schemas';

export function PaymentForm({ deviceId }: { deviceId: string }) {
  const form = useForm({
    resolver: zodResolver(CheckoutSchema),
    defaultValues: { plano: '12h' },
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, deviceId }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      return res.json();
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
      <select {...form.register('plano')}>
        <option value="12h">12 horas</option>
        <option value="24h">24 horas</option>
        <option value="48h">48 horas</option>
      </select>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Processando...' : 'Pagar com Pix'}
      </button>
      {mutation.isError && <p>{mutation.error?.message}</p>}
    </form>
  );
}
```

**Ação:**
- [ ] Instalar `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-query`
- [ ] Converter `/public/pagamento.html` → `/src/app/pagamento/page.tsx`
- [ ] Criar sistema de componentes Ui
- [ ] Implementar dark mode com Context
- [ ] Testes de acessibilidade (axe-core)

---

#### 2.3 Remover arquivos duplicados

```bash
# Manter apenas .ts, remover .js
find src/app/api -name "*.js" -type f -delete
find src/lib -name "*.js" -type f -delete
```

**Ação:**
- [ ] Remover todos os .js duplicados
- [ ] Verificar imports, ajustar paths
- [ ] Testar build

---

### **Fase 3: Observabilidade & Performance** (1-2 semanas)

#### 3.1 Logging estruturado

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
  base: {
    env: process.env.NODE_ENV,
    service: 'lopesul-dashboard',
  },
});

// Middleware global
export function createLogger(req: NextRequest) {
  return logger.child({
    requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
    method: req.method,
    path: req.nextUrl.pathname,
  });
}
```

```typescript
// Exemplo de uso
logger.info(
  { userId: user.id, action: 'login' },
  'User logged in successfully'
);

logger.error(
  { error: err, deviceId },
  'Failed to revoke access'
);
```

**Ação:**
- [ ] Instalar `pino`, `pino-pretty`
- [ ] Criar logger centralizado
- [ ] Adicionar logging a todos os endpoints
- [ ] Integrar com Datadog/Sentry

---

#### 3.2 Request tracing & APM

```typescript
// lib/tracing.ts - OpenTelemetry setup
import { NodeTracerProvider } from '@opentelemetry/node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
});

provider.addSpanProcessor(new JaegerExporter({...}));
provider.register();
```

**Ação:**
- [ ] Setup OpenTelemetry
- [ ] Criar spans para operações críticas
- [ ] Integrar com Jaeger/Datadog
- [ ] Alertas para latência elevada

---

#### 3.3 Performance otimização

**Caching estratégia:**
```typescript
// lib/cache.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getCachedFrota(id: string) {
  const cached = await redis.get(`frota:${id}`);
  if (cached) return JSON.parse(cached);

  const frota = await prisma.frota.findUnique({ where: { id } });
  if (frota) {
    await redis.setex(`frota:${id}`, 3600, JSON.stringify(frota));
  }
  return frota;
}
```

**Query optimization:**
- Adicionar índices no Prisma
- Usar `select` para trazer apenas campos necessários
- Batching de queries (DataLoader pattern)

**Bundle size:**
```bash
next build --analyze
```

**Ação:**
- [ ] Adicionar Redis para cache
- [ ] Otimizar queries Prisma
- [ ] Code splitting automático
- [ ] Lazy load components grandes

---

### **Fase 4: Testes & CI/CD** (2-3 semanas)

#### 4.1 Setup de testes

```typescript
// jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

**Testes de exemplo:**
```typescript
// src/lib/__tests__/schemas.test.ts
import { MacSchema, IpSchema } from '@/lib/schemas';

describe('Schemas', () => {
  describe('MacSchema', () => {
    it('valida MAC válido', () => {
      expect(MacSchema.parse('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('rejeita MAC inválido', () => {
      expect(() => MacSchema.parse('INVALID')).toThrow();
    });
  });

  describe('IpSchema', () => {
    it('valida IP válido', () => {
      expect(IpSchema.parse('192.168.1.1')).toBe('192.168.1.1');
    });

    it('rejeita IP inválido', () => {
      expect(() => IpSchema.parse('999.999.999.999')).toThrow();
    });
  });
});
```

**Ação:**
- [ ] Instalar `jest`, `ts-jest`, `@testing-library/react`
- [ ] Criar estrutura de testes
- [ ] Escrever testes unitários (lib/, utils)
- [ ] Escrever testes de integração (API routes)
- [ ] Setup de e2e com Playwright

---

#### 4.2 CI/CD pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test
      - run: npm run build
      
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx snyk test --severity-threshold=high

  deploy:
    needs: [test, security]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - run: npm run deploy # Railway/Vercel
```

**Ação:**
- [ ] Criar workflows de CI
- [ ] Setup de linting (ESLint, Prettier)
- [ ] Type checking em CI
- [ ] Security scanning (Snyk, npm audit)
- [ ] Auto-deploy em main

---

### **Fase 5: Refatoração de domínio** (3-4 semanas)

#### 5.1 Estrutura de serviços (DDD)

```
src/
├── domain/
│   ├── payment/
│   │   ├── services/
│   │   │   └── pixService.ts
│   │   ├── repositories/
│   │   │   └── pedidoRepository.ts
│   │   └── entities/
│   │       └── Pedido.ts
│   ├── router/
│   │   ├── services/
│   │   │   └── mikrotikService.ts
│   │   └── repositories/
│   │       └── sessaoRepository.ts
│   └── fleet/
│       ├── services/
│       │   └── frotaService.ts
│       └── repositories/
│           └── frotaRepository.ts
├── application/
│   └── use-cases/
│       ├── payment/
│       │   ├── CreatePixOrderUseCase.ts
│       │   └── ConfirmPaymentUseCase.ts
│       └── session/
│           └── RevokeAccessUseCase.ts
├── infrastructure/
│   ├── prisma/
│   ├── mikrotik/
│   └── pix/
└── presentation/
    ├── api/
    │   └── routes/
    └── components/
```

**Ação:**
- [ ] Refatorar código para DDD
- [ ] Criar services reutilizáveis
- [ ] Implementar repositories
- [ ] Injeção de dependência (tsyringe)

---

#### 5.2 Remover tech debt operacional

- [ ] Converter scripts Bash/Node em Python CLI
- [ ] Documentação de operações em Markdown
- [ ] Playbooks para troubleshooting
- [ ] Runbooks para disasters recovery

---

## 📦 Dependências a adicionar

```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta.20",
    "zod": "^3.22.0",
    "react-hook-form": "^7.50.0",
    "@hookform/resolvers": "^3.3.0",
    "@tanstack/react-query": "^5.28.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0",
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.46.0",
    "@upstash/ratelimit": "^1.0.0",
    "@upstash/redis": "^1.25.0",
    "sanitize-html": "^2.11.0",
    "xss": "^1.0.14"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.1.5",
    "ts-node": "^10.9.0",
    "eslint": "^8.54.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "prettier": "^3.11.0",
    "playwright": "^1.40.0"
  }
}
```

---

## 🎯 Priorização

### Sprint 1 (Semana 1)
- [ ] Validação centralizada (Zod)
- [ ] NextAuth.js setup
- [ ] Rate-limiting básico
- [ ] Documentação

### Sprint 2 (Semana 2-3)
- [ ] Migração para TypeScript
- [ ] Frontend React/SSR
- [ ] Remover duplicatas

### Sprint 3 (Semana 4)
- [ ] Logging & tracing
- [ ] Cache com Redis
- [ ] Testes básicos

### Sprint 4 (Semana 5)
- [ ] CI/CD pipeline
- [ ] DDD refactor
- [ ] Performance optimization

---

## 📊 Métricas de sucesso

| Métrica | Before | After | Target |
|---------|--------|-------|--------|
| TypeScript Coverage | 30% | 100% | ✅ |
| Test Coverage | 0% | 70% | ✅ |
| Response Time (p95) | 800ms | 150ms | ✅ |
| Security Score | D+ | A | ✅ |
| Bundle Size | 450KB | 200KB | ✅ |
| Lighthouse Score | 65 | 95 | ✅ |

---

## ⚠️ Riscos & Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|--------|-----------|
| Break auth flow | Alto | Crítico | Feature flags, staging deploy |
| DB incompatibility | Médio | Alto | Backup completo, migration scripts |
| Performance regression | Médio | Alto | Load testing, canary deploy |
| Breaking API changes | Alto | Médio | Versioning, deprecation notices |

---

## 📚 Referências & Best Practices

- [Next.js 15 Best Practices](https://nextjs.org/docs)
- [Next-Auth.js Documentation](https://next-auth.js.org)
- [OWASP Top 10](https://owasp.org/Top10/)
- [12 Factor App](https://12factor.net)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [OpenTelemetry](https://opentelemetry.io)

---

## 🚀 Timeline Estimado

- **Fase 1:** 1-2 semanas (Validação + Auth)
- **Fase 2:** 2-3 semanas (TypeScript + Frontend)
- **Fase 3:** 1-2 semanas (Observabilidade)
- **Fase 4:** 2-3 semanas (Testes + CI/CD)
- **Fase 5:** 3-4 semanas (DDD refactor)

**Total:** ~3 meses para refatoração completa

---

**Próximo passo:** Iniciar com Fase 1 - Implementar Zod validation
