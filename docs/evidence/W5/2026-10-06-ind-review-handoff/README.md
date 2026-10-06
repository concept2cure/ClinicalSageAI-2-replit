# W5 / D2–D7 — IND review handoff repair (2026-10-06)

## Existing-build finding and repair

The Review board already reads authoring_reviews and authoring_workflow_steps.
Formal POST /api/authoring/docs/:docId/submit previously wrote workflow steps,
IN_REVIEW state and the SUBMIT audit independently. An audit failure could leave
an incomplete review. These writes now use the existing transaction helper and
lock the tenant-scoped document; audit failure rolls everything back.
Empty or malformed workflows are refused before transition. A second ordinary
submit cannot create another workflow after the first has transitioned the doc.

The optional canonical projection previously depended on a client integer
project_id, even though the working document records client_program_id. The
bridge now checks that recorded program using programInOrganization and requires
exactly one projects.regulatory_program_id relationship in the same organization.
A client hint cannot override it. Unlinked legacy documents may use only a
verified tenant-owned legacy hint. No project is created or inferred from a name.
Unavailable, deleted, foreign, absent or ambiguous anchors do not authorize a write.
Positive safe integer project and actor identities and a person's stated reason
remain required. Internal driver errors are logged, not returned to clients.

## Existing API receipt and recovery

The existing submit response retains success, workflowId, steps and canonical.
It also reports reviewSubmitted and workflowReused. canonical includes bridged,
retryable, a controlled reason and, on confirmation, projectId, artifactId,
version and contentHash. Review success does not imply projection success.

POST to the same endpoint with retry_canonical: true and the person's reason
checks the existing IN_REVIEW workflow and attempts its optional projection.
It does not insert steps or another SUBMIT audit. A draft, missing/foreign
record or review without steps cannot use this retry. A projection receipt marked
unconfirmed is not evidence that nothing was saved: the existing spine can fail
in a derived post-commit refresh. Its existing content-hash deduplication applies;
this repair does not promise universal idempotency across title changes.

## Validation

Before implementation, the focused two-file regression run had 7 failures and
19 passes. After implementation and additional real SQL coverage, 65 tests passed
across 7 files:

- server/services/ana/__tests__/authoring-canonical-bridge.test.ts
- server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts
- server/services/ana/__tests__/document-spine.test.ts
- server/services/ana/__tests__/document-spine.pglite.integration.test.ts
- server/routes/__tests__/authoring-atomic-mutations.test.ts
- server/routes/__tests__/authoringApprovalNoWorkflow.test.ts
- tests/golden-journeys/ind-authoring.journey.test.ts

Run with NODE_OPTIONS=--max-old-space-size=4096 npx vitest run followed by those
seven paths. The audit rollback test uses a real PostgreSQL trigger in PGlite to
reject SUBMIT, then verifies draft state, absent workflow ID and absent steps.
Destination tests execute real queries for tenant ownership, stored program
linkage, foreign/deleted programs, ambiguity, missing linkage and lookup failure.
The retry fixture authenticates UUID actors; it proves workflow reuse and an
honest blocked receipt, not a successful production canonical write.

npm run build passed. ci:eslint-ratchet -- --since origin/concept2cure-v2 passed
with no new warnings. ci:program-ownership-single-source, ci:check-test-imports
and ci:gateway-bypass passed. git diff --check passed.
Full and beta TypeScript gates remain GitHub CI gates; no local full type-check
success is claimed because this workspace previously exhausted its memory.

## Boundaries

No new production dependency, model, table, store or endpoint. No model-provider
call or client data transfer is introduced. The working review remains
independent from its optional canonical projection. No existing UI caller of the
formal submit endpoint was found; this is API recovery, not a new recovery button.
Unresolved legacy linkage and UUID-to-numeric actor identity remain visible
blockers. Peer-review request routes remain separate and unchanged. This does
not qualify live provider use, tenant data, reviewer approval, deletion UI/API
enforcement, or an entire IND submission. No production deployment is claimed.


## CI follow-up

CI for 79bb9fe3495531f19398bfcf4bf3270c16f599fc found four TypeScript errors:
three unknown-row property reads in the new PGlite regression tests and an
inferred union missing the optional reason property in the bridge fallback.
This follow-up declares the resolver outcome shape and explicitly narrows the
test query rows. Baselines, compiler configuration and gates are unchanged.
The original build and runtime test success did not establish type-check success.
