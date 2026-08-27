#!/usr/bin/env bash
set -euo pipefail
# Anchor on the repo root so the suite works from any cwd, not only via npm run.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
SCRIPT=scripts/ops/dr-restore-drill.sh
APP_LOCAL=DR_APP_DATABASE_URL=postgresql://c2c_dr_app@localhost/c2c_dr_restore
expect_refusal() {
  # A refusal is the drill's own die() ('DR restore drill refused: …', exit
  # 64), not merely any non-zero exit — a crash (syntax error, missing tool)
  # must fail the suite, not count as a guardrail firing.
  local out rc=0
  out=$("$@" 2>&1 >/dev/null) || rc=$?
  if [[ $rc -eq 0 ]]; then echo "expected guardrail refusal" >&2; exit 1; fi
  if [[ $rc -ne 64 || $out != *"DR restore drill refused:"* ]]; then
    echo "expected a guardrail refusal (exit 64), got exit $rc: $out" >&2; exit 1
  fi
}
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@db.example/production DR_TARGET_DATABASE_URL=postgresql://u@db.example/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@db.example/postgres DR_APP_DATABASE_URL=postgresql://c2c_dr_app@db.example/c2c_dr_restore "$SCRIPT" --check-guardrails
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@localhost/c2c_dr_same DR_TARGET_DATABASE_URL=postgresql://u@localhost/c2c_dr_same DR_TARGET_ADMIN_URL=postgresql://u@localhost/postgres "$APP_LOCAL" "$SCRIPT" --check-guardrails
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@localhost/not_safe DR_TARGET_DATABASE_URL=postgresql://u@localhost/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@localhost/postgres "$APP_LOCAL" "$SCRIPT" --check-guardrails
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@localhost/c2c_dr_source DR_TARGET_DATABASE_URL=postgresql://u@localhost/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@other-host/postgres "$APP_LOCAL" "$SCRIPT" --check-guardrails
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@localhost/c2c_dr_source DR_TARGET_DATABASE_URL=postgresql://u@localhost/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@localhost/postgres DR_APP_DATABASE_URL=postgresql://wrong_role@localhost/c2c_dr_restore "$SCRIPT" --check-guardrails
expect_refusal env DR_SOURCE_DATABASE_URL=postgresql://u@lab-db/c2c_dr_source DR_TARGET_DATABASE_URL=postgresql://u@lab-db/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@lab-db/postgres DR_APP_DATABASE_URL=postgresql://c2c_dr_app@lab-db/c2c_dr_restore "$SCRIPT" --check-guardrails
override_audit=$(env DR_SOURCE_DATABASE_URL=postgresql://u@lab-db/c2c_dr_source DR_TARGET_DATABASE_URL=postgresql://u@lab-db/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@lab-db/postgres DR_APP_DATABASE_URL=postgresql://c2c_dr_app@lab-db/c2c_dr_restore DR_ALLOW_NON_EPHEMERAL=I_ACKNOWLEDGE_DESTRUCTIVE_DRILL DR_OVERRIDE_TICKET=WO-04-TEST "$SCRIPT" --check-guardrails 2>&1 >/dev/null)
[[ $override_audit == *"AUDIT non-ephemeral override ticket=WO-04-TEST"* ]] || { echo 'override audit record missing' >&2; exit 1; }
env DR_SOURCE_DATABASE_URL=postgresql://u@localhost/c2c_dr_source DR_TARGET_DATABASE_URL=postgresql://u@localhost/c2c_dr_restore DR_TARGET_ADMIN_URL=postgresql://u@localhost/postgres "$APP_LOCAL" "$SCRIPT" --check-guardrails >/dev/null
echo 'DR guardrail tests passed'
