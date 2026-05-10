#!/usr/bin/env bash
# Rollback del motor en VPS a un image tag específico.
#
# Uso desde el VPS:
#   cd /opt/fyzon && ./scripts/rollback.sh sha-1234567
#
# Uso remoto desde laptop:
#   ssh deploy@setter.fyzon.es 'cd /opt/fyzon && ./scripts/rollback.sh sha-1234567'
#
# Tags disponibles en el registry:
#   https://github.com/ivannsotoo20/setters-ia/pkgs/container/setters-ia%2Fmotor-agente
#
# Para encontrar el SHA de la versión anterior:
#   git log --oneline apps/motor-agente packages/ | head -5

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <image-tag>"
  echo "Example: $0 sha-1234567"
  echo ""
  echo "Available tags: https://github.com/ivannsotoo20/setters-ia/pkgs/container/setters-ia%2Fmotor-agente"
  exit 1
fi

IMAGE_TAG="$1"

if ! command -v docker &> /dev/null; then
  echo "ERROR: docker not found in PATH"
  exit 1
fi

if ! command -v curl &> /dev/null; then
  echo "ERROR: curl not found in PATH"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Rolling back motor to ${IMAGE_TAG}..."
IMAGE_TAG="${IMAGE_TAG}" docker compose pull motor
IMAGE_TAG="${IMAGE_TAG}" docker compose up -d motor

echo "Waiting 5s for healthcheck..."
sleep 5

echo "Health check:"
if curl -fsS --max-time 10 http://localhost:3001/health; then
  echo ""
  echo "✅ Rollback successful. Motor now running ${IMAGE_TAG}."
  echo "Verify externally: curl https://setter.fyzon.es/health"
else
  echo ""
  echo "❌ Rollback FAILED: motor /health did not return 200."
  echo "Check logs: docker compose logs motor --tail=100"
  echo "Restore previous tag: ./scripts/rollback.sh <previous-sha>"
  exit 1
fi
