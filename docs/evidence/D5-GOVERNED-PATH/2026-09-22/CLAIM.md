# Claim: D5, governed changes on the canonical path

**Row:** D5, Part 11 evidence.

**Source:** the four critical findings of the 2026-09-22 weekly review
(`docs/evidence/reviews/2026-09-22/README.md`, rows P1, T1, P2, P3).

**Evidence to be filed here:** one README per fix. Each shows the defect
reproduced by a test that fails first, then the fix, then the same test passing.

| # | Finding | Files this claim touches |
|---|---|---|
| P1 | Protocol finalize and review disposition are ledgered as `sign` with no signature ceremony | `server/routes/protocol-development.ts`, `server/routes/protocol-reviews.ts`, `server/services/governance/separation-of-duties.ts` (additive: a protocol authorship case), `client/src/concept2cure/v2/surfaces/ProtocolRegisterForms.tsx`, `ProtocolDevWorkspace.tsx` |
| T1 | Task ledger writes are best-effort with their outcome discarded | `server/routes/taskManagement.routes.ts`, `server/services/tasking/task-audit.ts`, `scripts/ci/discarded-audit-write-baseline.json` (shrink only) |
| P2 | QMP create / activate / delete are unaudited | `server/routes/quality-management-api.ts` (the `/plans` routes), `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx` |
| P3 | Contradiction resolve is unaudited, and the UI shows an invented resolver | `server/services/contradiction-engine-service.ts` (`transitionReviewState`), `server/routes/assumption-decision-contradiction.ts` (the review route), `client/src/concept2cure/v2/surfaces/Inconsistency.tsx` |

`server/routes/c2c/actions.ts` is reused, not edited. The canonical ceremony
(`verifyReauth`, `assertSignerIsNotAuthor`, `writeMutation` with a caller-owned
client) is already exported, apart from the SoD check, which is imported from its
own module.

No new capability; each fix makes an existing launch-catalog action do what it
already claims.
