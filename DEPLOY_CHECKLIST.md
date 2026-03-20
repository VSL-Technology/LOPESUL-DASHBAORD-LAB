# Deploy checklist — Dashboard LOPESUL

## Primeiro deploy (Railway)

### Variáveis obrigatórias no Railway → Settings → Variables
Copie do .env.example e preencha com os valores reais:
- DATABASE_URL          → gerado pelo Railway PostgreSQL
- REDIS_URL             → gerado pelo Railway Redis
- JWT_SECRET            → openssl rand -base64 48
- PAGARME_SECRET_KEY    → painel dashboard.pagar.me
- RELAY_API_URL         → URL do serviço Relay no Railway
- RELAY_TOKEN           → deve ser igual ao HMAC_SECRET do Relay
- INTERNAL_DEBUG_TOKEN  → openssl rand -hex 32 (só dev)
- NODE_ENV              → production

### Migrations
Railway → seu serviço → Settings → Deploy → Start Command:
  npx prisma migrate deploy && node server.js

Ou rode manualmente uma vez:
  railway run npx prisma migrate deploy

### Verificar após deploy
- [ ] GET /api/health → 200
- [ ] .env NÃO está no repositório: git ls-files .env (deve retornar vazio)
- [ ] Debug endpoints retornam 404: curl https://seu-dominio/api/debug/mark-paid

## A cada deploy
- [ ] npm test passa sem erros
- [ ] npx tsc --noEmit passa
- [ ] Variáveis atualizadas no Railway se houve mudanças

## Rollback
Railway mantém histórico de deploys — use "Rollback" na interface.
Migrations Prisma são aditivas — rollback não reverte o schema automaticamente.
