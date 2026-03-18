#!/bin/bash

URL="http://localhost:3000/api/relay/health-proxy"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $URL)

if [ "$STATUS" != "200" ]; then
  mkdir -p /opt/lopesul/logs
  echo "RELAY DOWN $(date)" >> /opt/lopesul/logs/relay.log
fi
