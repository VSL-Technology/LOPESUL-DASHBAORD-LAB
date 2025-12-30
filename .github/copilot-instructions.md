## Lopesul Dashboard — Copilot instructions

Short, actionable guidance for AI coding agents working in this repository.

- Focus: a Node/Next.js backend + vanilla frontend that integrates with Mikrotik devices and Pix payments. Primary concerns are reliability of router commands, database state (Prisma/Postgres), and many maintenance scripts in the repo root.

Key files and entry points
- `README.md` — high-level project overview and deployment hints (Railway, Vercel).
- `public/redirect.html` — captive portal / redirect page used by hotspots.
- `prisma/` and `prisma/schema.prisma` (if present) — DB schema and migrations; prefer using Prisma migrations for schema changes.
- `pages/api/**` or `api/` — Next.js API routes (backend logic, webhooks). Search for `webhook` and `pix` in repo when modifying payment flows.
- Root maintenance scripts (lots of `*.js`, `*.sh`, `*.mjs`) — examples: `criar-hotspot-agora.js`, `criar-dispositivo-hotspot-06.js`, `fix-redirect-variables.js`, `check-hotspot-config.mjs`, `CONFIGURAR_MIKROTIK.rsc`. These are authoritative for operational patterns (how we call Mikrotik, expected CLI sequences).

Conventions and patterns to follow
- Language and naming: many scripts and comments are in Portuguese; keep messages/logs consistent and preserve existing naming when adding files (use Portuguese for new operational scripts unless asked otherwise).
- Router interactions: use the existing `node-routeros` style approach (see `create-redirect-mikrotik.js`, `exec-mikrotik.sh`) — maintain the same connection/session patterns and error handling style used across scripts.
- One-off scripts: repository contains many single-purpose scripts for troubleshooting and migration. Prefer adding a new script in root for operational tasks rather than changing large app runtime behavior unless it's a real feature.
- Minimal frontend: frontend pages use plain HTML/vanilla JS. Avoid adding heavy frameworks to captive portal pages; keep payload small and simple.

Developer workflows (what works here)
- Install deps: standard Node flow (e.g., `npm install`). Repo README mentions deploy targets; confirm package manager (npm/pnpm/yarn) by checking `package.json` before running commands.
- Dev server: expect Next.js typical commands (`npm run dev`, `npm run build`, `npm run start`) but verify `package.json` scripts. For small script testing, run `node <script>.js` (many scripts are standalone).
- Database: use Prisma CLI (`prisma migrate`, `prisma generate`) if `prisma/` exists. Don’t run migrations on production databases without a backup; the repo includes operational backup scripts (search for `backup` or `fazer-backup-banco.sh`).

Integration points and external services
- Mikrotik routers — numerous scripts and `.rsc` config snippets show how configs are applied. Changes here are high-risk and should be done via the repo’s existing shell/js helpers.
- Pix/payment gateway — webhook handlers live in API routes; changing payment flow requires updating webhook signature validation and DB session logic.
- PostgreSQL (Railway) — connection config likely provided via environment variables. Look for `.env.example` or `process.env` usage.

What to avoid / risk areas
- Do not alter router scripts or `.rsc` files without mirroring the repo’s existing CLI sequence; those are tested operationally and often run live.
- Avoid migrating DB schemas and deploying to prod in the same PR. Use the repo's backup scripts first.

Examples to consult when implementing changes
- To see router handling and error patterns: `create-redirect-mikrotik.js`, `exec-mikrotik.sh`, `fix-mikrotik-redirect.js`.
- To see captive portal behavior: `public/redirect.html` and related redirect scripts `force-hotspot-redirect.js`, `fix-redirect-variables.js`.
- For DB-related flows and payment checks: `corrigir-pedido-pago.js`, `diagnostico-pagamento.sh` and API route files under `pages/api` (if present).

If anything is unclear
- Ask the repo owner which environment/host runs are canonical (Railway, Vercel, or self-hosted) and whether there are environment-specific secrets for Pix/Mikrotik.

Keep edits small and review operational scripts with the team before applying to production devices.
