#!/bin/bash
# Script com comandos para configurar o identity em cada Mikrotik
# Execute estes comandos em cada Mikrotik (via SSH ou Winbox)

echo "🔧 Comandos para configurar identity em cada Mikrotik"
echo ""
echo "⚠️  Execute estes comandos em cada Mikrotik:"
echo ""

IPS=(${MIKROTIK_IPS:-10.200.200.2 10.200.200.3 10.200.200.4 10.200.200.5 10.200.200.6 10.200.200.7})
MIKIDS=("LOPESUL-HOTSPOT-01" "LOPESUL-HOTSPOT-02" "LOPESUL-HOTSPOT-03" "LOPESUL-HOTSPOT-04" "LOPESUL-HOTSPOT-05" "LOPESUL-HOTSPOT-06")
MIKROTIK_USER_VAR="${MIKROTIK_USER:-relay}"
MIKROTIK_PASS_VAR="${MIKROTIK_PASS:-}"

for i in "${!IPS[@]}"; do
  IP="${IPS[$i]}"
  MIKID="${MIKIDS[$i]}"
  
  echo "📡 Mikrotik $IP:"
  echo "   ssh ${MIKROTIK_USER_VAR}@$IP"
  echo "   /system identity set name=\"$MIKID\""
  echo "   /system identity print"
  echo ""
done

echo "💡 Ou execute via SSH direto:"
echo ""

for i in "${!IPS[@]}"; do
  IP="${IPS[$i]}"
  MIKID="${MIKIDS[$i]}"
  
  echo "sshpass -p '$MIKROTIK_PASS_VAR' ssh ${MIKROTIK_USER_VAR}@$IP '/system identity set name=\"$MIKID\" && /system identity print'"
done
