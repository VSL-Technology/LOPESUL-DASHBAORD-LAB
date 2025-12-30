#!/bin/bash
# Script para verificar o identity de cada Mikrotik
# Isso ajuda a mapear qual mikId cada Mikrotik está enviando

echo "🔍 Verificando identity de cada Mikrotik..."
echo ""

IPS=(${MIKROTIK_IPS:-"10.200.200.2 10.200.200.3 10.200.200.4 10.200.200.5 10.200.200.6 10.200.200.7"})
MIKROTIK_USER_VAR="${MIKROTIK_USER:?Defina MIKROTIK_USER no ambiente/.env}"
MIKROTIK_PASS_VAR="${MIKROTIK_PASS:?Defina MIKROTIK_PASS no ambiente/.env}"

for IP in "${IPS[@]}"; do
  echo "📡 Verificando $IP..."
  
  # Tentar obter o identity via SSH (se tiver acesso)
  IDENTITY=$(sshpass -p "$MIKROTIK_PASS_VAR" ssh -o StrictHostKeyChecking=no "$MIKROTIK_USER_VAR"@$IP '/system identity print' 2>/dev/null | grep 'name:' | awk '{print $2}' || echo "não acessível")
  
  if [ "$IDENTITY" != "não acessível" ]; then
    echo "   ✅ Identity: $IDENTITY"
  else
    echo "   ⚠️  Não foi possível acessar (pode precisar de configuração SSH)"
    echo "   💡 Verifique manualmente no Mikrotik: /system identity print"
  fi
  echo ""
done

echo "💡 Use esses valores para atualizar o MAPEAMENTO_MIKROTIKS no script configurar-todos-dispositivos.js"
