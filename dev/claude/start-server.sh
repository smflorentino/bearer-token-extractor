#!/usr/bin/env bash
# Starts the dev server in the background and waits for it to be ready.
# Usage: dev/claude/start-server.sh
#
# Output: READY | ALREADY_RUNNING | ERROR

set -euo pipefail

PORT=3000
TIMEOUT=10

if curl -s -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
  echo "ALREADY_RUNNING: http://localhost:${PORT}"
  exit 0
fi

cd "$(dirname "$0")/.."
node server.js &>/dev/null &
SERVER_PID=$!

elapsed=0
while [ $elapsed -lt $TIMEOUT ]; do
  sleep 0.5
  elapsed=$((elapsed + 1))
  if curl -s -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
    echo "READY: http://localhost:${PORT} (pid ${SERVER_PID})"
    exit 0
  fi
done

echo "ERROR: Server did not start within ${TIMEOUT}s."
exit 1
