#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <name>"
  exit 1
fi

NAME="$1"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORKTREES_DIR="$ROOT/.worktrees"

git -C "$ROOT" worktree remove "$WORKTREES_DIR/$NAME"
git -C "$ROOT" worktree prune

echo "Removed worktree: $WORKTREES_DIR/$NAME"
