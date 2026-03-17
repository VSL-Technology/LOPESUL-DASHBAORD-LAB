## Lopesul Dashboard — Copilot instructions
## Lopesul Dashboard — Instruções rápidas para agentes de IA

Curto e direto: este repositório é um backend Node/Next.js + frontend minimalista (HTML/vanilla JS) que opera hotspots Mikrotik e processa pagamentos Pix. Priorize segurança das operações em roteadores, integridade do banco (Prisma/Postgres) e scripts operacionais no root.

Principais pontos (arquitetura & fluxo)
- Frontend mínimo: `public/redirect.html` e páginas estáticas servem como captive portal.
- Backend Next.js: rotas em `pages/api/**` implementam webhooks (Pix) e endpoints de gestão.
- Scripts operacionais: muitos arquivos JS/SH no root aplicam configurações Mikrotik ou fazem manutenção — trate-os como código operacional (runbook).
- Banco: Prisma + Postgres. Migrations em `prisma/` e backups com scripts como `fazer-backup-banco.sh`.

Entrypoints e arquivos de referência
- `README.md` — visão geral e deploys (Railway/Vercel).
- `prisma/schema.prisma`, `prisma/` — leia antes de tocar no esquema.
- `public/redirect.html`, `force-hotspot-redirect.js`, `fix-redirect-variables.js` — captive portal flows.
- `create-redirect-mikrotik.js`, `exec-mikrotik.sh`, `CONFIGURAR_MIKROTIK.rsc` — padrões de execução e sequência de CLI para Mikrotik.

Convenções específicas do projeto
- Idioma: mensagens/commits e novos scripts operacionais devem ser em Português.
- Scripts one-off: adicione scripts operacionais no root (não mude runtime do app sem necessidade).
- Conexão com Mikrotik: siga o padrão node-routeros usado pelos scripts; preserve abertura/fechamento de sessão e retries.

Fluxos de trabalho importantes (comandos práticos)
- Instalar dependências: `npm install` (confirme em `package.json`).
- Dev Next.js: `npm run dev` / `npm run build` / `npm run start` (verifique scripts). 
- Testar scripts operacionais: `node criar-hotspot-agora.js` ou `bash criar-dispositivo-hotspot-06.sh` em ambiente de staging.
- Prisma: `npx prisma generate` e `npx prisma migrate dev` — NUNCA rodar migrations em produção sem backup (`fazer-backup-banco.sh`).

Integrações e riscos
- Mikrotik: mudanças em `.rsc` e scripts de roteador são de alto risco; sempre validar sequências com `exec-mikrotik.sh` e preferir scripts existentes como modelo.
- Pix: webhooks estão em `pages/api/**` — manter verificação de assinatura e consistência com o modelo de pedidos no DB.
- Variáveis: procure `.env.example` e `process.env` no código; testes locais devem usar variáveis de ambiente seguras.

Boas práticas operacionais (curtas)
- Faça backup do banco antes de alterar Prisma/migrations.
- Prefira criar scripts de manutenção específicos no root em vez de alterar fluxo de produção.
- Ao modificar fluxo de captive portal, verifique `public/redirect.html` e `fix-redirect-variables.js` para compatibilidade.

Arquivos para consultar quando em dúvida
- Router patterns: `create-redirect-mikrotik.js`, `fix-mikrotik-redirect.js`, `exec-mikrotik.sh`.
- Pagamentos/DB: `corrigir-pedido-pago.js`, `diagnostico-pagamento.sh`, `prisma/`.

Se precisar de mais contexto
- Pergunte quem é o host canônico (Railway/Vercel) e detalhe qual ambiente (prod/staging) para executar scripts de rede.

-- Fim (peça feedback para ajustar exemplos ou adicionar comandos específicos de deploy)
