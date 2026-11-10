# RBM generating actor and recorded-risk integrity

Plan: F1. Launch workstream W1 / document and governed evidence continuity (D2).
Base inspected: `f9631c065af8760d8b879232385fb94663d19a24`.

## What already exists

- `server/services/rbm/rbm-actuator.ts` owns the read-only RACT derivation and the persisted monitoring-plan derivation. The read reports missing or unknown overall risk as null; the write currently substitutes `medium`. It inserts `created_by`, but its optional input allows null.
- `server/routes/mdx-rbm.ts` mounts the existing generation and signed approval endpoints. Generation rechecks project access on its transaction but drops the authenticated actor when calling the actuator. The approval route independently reauthenticates, checks authority, rejects a known author's self-approval, persists the exact signature and archives the prior version atomically. Historical null authors are explicitly reported as unknown; this repair does not invent their identities.
- `server/services/rbm/rbm-access.ts` admits the current authenticated organization member and exact project, and rechecks governed write access. `server/db/requestDb.ts` supplies the existing request-pinned connection adapter already used by RBM approvals.
- `server/services/ana/AnaToolExecutor.ts`'s `generate_rbm_plan` calls the same read-only derivation and refuses an unrecorded overall risk. It remains read-only in this slice.
- `client/src/concept2cure/v2/surfaces/RbmSurfacesB.tsx` already calls the generation route from the existing monitoring work area. No surface or route is added.
- Existing tests cover derivation (`rbm-actuator.test.ts`), current project admission, signed records, and real SQL/signature rollback through PGlite (`rbm-approval-signature.pglite.test.ts`). The latter is not native PostgreSQL concurrency or RLS evidence.

Discovery used `rg` for RBM/RACT/monitoring, generation callers, author attribution, approval, and missing-risk fallbacks across routes, services, AnA and client paths. A bounded deleted-history search (`git log --all --diff-filter=D -n 6` on RBM path aliases) found prior shell/legacy cleanup (`2895218b8`, `15da8159e`); the current route/actuator remain the canonical implementation. No deeper `AGENTS.md` exists in the inspected server/client/shared/tests paths.

## Repair contract

1. A newly generated plan retains the verified generating actor, never a caller-supplied author or null fallback.
2. An approved RACT without a recognized recorded overall risk cannot generate a strategy or persist a plan/actions. The route returns the specific missing-risk refusal.
3. Generation uses the request-pinned database client and retains current project/write admission and transactional rollback.
4. The existing signature ceremony and honest historical unknown-author behavior stay intact. A new plan's author cannot approve their own plan; a different qualified signer can.

## Validation

Fresh red execution reproduced 14 failures with 93 passes (`red.log`). Fresh repaired execution passed 165 cases across the actuator, approval-signature SQL, current-project admission, signed-record and access suites (`green.log`). The invalid-actor contract was finalized as a typed refusal rather than an exception; both versions refuse the same invalid actors before querying. The route tests prove the actual generating actor is persisted despite a spoofed body field, self-approval fails without a signature, and an independent signer succeeds.

These are focused component and PGlite checks, not native RBM concurrency or complete application qualification. Full repository publication gates are separate. Prior-turn unpublished files and logs were not recovered from the reset executor and are not counted.
