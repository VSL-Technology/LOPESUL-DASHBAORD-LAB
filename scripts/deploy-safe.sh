#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/lopesul/apps/dashboard"
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="/opt/lopesul/backups/dashboard"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

REQUIRED_VARS=(
  "MIKROTIK_HOST"
  "MIKROTIK_USER"
  "MIKROTIK_PASS"
  "INTERNAL_API_TOKEN"
)

echo "🚀 Iniciando deploy seguro..."

cd "$APP_DIR"

# =========================
# 🔍 VALIDAR .ENV
# =========================
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ ERRO: .env não encontrado em $ENV_FILE"
  exit 1
fi

echo "🔎 Validando sintaxe do .env..."

if ! bash -n "$ENV_FILE" >/dev/null 2>&1; then
  echo "❌ ERRO: .env com sintaxe inválida"
  exit 1
fi

echo "🔎 Validando variáveis obrigatórias..."

source "$ENV_FILE"

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    echo "❌ ERRO: Variável $VAR não definida no .env"
    exit 1
  fi
done

echo "✅ Variáveis OK"

# =========================
# 💾 BACKUP
# =========================
echo "💾 Criando backup..."

mkdir -p "$BACKUP_DIR"

cp docker-compose.yml "$BACKUP_DIR/docker-compose.$TIMESTAMP.yml" || true

docker image ls --format "{{.Repository}}:{{.Tag}}" | grep dashboard \
  | xargs -r -I {} docker save {} -o "$BACKUP_DIR/image_$TIMESTAMP.tar" || true

echo "✅ Backup criado"

# =========================
# 🔄 ATUALIZAR CÓDIGO
# =========================
echo "🔄 Atualizando código..."

git fetch origin
git reset --hard origin/main

# =========================
# 🧪 PRE-CHECK (opcional)
# =========================
echo "🧪 Rodando checks..."

bash scripts/ci/deny_leaky_errors.sh

# =========================
# 🐳 BUILD + DEPLOY
# =========================
echo "🐳 Subindo containers..."

if docker compose build --no-cache && docker compose up -d; then
  echo "✅ Deploy concluído com sucesso!"
else
  echo "❌ Falha no deploy! Iniciando rollback..."

  docker compose down

  LAST_COMPOSE=$(ls -t "$BACKUP_DIR"/docker-compose.*.yml | head -n 1)

  if [ -f "$LAST_COMPOSE" ]; then
    cp "$LAST_COMPOSE" docker-compose.yml
    docker compose up -d
    echo "⚠️ Rollback realizado"
  else
    echo "❌ Nenhum backup disponível para rollback"
  fi

  exit 1
fi

# =========================
# 🧹 LIMPEZA
# =========================
echo "🧹 Limpando imagens antigas..."

docker image prune -af || true

echo "🎉 Deploy seguro finalizado!"
