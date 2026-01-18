#!/bin/sh
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

git config core.hooksPath "$REPO_ROOT/.githooks"

chmod +x \
	"$REPO_ROOT/.githooks/pre-commit" \
	"$REPO_ROOT/.githooks/post-commit" \
	"$REPO_ROOT/.githooks/pre-rebase"

echo "✅ Git hooks enabled (core.hooksPath=$REPO_ROOT/.githooks)"