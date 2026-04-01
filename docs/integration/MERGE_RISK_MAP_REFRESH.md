# MERGE RISK MAP REFRESH — Stage 8 (2026-04-01)

## Evidence model and constraints

This map uses:
- Live code surfaces in current checkout.
- Stage evidence docs already present in `docs/beta-work` and `docs/reports`.
- Requested PR 332/333/334/335 scopes.

Constraint:
- No remote PR refs are available locally, so PR-specific file attribution is a risk forecast, not a diff-certified map.

## Tier definitions

- **Tier 1** — do not merge blindly
- **Tier 2** — requires proof-first slice
- **Tier 3** — likely safe in controlled landing

## Risk file map

| File | Touch provenance class | Why risky now | Tier | Control action |
|---|---|---|---|---|
| `client/src/App.jsx` | base + cleanup + PR (forecast) | Canonical alias/fence behavior (`/`, `/login`, `/auth`, `/sign-in`, `/client-portal/*`) | Tier 1 | Protect file; validate with route tests only; no direct surgery in Stage 8 |
| `client/src/concept2cure/ZenApp.tsx` | base + cleanup + PR (forecast) | Core shell/workspace orchestration and beta path continuity | Tier 1 | Protected organ; avoid modification in this stage |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | base + cleanup + PR (forecast) | Workspace truth, placement, return continuity | Tier 1 | Protected organ; only test-level proof allowed |
| `server/index.ts` | base + cleanup + PR (forecast) | Global route mount + auth gating; high blast if drifted | Tier 1 | Protected organ; no Stage 8 rewrite |
| `server/routes/concept2cure.ts` | cleanup + PR (forecast) | Conversation scope, project mutation, governed hooks | Tier 1 | Intake only as narrow cherry-picks with auth + workspace tests |
| `server/routes/authoring-actions.ts` | cleanup + PR (forecast) | Governed artifact write consequence; beta compliance critical | Tier 1 | Validate governed fail-close tests before merge |
| `server/routes/chat.ts` | cleanup + PR (forecast) | AnA fallback, tenant context, thread/org hardening | Tier 2 | Intake only after thread/org mismatch and fallback behavior tests |
| `server/middleware/auth.ts` | cleanup + PR (forecast) | JWT + org checks; compatibility risk across callers | Tier 2 | Preserve compatibility aliases; run auth-db smoke tests |
| `server/auth.ts` | cleanup + PR (forecast) | Session/org membership authoritative path | Tier 2 | No broad edits; only minimal gating fixes if required |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | cleanup + PR (forecast) | command/panel safety and dead-surface drift | Tier 2 | Intake only with route-surface truth checks |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | cleanup + PR (forecast) | top-level nav dead-end risk | Tier 2 | Validate with beta pulse navigation checks |
| `client/src/concept2cure/router/ZenRouter.tsx` | base + cleanup | canonical route policy in place | Tier 2 | Keep as route authority; avoid speculative PR edits |
| `tests/e2e/beta-core-pulse.e2e.ts` | cleanup only (new) | proof harness | Tier 3 | Land first as test/docs slice |
| `docs/integration/*` | cleanup only (new) | control-tower artifacts | Tier 3 | Land first |

## Stage 8 risk call

- Tier 1 surfaces must remain protected while intake is decomposed.
- Tier 2 surfaces can be merged only as proof-first slices.
- Tier 3 surfaces (docs/tests) are safe to land immediately to control convergence.

