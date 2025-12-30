# Segurança – Refatoração 2024

## 1. Medidas aplicadas

### 1.1. Gestão centralizada de segredos e ambiente

- Guardião único de variáveis (`src/lib/env.js`) concentra leitura de `process.env`.
- Apenas `ENV.*` é usado no código; o boot falha se faltar qualquer secret crítico (Pagar.me, Mikrotik, relay, `SESSION_SECRET`, etc.).
- Reduz risco de misconfiguração e exposição de segredos.

### 1.2. Endurecimento das rotas críticas de pagamento (PIX)

- `/api/payments/pix` agora valida payload com Zod.
- Logging estruturado sem vazar chaves ou cartões.
- Rate limit por IP para mitigar flood/abuso.

### 1.3. Webhook Pagar.me com validação HMAC e idempotência

- Lê raw body e valida assinatura HMAC (rejeita se inválida).
- Garante idempotência via `WebhookLog` (cada `hookId` é processado apenas uma vez).
- Rate limit dedicado ao webhook, impedindo flood.
- Guard rails de status (não permite PAID → PENDING ou mudanças inconsistentes).

### 1.4. Autenticação de operador e sessão fortalecidas

- Senhas só existem como hash (`bcrypt`). Senhas legadas em texto puro são migradas automaticamente quando o usuário loga.
- `LoginAttempt` registra usuário, IP, sucesso/falha. Bloqueio automático por IP/usuário após múltiplas falhas.
- Política de senha forte na criação/edição de operadores.
- Sessão baseada em JWT assinado (`SESSION_SECRET`), entregue via cookie `session` (HttpOnly, SameSite, Secure em produção).

### 1.5. Middleware global de segurança e proteção de rotas

- `middleware.ts` atua como portaria: `/dashboard`, `/dispositivos`, `/frotas`, `/configuracoes` etc. exigem sessão válida.
- `/login` redireciona usuários já autenticados para o dashboard.
- Todas as respostas herdaram headers de segurança (CSP básica, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy).

### 1.6. Relay inteligente entre backend e Mikrotik

- Novo relay em `relay/` com Express + Helmet.
- Autenticação obrigatória via token interno, rate limit e logging estruturado.
- Execução no Mikrotik é mediada por ações pré-determinadas (autorizar/revogar/limpar), nunca por comandos livres vindos do painel.

## 2. Análise de segurança por camada

### 2.1. Camada de aplicação / API – ~8/10

- Zod + rate limit nas rotas críticas.
- Autenticação com hash forte, política de senha e bloqueio de brute force.
- JWT + cookie seguro + middleware global.
- Próximos passos: refatorar rotas antigas para o padrão Zod/log, ampliar testes/observabilidade.

### 2.2. Fluxo financeiro (PIX + Webhook) – ~8/10

- HMAC obrigatório, idempotência e guardas de status.
- Falhas são rastreáveis e com fallback controlado.
- Próximos passos: dashboard de monitoramento e histórico completo para auditoria.

### 2.3. Infra Relay / Mikrotik – ~7/10 (indo para 8/10)

- Relay responde só com token válido, tem rate limit/log e abstrai ações.
- Plano de hardening do Mikrotik (WireGuard, firewall, usuário restrito) em execução.
- Assim que o Mikrotik estiver com firewall/WG/usuário aplicados, estimativa sobe para ~8/10.

### 2.4. Visão geral

- Cadeia multi-layer estilo banco: secrets guard, auth forte, rate limit, HMAC + idempotência, middleware com headers, relay autenticado.
- Próximos passos: concluir o hardening do Mikrotik/VPS e implantar monitoramento/backup/playbook (Etapa 7) para bater ~8.5/10.

