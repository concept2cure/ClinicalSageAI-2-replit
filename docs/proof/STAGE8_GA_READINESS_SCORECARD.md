# Stage 8 GA Readiness Scorecard (Integration-Control Track)

## Scope
This scorecard evaluates GA-readiness **for Stage 8 integration controls** (not full product GA).

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| Canonical state documented | PASS | `docs/integration/CURRENT_CANONICAL_STATE.md` |
| Merge risk map documented | PASS | `docs/integration/MERGE_RISK_MAP.md` |
| Controlled merge-back slices defined | PASS | `docs/integration/MERGE_BACK_PLAN.md` |
| Branch compare automation exists and fails closed | PASS | `scripts/integration/stage8_compare_map.sh` |
| Compare automation is self-tested | PASS | `tests/integration/stage8_compare_map.test.sh` |
| Beta core pulse browser test authored | PASS | `tests/e2e/beta-core-pulse.e2e.ts` |
| Redirect allowlist + deep-link normalization hardening (`computeRedirect`) | PASS | `client/src/concept2cure/auth/redirectUtils.ts` + tests |
| Auth bearer parsing hardening (`authMiddleware`) | PASS | `server/auth.ts` + security test updates |
| Local branch refs available for real compare | BLOCKED | `docs/integration/COMPARE_COMMAND_OUTPUT.txt` |
| Local browser pulse executed | BLOCKED | `docs/proof/BETA_CORE_PULSE_PROOF.md` |

## Remaining blockers to clear before GA-like promotion
1. Fetch/rehydrate `concept2cure-v2` and `cursor/critical-files-management-f38a` refs in a connected repo clone.
2. Run compare preflight and attach full name-status output.
3. Execute `tests/e2e/beta-core-pulse.e2e.ts` in provisioned CI/dev environment with Playwright binaries.
4. Capture and attach screenshot artifact from pulse run.
5. Re-run targeted redirect and auth hardening suites in a toolchain-complete environment.

## Decision
- **Stage 8 integration controls are materially improved and auditable.**
- **GA-level promotion remains blocked on runtime execution evidence and ref availability.**
