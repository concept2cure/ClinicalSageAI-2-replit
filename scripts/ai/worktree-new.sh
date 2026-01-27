#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <name> [base-branch]"
  exit 1
fi

NAME="$1"
BASE="${2:-main}"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORKTREES_DIR="$ROOT/.worktrees"

mkdir -p "$WORKTREES_DIR"

# Ensure base branch is up to date
git -C "$ROOT" fetch origin "$BASE"

# Create worktree
git -C "$ROOT" worktree add "$WORKTREES_DIR/$NAME" "origin/$BASE"

echo "Created worktree at $WORKTREES_DIR/$NAME"
