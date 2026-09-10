#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and fill the local secrets." >&2
  exit 1
fi

# Export every .env value so Spring can resolve ${LIVEKIT_API_SECRET}, etc.
set -a
source .env
set +a

./mvnw -q spring-boot:run -Dspring-boot.run.arguments=--server.port="${SERVER_PORT:-8091}"
