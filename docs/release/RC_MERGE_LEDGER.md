# RC Merge Ledger — `rc/beta-candidate-01`

Generated: 2026-04-01

## RC branch cut
- RC branch: `rc/beta-candidate-01`
- Branch cut commit: `d4a24cc0`
- Cut source: `work` (already aligned with prior Stage 8–13 integration line)

## Merge-safe slices included in RC

This Stage 9 assembly did **not** perform a large branch merge because Stage 8 disposition artifacts report prior consolidation onto the same canonical line. RC was created by branch cut + RC-specific evidence additions.

| Slice | Source evidence | Commit(s) on RC line | Why allowed |
|---|---|---|---|
| Canonical shell truth + `/client-portal/*` compatibility fencing | `docs/beta-work/stage-8-beta-release-candidate.md`, `tests/e2e/beta-pulse.e2e.ts` | `7057fc36`, `c8287904`, `a68c749d` | Already validated in Stage 8/9 and aligns with protected shell path. |
| Governed workspace + artifact lifecycle hardening | `docs/proof/RC_BETA_PROOF_PACK.md`, `tests/e2e/workspace-smoke.e2e.ts` | `1fd20c0a`, `09404e48`, `d4a24cc0` | Fail-closed behavior and governed artifact handling are on canonical line and were retained. |
| Auth/DB compatibility stabilization | `docs/beta-work/stage-8-merge-risk-matrix.md`, `docs/proof/KNOWN_ISSUES_LEDGER.md` | `b13af328`, `a68c749d` | Compatibility wrappers preserved; no destabilizing rewrites in RC assembly. |
| Pulse certification + route-policy tests | `docs/beta-work/stage-9-authenticated-pulse-certification.md`, `tests/concept2cure/project-module-route-policy.test.ts` | `67e756e0`, `a796d6c8` | Existing approved pulse coverage kept and extended in this RC stage. |

## Explicit Stage 9 RC additions (this branch)
- `tests/e2e/rc-beta-path.e2e.ts`
- `scripts/seed/rc-beta-seed.ts`
- Release and testing evidence docs listed in this stage packet.

## Explicitly deferred from RC

| Deferred item | Reason deferred | Status |
|---|---|---|
| Giant deletion waves (including any PR-332-like deletion bundle) | Not explicitly approved for Stage 9 merge-safe intake; too much blast radius for first RC candidate | Deferred |
| Full monolith decomposition (`ZenApp.tsx`, `ProjectWorkspaceShell.tsx`, `server/index.ts`) | Protected organs; Stage 9 allows hardening proof, not deep rewrite | Deferred |
| Legacy route museum cleanup beyond existing fences | Non-blocking for human beta-safe path, but risky for RC timing | Deferred |
| Broad new UI module promotion | Violates RC scope and beta-safe navigation constraints | Deferred |

## Blocked from RC promotion right now
- Full repository typecheck green state (known pre-existing failures).
- Full live browser proof in this environment without a running app+seeded DB process.
