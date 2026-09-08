#!/usr/bin/env bash
set -euo pipefail

ROOT="${DLI_E2E_DIR:-/tmp/dli-e2e}"
VAULT="$ROOT/vault"
FIXTURES="$(dirname "$0")/fixtures"

rm -rf "$VAULT"
mkdir -p "$ROOT/recordings" "$ROOT/frames"
cp -r "$FIXTURES" "$VAULT"

echo "test vault ready: $VAULT"
find "$VAULT" -type f | sort | sed "s|$VAULT/|  |"