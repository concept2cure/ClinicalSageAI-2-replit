# OUTSTANDING INTEGRATION QUEUE — Stage 8 Refresh (2026-04-01)

## Repository reality check (live local state)

- Local checkout currently has only one git branch: `work`.
- No `origin` remote is configured in `.git/config`.
- `concept2cure-v2`, `cursor/critical-files-management-f38a`, and PR head refs are **not available as local refs** in this environment.
- Therefore, exact commit-level branch compare and direct PR diff inspection is blocked locally and must be completed with remote git access.

## Cleanup workstream status vs base

Requested compare:
- base: `concept2cure-v2`
- cleanup: `cursor/critical-files-management-f38a`

Current status in this environment:
- **Unverifiable directly** (branches are absent locally).
- Existing repository evidence indicates prior divergence and staged cleanup workstream history, but this cannot replace a live compare for merge gating.

## Open PR intake queue targeting `concept2cure-v2`

> Classification below is deliberately conservative because direct PR diff refs are unavailable in this checkout.

| PR | Title | Branch | Scope (expected) | Touched areas (expected) | Blast radius | Mergeability state (current local proof) | Overlap with cleanup workstream | Recommended disposition |
|---|---|---|---|---|---|---|---|---|
| 335 | fix: fail-close mock and fallback api behaviors | `cursor/...` (remote) | fail-closed mock/fallback routes, tenant/org strictness, demo/mock non-prod gates, AnA fallback hardening | `server/routes/*`, auth context, fallback handlers | Medium | **Proof-blocked locally** (no PR branch ref) | Likely medium (route/auth overlaps) | **Cherry-pick slice** after remote diff review + targeted tests |
| 334 | fix: harden project conversation scope and shell command safety | `cursor/...` (remote) | conversation mutation scoping, command/panel safety, dead command removal | `server/routes/concept2cure.ts`, chat panels, command palette surfaces | Medium/High | **Proof-blocked locally** | Likely high (shell/workspace surfaces) | **Split PR** (server scope fixes first; UI surface only if shell-safe) |
| 333 | fix: hard fail closed governed harness bypass and export gaps | `cursor/...` (remote) | governed upload/export fail-close, artifact consequence enforcement | `server/routes/authoring-actions.ts`, governed services/routes | High-value / Medium risk | **Proof-blocked locally** | Likely high with governed workspace hardening | **Cherry-pick governed fail-close slice** before beta only after route-level proof |
| 332 | refactor: forensic system-wide pathway cleanup — remove ~143,700 lines of dead code | `cursor/...` (remote) | giant deletion sweep across system | unknown until remote diff loaded | **Very high** | **Not mergeable as whole PR** | Unknown/high by size | **Reject as whole; rescue only tiny proven slices post-RC unless urgent** |

## Intake notes

1. PR 335 and PR 333 are potentially beta-positive only if their fail-closed behavior is shown on real governed routes (not dead or fallback paths).
2. PR 334 likely contains both high-value safety corrections and user-surface drift risk; must be split by behavior.
3. PR 332 is treated as a deletion quarry, never as a direct merge candidate.

