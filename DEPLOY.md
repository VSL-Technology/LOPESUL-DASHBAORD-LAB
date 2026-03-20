# DEPLOY.md

Production deployment (VPS)

Prereqs

- Node.js >= 18, npm, git
- PostgreSQL database and DATABASE_URL
- Public domain (recommended) and reverse proxy (nginx or Caddy)

GitHub Actions (deploy automático)

- Workflow: `.github/workflows/deploy.yml`
- Dispara em `push` na `main` e também manualmente (`workflow_dispatch`, com campo opcional `ref`).
- Configure em **Settings > Secrets and variables > Actions** (prefira Secrets):
  - Obrigatórios: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
  - Opcionais:
    - `VPS_PORT` (default `22`)
    - `VPS_APP_DIR` (diretório do projeto na VPS; se vazio, tenta `/opt/lopesul-dashboard` e depois `/opt/painel-new`)
    - `VPS_DOCKER_COMPOSE_FILE` (arquivo compose; se vazio, tenta `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`)
    - `VPS_DOCKER_PROJECT_NAME` (nome do projeto Docker Compose)
    - `VPS_DOCKER_MIGRATE_SERVICE` (serviço compose para rodar `npm run db:deploy` via `docker compose run --rm`)
    - `VPS_HEALTHCHECK_URL` (se definido, o deploy valida HTTP ao final)
- Fluxo remoto executado na VPS:
  - `git fetch --all --prune`
  - `git reset --hard <sha/ref>`
  - `docker compose config -q`
  - `docker compose down`
  - `docker compose build --no-cache --pull`
  - `docker compose run --rm <service> npm run db:deploy` (somente se `VPS_DOCKER_MIGRATE_SERVICE` estiver definido)
  - `docker compose up -d --remove-orphans`

Environment

1. Copy .env.example to .env (or export as system envs) and set:
   - DATABASE_URL
   - APP_URL (e.g. https://dashboard.example.com)
   - PAGARME_SECRET_KEY
   - MIKROTIK_HOST, MIKROTIK_USER, MIKROTIK_PASS (+ MIKROTIK_PORT/MIKROTIK_SSL if needed)
   - RELAY_URL or RELAY_BASE (if using the relay exec proxy)
   - Optional: `WEBHOOK_SECRET` | `PAGARME_API_KEY` | `PAGARME_BASE_URL` | `STARLINK_*` | `MIKROTIK_TIMEOUT_MS`

Build and run

```bash path=null start=null
# on the VPS, inside the repo directory
npm ci
npm run db:deploy        # applies Prisma migrations
npm run build
PORT=3000 npm start      # binds 0.0.0.0 and respects $PORT
```

Systemd service (Ubuntu)

```ini path=null start=null
[Unit]
Description=Lopesul Dashboard
After=network.target

[Service]
WorkingDirectory=/opt/lopesul-dashboard
Environment=NODE_ENV=production
EnvironmentFile=/opt/lopesul-dashboard/.env
ExecStart=/usr/bin/npm start --silent
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

Nginx reverse proxy

```nginx path=null start=null
server {
  listen 80;
  server_name dashboard.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Webhooks (Pagar.me)

- Set the webhook URL to: https://YOUR_DOMAIN/api/webhooks/pagarme
- Ensure PAGARME_SECRET_KEY (or WEBHOOK_SECRET/PAGARME_API_KEY) matches signature validation in the app

Health checks

- App: GET /api/db-health (DB connectivity)
- Relay: GET {RELAY_URL}/health (if configured)

Upgrade notes

- Before restarting: npm ci && npm run db:deploy && npm run build
- App reads APP_URL in /api/pagamentos/checkout; keep it correct in prod
