#!/usr/bin/env bash
# Stops the dev server if it's running.
# Usage: dev/claude/stop-server.sh
#
# Output: STOPPED | NOT_RUNNING

set -euo pipefail

PORT=3000
pids=$(lsof -ti :"${PORT}" 2>/dev/null || true)

if [ -z "$pids" ]; then
  echo "NOT_RUNNING: No process on port ${PORT}."
  exit 0
fi

echo "$pids" | xargs kill -TERM 2>/dev/null || true
echo "STOPPED: Killed process(es) on port ${PORT} ($(echo "$pids" | tr '\n' ', ' | sed 's/, $//'))"
