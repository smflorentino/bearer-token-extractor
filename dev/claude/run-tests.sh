#!/usr/bin/env bash
# Runs the Playwright test suite.
# Usage: dev/claude/run-tests.sh [extra-playwright-args...]

set -euo pipefail
cd "$(dirname "$0")/.."
exec npx playwright test "$@"
