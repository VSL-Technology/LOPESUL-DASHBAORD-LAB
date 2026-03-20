# 🔧 Troubleshooting - Conexão com Banco de Dados

## ❌ Erro Atual: "Can't reach database server at nozomi.proxy.rlwy.net:45679"

Isso significa que a aplicação **não consegue conectar ao banco Railway**.

### 🔍 Causas Possíveis

1. **Banco Railway offline** - Verificar no https://railway.app/dashboard
2. **Sem acesso à Railway** - Firewall, VPN, ou IP bloqueado
3. **Credenciais expiradas** - URL ou senha mudaram
4. **Problema de rede** - ISP bloqueando, localização geográfica

### ✅ Soluções

#### **Opção A: Usar PostgreSQL Local (Recomendado)**

**1. Instalar PostgreSQL** (macOS):
```bash
brew install postgresql@15
brew services start postgresql@15
```

**2. Criar banco local**:
```bash
createdb lopesul_dev
```

**3. Atualizar `.env.local`**:
```env
DATABASE_URL="postgresql://postgres@localhost:5432/lopesul_dev"
```

**4. Aplicar migrations e criar usuário**:
```bash
npx prisma migrate deploy
node scripts/criar-usuario-teste.js
```

**5. Iniciar servidor**:
```bash
npm run dev
```

---

#### **Opção B: Restaurar Banco Remoto (Produção)**

Se você tem acesso via Railway Dashboard:

**1. Copiar URL exata** da Railway:
   - Acesse: https://railway.app/dashboard
   - Vá para: `lopesul-dashboard-lab` → `PostgreSQL` → Connect
   - Copie a URL completa

**2. Atualizar `.env`**:
```env
DATABASE_URL="postgresql://postgres:SEU_PASSWORD@HOST:PORT/railway"
```

**3. Testar conexão**:
```bash
npx prisma db execute --stdin <<'EOF'
SELECT 1 as test;
EOF
```

**4. Se funcionar, criar usuário e iniciar**:
```bash
node scripts/criar-usuario-teste.js
npm run dev
```

---

#### **Opção C: Usar Docker Compose** (Mais rápido)

**1. Criar `docker-compose.yml`**:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: lopesul_dev
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**2. Executar**:
```bash
docker-compose up -d
```

**3. Atualizar `.env.local`**:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lopesul_dev"
```

**4. Aplicar e rodar**:
```bash
npx prisma migrate deploy
node scripts/criar-usuario-teste.js
npm run dev
```

---

### 📋 Checklist de Debug

- [ ] Verificar `.env` ou `.env.local` tem `DATABASE_URL` correto
- [ ] Testar ping no host: `ping nozomi.proxy.rlwy.net` (se usando Railway)
- [ ] Verificar se banco está rodando: `lsof -i :5432` (local)
- [ ] Confirmar credenciais: usuário, senha, database
- [ ] Limpar Prisma cache: `rm -rf node_modules/.prisma`
- [ ] Regenerar cliente: `npx prisma generate`

---

### 🎯 Recomendação para Desenvolvimento

Use **PostgreSQL Local** (Opção A):
- ✅ Funciona offline
- ✅ Sem latência
- ✅ Fácil resetar dados
- ✅ Mais rápido

Para **Produção**: Use Railway com URL atualizada da dashboard.

---

### 📞 Próximos Passos

1. Escolha uma opção (A, B, ou C)
2. Siga os passos
3. Execute: `npm run dev`
4. Acesse: `http://localhost:3000`
5. Login com: `admin@lopesul.com.br` / `Admin@123456`

Se ainda tiver problemas, execute:
```bash
npx prisma doctor
```
