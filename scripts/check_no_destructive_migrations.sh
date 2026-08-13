#!/usr/bin/env bash
# scripts/check_no_destructive_migrations.sh
#
# Prevents merging PRs that introduce destructive schema patterns.
# Run this in CI against migration files changed in the PR.
#
# Usage: bash scripts/check_no_destructive_migrations.sh

set -euo pipefail

echo "=== Destructive Migration Pattern Check ==="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Resolving the base ref, and why this is not a one-liner any more.
#
# This used to be:
#
#   FILES=$(git diff --name-only origin/main...HEAD | grep -E '...' || true)
#
# `origin/main` DOES NOT EXIST in this repository — the default branch is
# concept2cure-v2. So `git diff` aborted with
#
#   fatal: ambiguous argument 'origin/main...HEAD': unknown revision
#
# on stderr, produced nothing on stdout, and the pipeline's exit status became
# grep's 1, which `|| true` converted to success. FILES was empty, and the
# script printed
#
#   ✅ No migration files changed in this PR.
#
# and exited 0. Every time. This guard — which blocks DROP TABLE, DROP SCHEMA,
# DISABLE ROW LEVEL SECURITY, DELETE FROM audit.*, and the removal of
# immutability triggers on a 21 CFR Part 11 platform — has never examined a
# single migration.
#
# Demonstrated before changing anything: a migration containing
#   DROP TABLE public.organizations;
#   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
#   DELETE FROM audit.tamper_proof_log;
# passed the old script with exit 0.
#
# So: try the refs that actually exist, in order of specificity, and treat an
# unresolvable base as a HARD FAILURE. A destructive-schema guard that cannot
# tell "nothing destructive changed" from "I never looked" must not choose the
# reassuring one.
# ─────────────────────────────────────────────────────────────────────────────

resolve_base() {
  # 1. Explicit override from the workflow (github.event.pull_request.base.sha),
  #    which is authoritative and needs no fetch.
  if [ -n "${PR_BASE_SHA:-}" ] && git rev-parse --verify "${PR_BASE_SHA}^{commit}" >/dev/null 2>&1; then
    echo "${PR_BASE_SHA}"; return 0
  fi

  # 2. The PR's base branch. Fetch it first — the default checkout is shallow,
  #    so the ref is usually absent rather than merely stale.
  local base_ref="${PR_BASE_REF:-${GITHUB_BASE_REF:-}}"
  if [ -n "$base_ref" ]; then
    git fetch --depth=200 origin "$base_ref" >/dev/null 2>&1 || true
    if git rev-parse --verify "origin/${base_ref}" >/dev/null 2>&1; then
      echo "origin/${base_ref}"; return 0
    fi
    if git rev-parse --verify "FETCH_HEAD" >/dev/null 2>&1; then
      echo "FETCH_HEAD"; return 0
    fi
  fi

  # 3. The remote's default branch, whatever it is called.
  if git rev-parse --verify origin/HEAD >/dev/null 2>&1; then
    echo "origin/HEAD"; return 0
  fi

  # 4. Legacy assumption, kept only because it costs nothing when it is true.
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "origin/main"; return 0
  fi

  # 5. Local history, for a pre-push hook or a manual run.
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    echo "HEAD~1"; return 0
  fi

  return 1
}

if ! BASE_REF="$(resolve_base)"; then
  echo "❌ Cannot resolve a base ref to diff against."
  echo "   Tried: \$PR_BASE_SHA, origin/\${PR_BASE_REF:-\$GITHUB_BASE_REF}, origin/HEAD, origin/main, HEAD~1."
  echo ""
  echo "   Refusing to report success for a scan that never ran. In CI, pass"
  echo "   PR_BASE_SHA/PR_BASE_REF from the pull_request event, or check out"
  echo "   with enough history to resolve a merge base."
  exit 1
fi

echo "Base: ${BASE_REF}"

# Keep the diff separate from the filter, so a git failure cannot be mistaken
# for "no migrations changed" — that conflation is the whole bug above.
if ! DIFF_OUTPUT="$(git diff --name-only "${BASE_REF}...HEAD" 2>&1)"; then
  echo "❌ git diff against ${BASE_REF} failed — the scan did not run:"
  echo "${DIFF_OUTPUT}"
  exit 1
fi

FILES=$(printf '%s\n' "${DIFF_OUTPUT}" | grep -E '^db/migrations/.*\.sql$' || true)

if [ -z "${FILES}" ]; then
  echo "✅ No migration files changed vs ${BASE_REF}."
  exit 0
fi

echo "Checking migration files for destructive patterns:"
for f in $FILES; do
  echo "  - $f"
done
echo ""

# Patterns that indicate destructive operations
# These are blocked by default in regulated environments
BAD_PATTERNS=(
  # Schema destruction
  "DROP TABLE"
  "DROP SCHEMA"
  "DROP VIEW"
  "DROP FUNCTION"
  "DROP TYPE"
  "DROP INDEX"
  
  # Column removal
  "ALTER TABLE .* DROP COLUMN"
  
  # Data destruction in audit/truth tables
  "TRUNCATE"
  "DELETE FROM audit\."
  "DELETE FROM truth\."
  "DELETE FROM prose\.smart_fragment_versions"
  "DELETE FROM prose\.submission_snapshot"
  
  # Updates to immutable tables
  "UPDATE audit\.concomitant_audit_logs"
  "UPDATE audit\.e_signatures"
  "UPDATE audit\.config_bundles"
  "UPDATE prose\.smart_fragment_versions"
  "UPDATE prose\.submission_snapshot_exports"
  "UPDATE truth\.clinical_truth_store SET"
  
  # Disabling RLS
  "DISABLE ROW LEVEL SECURITY"
  "ALTER TABLE .* NO FORCE ROW LEVEL SECURITY"
  
  # Dropping immutability triggers
  "DROP TRIGGER.*trg_no_update_delete"
  "DROP TRIGGER.*trg_no_mutation"
  "DROP TRIGGER.*prevent.*mutation"
)

# Allowed patterns (exceptions that look destructive but are safe)
# These are intentionally designed patterns
ALLOWED_PATTERNS=(
  # NOTE: this one only fires when DROP and BEFORE land on the SAME LINE,
  # because the allowed-check below inspects the matching line in isolation.
  # The idiomatic form spans two lines and is handled by
  # trigger_is_recreated() instead — see there.
  "DROP TRIGGER IF EXISTS.*BEFORE"  # Replacing triggers is OK
  "DROP POLICY IF EXISTS"           # Replacing RLS policies is OK
  "DROP VIEW IF EXISTS"             # Replacing views is OK (views are queryable, not data)
  "DROP INDEX IF EXISTS"            # Replacing indexes is OK
  "DROP FUNCTION IF EXISTS"         # Replacing functions is OK (code, not data) — needed when a return type changes and CREATE OR REPLACE cannot
  "CREATE OR REPLACE"               # Replacing functions/views is OK
  # Explicitly-approved table drop: a `DROP TABLE IF EXISTS` statement that carries a
  # `destructive-approved` marker inline. This is the documented approved-exception
  # mechanism (justify in the migration comments + mark each statement). It exempts ONLY
  # marked DROP TABLE statements; any unmarked DROP TABLE (or other destructive op) is
  # still blocked.
  "DROP TABLE IF EXISTS.*destructive-approved"
)

# ─────────────────────────────────────────────────────────────────────────────
# Is a dropped trigger put back?
#
# The safe, idiomatic, and idempotent way to install a trigger is:
#
#   DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON audit.tamper_proof_log;
#   CREATE TRIGGER trg_prevent_audit_mutation
#     BEFORE UPDATE OR DELETE ON audit.tamper_proof_log
#     ...
#
# PostgreSQL has no CREATE OR REPLACE TRIGGER before 14 and this repo's
# migrations use the drop-then-create form throughout. The ALLOWED_PATTERNS
# entry `DROP TRIGGER IF EXISTS.*BEFORE` was written to permit exactly this,
# but the allowed-check tests only the line the bad pattern matched, and
# `BEFORE` is on the NEXT line. So the idiom is rejected while the property it
# is checked for — "the immutability trigger is still there afterwards" —
# actually holds.
#
# Rather than reformatting migrations onto one line to satisfy a line-based
# matcher, test the real property: the same file re-creates the trigger BY NAME.
# A drop with no matching CREATE is still blocked, which is the case that
# matters — that is a trigger being removed, not replaced.
# ─────────────────────────────────────────────────────────────────────────────
trigger_is_recreated() {
  local file="$1" line="$2"
  local name
  # "148:DROP TRIGGER IF EXISTS trg_x ON audit.y;" -> "trg_x"
  name="$(printf '%s' "$line" \
    | sed -nE 's/.*[Dd][Rr][Oo][Pp][[:space:]]+[Tt][Rr][Ii][Gg][Gg][Ee][Rr][[:space:]]+([Ii][Ff][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss][[:space:]]+)?([A-Za-z0-9_"]+).*/\2/p')"
  [ -z "$name" ] && return 1
  grep -Eiq "CREATE[[:space:]]+TRIGGER[[:space:]]+${name}([[:space:]]|$)" "$file"
}

ERRORS=0
ERROR_DETAILS=""

for f in $FILES; do
  for pattern in "${BAD_PATTERNS[@]}"; do
    # Check if pattern exists in file
    if grep -Eiq "${pattern}" "$f" 2>/dev/null; then
      # Check if it's an allowed exception
      IS_ALLOWED=false

      # Drop-then-recreate of the SAME trigger is a replacement, not a removal.
      if printf '%s' "${pattern}" | grep -Eiq "DROP TRIGGER"; then
        DROP_LINE=$(grep -Ein "${pattern}" "$f" | head -1)
        if trigger_is_recreated "$f" "$DROP_LINE"; then
          IS_ALLOWED=true
        fi
      fi
      for allowed in "${ALLOWED_PATTERNS[@]}"; do
        if grep -Eiq "${allowed}" "$f" 2>/dev/null; then
          # The bad pattern might be part of an allowed pattern, check context
          MATCHING_LINE=$(grep -Ein "${pattern}" "$f" | head -1)
          for allowed_check in "${ALLOWED_PATTERNS[@]}"; do
            if echo "${MATCHING_LINE}" | grep -Eiq "${allowed_check}"; then
              IS_ALLOWED=true
              break
            fi
          done
        fi
      done
      
      if [ "$IS_ALLOWED" = false ]; then
        ERRORS=$((ERRORS + 1))
        MATCHING_LINE=$(grep -Ein "${pattern}" "$f" | head -1)
        ERROR_DETAILS="${ERROR_DETAILS}\n  ❌ $f: ${pattern}\n     Line: ${MATCHING_LINE}"
      fi
    fi
  done
done

if [ $ERRORS -gt 0 ]; then
  echo "❌ DESTRUCTIVE PATTERNS DETECTED!"
  echo ""
  echo "The following potentially destructive operations were found:"
  echo -e "${ERROR_DETAILS}"
  echo ""
  echo "If this is intentional and approved, you must:"
  echo "  1. Add the pattern to ALLOWED_PATTERNS in this script"
  echo "  2. Document the reason in the migration file comments"
  echo "  3. Get explicit approval from a database admin"
  echo ""
  echo "For regulated systems, destructive operations require:"
  echo "  - Written justification"
  echo "  - Data migration/backup plan"
  echo "  - Stakeholder approval"
  exit 1
fi

echo "✅ No destructive migration patterns detected."
echo ""
echo "Checked ${#BAD_PATTERNS[@]} patterns across $(echo "$FILES" | wc -w | tr -d ' ') files."
exit 0
