#!/bin/bash

URL="http://localhost:3000/api/health/public"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $URL)

if [ "$STATUS" != "200" ]; then
  mkdir -p /opt/lopesul/logs
  echo "DOWN $(date)" >> /opt/lopesul/logs/health.log
else
  mkdir -p /opt/lopesul/logs
  echo "OK $(date)" >> /opt/lopesul/logs/health.log
fi
