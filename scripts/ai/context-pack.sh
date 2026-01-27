#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT_DIR="$ROOT/.ai/context"

mkdir -p "$OUT_DIR"

INCLUDES="server/**,client/src/**,shared/**,docs/adr/**,docs/architecture/**,package.json,tsconfig.json,drizzle.config.ts"

if command -v repomix >/dev/null 2>&1; then
  repomix --root "$ROOT" --output "$OUT_DIR/repomix.json" --include "$INCLUDES"
  echo "Wrote $OUT_DIR/repomix.json"
  exit 0
fi

if command -v gitingest >/dev/null 2>&1; then
  gitingest --repo "$ROOT" --include "$INCLUDES" --output "$OUT_DIR/gitingest.json"
  echo "Wrote $OUT_DIR/gitingest.json"
  exit 0
fi

cat <<'EOF'
Neither repomix nor gitingest is installed.
Install one of the following:
- npm i -g repomix
- pip install gitingest
EOF

exit 1
