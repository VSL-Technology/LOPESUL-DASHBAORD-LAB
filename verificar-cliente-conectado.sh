#!/bin/bash
# Script para verificar se cliente está conectado e com acesso liberado
# Uso: ./verificar-cliente-conectado.sh <IP> [MAC]

IP=${1:-"192.168.88.67"}
MAC=${2:-"24:29:34:91:1A:18"}
MIKROTIK_IP="${MIKROTIK_HOST:-${MIKROTIK_IP:-10.200.200.7}}"
MIKROTIK_USER_VAR="${MIKROTIK_USER:?Defina MIKROTIK_USER no ambiente/.env}"
MIKROTIK_PASS_VAR="${MIKROTIK_PASS:?Defina MIKROTIK_PASS no ambiente/.env}"

echo "🔍 Verificando status do cliente..."
echo "   IP: $IP"
echo "   MAC: $MAC"
echo ""

# Verificar no Mikrotik via relay
echo "📡 Verificando no Mikrotik (LOPESUL-HOTSPOT-06)..."
echo ""

# Verificar se IP está na lista paid_clients
echo "1️⃣ Verificando se IP está na lista 'paid_clients':"
sshpass -p "$MIKROTIK_PASS_VAR" ssh -o StrictHostKeyChecking=no "$MIKROTIK_USER_VAR"@"$MIKROTIK_IP" \
  "/ip/firewall/address-list/print where address=$IP and list=paid_clients" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "   ✅ IP encontrado na lista paid_clients"
else
  echo "   ❌ IP NÃO encontrado na lista paid_clients"
fi

echo ""

# Verificar se há IP binding no hotspot
echo "2️⃣ Verificando IP binding no hotspot:"
sshpass -p "$MIKROTIK_PASS_VAR" ssh -o StrictHostKeyChecking=no "$MIKROTIK_USER_VAR"@"$MIKROTIK_IP" \
  "/ip/hotspot/ip-binding/print where address=$IP" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "   ✅ IP binding encontrado"
else
  echo "   ❌ IP binding NÃO encontrado"
fi

echo ""

# Verificar se há sessão ativa no hotspot
echo "3️⃣ Verificando sessões ativas no hotspot:"
sshpass -p "$MIKROTIK_PASS_VAR" ssh -o StrictHostKeyChecking=no "$MIKROTIK_USER_VAR"@"$MIKROTIK_IP" \
  "/ip/hotspot/active/print where address=$IP or mac-address=$MAC" 2>/dev/null

echo ""

# Verificar no banco de dados
echo "4️⃣ Verificando no banco de dados:"
cd /opt/lopesul-dashboard
node -e "
import prisma from './src/lib/prisma.js';

async function main() {
  // Buscar pedidos para este IP ou MAC
  const pedidos = await prisma.pedido.findMany({
    where: {
      OR: [
        { ip: '$IP' },
        { deviceMac: '$MAC' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  console.log('📋 Pedidos encontrados:', pedidos.length);
  pedidos.forEach(p => {
    console.log(\`   - Code: \${p.code}, Status: \${p.status}, IP: \${p.ip}, MAC: \${p.deviceMac}\`);
  });

  // Buscar sessões ativas
  const sessoes = await prisma.sessaoAtiva.findMany({
    where: {
      OR: [
        { ipCliente: '$IP' },
        { macCliente: '$MAC' },
      ],
      ativo: true,
    },
    orderBy: { expiraEm: 'desc' },
  });

  console.log('');
  console.log('📋 Sessões ativas encontradas:', sessoes.length);
  sessoes.forEach(s => {
    console.log(\`   - IP: \${s.ipCliente}, MAC: \${s.macCliente}, Expira: \${s.expiraEm}\`);
  });

  await prisma.\$disconnect();
}

main().catch(console.error);
" 2>/dev/null

echo ""
echo "💡 Se o cliente não aparecer, pode ser que:"
echo "   1. Cliente desconectou do Wi-Fi"
echo "   2. IP mudou novamente (DHCP)"
echo "   3. MAC mudou (privacidade)"
echo "   4. Cliente está em outro ônibus"
