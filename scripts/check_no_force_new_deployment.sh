#!/usr/bin/env bash
# scripts/check_no_force_new_deployment.sh
#
# Refuse merges that re-introduce `--force-new-deployment` into the
# production deploy workflow. The deploy path was hardened to register a
# pinned task-def revision (image @sha256:<digest>) and update the service
# by that revision ARN — that is the only shape that gives ECS / ECR a
# deterministic rollback (redeploy a prior revision ARN). --force-new-
# deployment alone redeploys whatever the current task def happens to
# reference, which can drift if a tag is mutated or if a different actor
# registered a revision between build and deploy. For a 21 CFR Part 11
# system this is a rollback-safety GA-blocker.
#
# Usage: bash scripts/check_no_force_new_deployment.sh

set -euo pipefail

echo "=== ECS Deploy: --force-new-deployment Gate ==="
echo ""

DEPLOY_FILE=".github/workflows/deploy-aws.yml"

if [ ! -f "$DEPLOY_FILE" ]; then
  echo "ℹ️  $DEPLOY_FILE not present — nothing to check."
  exit 0
fi

# Allow occurrences inside comments (so the rationale block can mention
# the flag by name). The grep below only fails on uncommented lines.
OFFENDERS=$(grep -n -- '--force-new-deployment' "$DEPLOY_FILE" \
  | grep -v '^[[:space:]]*#' \
  | grep -v ':[[:space:]]*#' \
  || true)

if [ -n "$OFFENDERS" ]; then
  echo "❌ Found --force-new-deployment in $DEPLOY_FILE:"
  echo "$OFFENDERS"
  echo ""
  echo "This flag was removed because it cannot guarantee a specific image"
  echo "is deployed — it redeploys whatever the current task def references."
  echo "Use the digest-pinned register-then-deploy pattern instead. See the"
  echo "'Register pinned task definition revision' step for the template."
  exit 1
fi

echo "✅ deploy-aws.yml uses pinned task-def revisions, not --force-new-deployment."
