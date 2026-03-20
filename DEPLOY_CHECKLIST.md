# Deploy checklist — Dashboard LOPESUL

## Antes do primeiro deploy
- [ ] Configurar variáveis no Railway (ver .env.example)
- [ ] Provisionar Redis no Railway ou Upstash
- [ ] Executar: npx prisma migrate deploy
- [ ] Confirmar que .env NÃO está no repositório: git ls-files .env

## A cada deploy
- [ ] npm test passa localmente
- [ ] npx tsc --noEmit passa sem erros
- [ ] Variáveis de ambiente atualizadas no Railway se mudaram

## Rollback
- [ ] Railway mantém último deploy ativo — use "Redeploy" na versão anterior
- [ ] Migrations Prisma são aditivas — rollback não reverte schema
