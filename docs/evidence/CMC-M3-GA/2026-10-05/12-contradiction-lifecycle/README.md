# The contradiction sweep keeps what people decided; resolving is a governed act

Row **D2** (with D5 §11.10(e)). Discovery map 2026-10-04 findings:
`cmc-contradiction-sweep-erases-resolutions` and `contradiction-lifecycle` (P1).

## The defects

1. **Every sweep erased every resolution.** The sweep (`POST
   /module3-os/contradictions/:projectId`) ran `DELETE FROM cmc_contradictions`
   for the program and re-inserted what it detected, all `open`. A critical
   finding QA had resolved came back open on the next sweep and blocked section
   approval again. Its resolution note was left orphaned in the provenance log.
2. **Resolving was not a governed act.** `PATCH /contradictions/:id/resolve`
   needed no role. It took a 3-character note, recorded the actor as the raw
   request user or `'system'`, and wrote no audit row. It also resolved a
   finding already resolved.

## The fix

**`server/services/cmc/contradiction-lifecycle.ts`** holds both changes.

**The sweep now reconciles.** A finding is identified by its type and its
details. The details name the records and values in conflict, so the same
conflict over the same data is the same finding:

| Stored | Detected now | Result |
|---|---|---|
| open | yes | kept open, once (severity, sections and reviewers refreshed) |
| resolved | yes | **kept resolved**: the data it was resolved against has not changed |
| — | yes, new details | inserted open. Changed data never inherits a resolution |
| open | no | removed: the conflict is gone from the data |
| resolved | no | kept, as the record of the decision |

It runs in the caller's transaction. Rows are locked `FOR UPDATE`, and another
program's findings are untouched.

**`resolveContradiction`** governs resolution:

- it needs a governed reason (`requireGovernedReason`: 8 characters, not a
  placeholder), and gives 422 `REASON_REQUIRED` otherwise;
- it refuses a finding already resolved (409) and another organisation's (404);
- it writes the status, the provenance event (note, severity, the person's id)
  and a chained audit row (`cmc.contradiction.resolve`) in one transaction.

**Route.** `PATCH /contradictions/:id/resolve` sits behind
`requireEditorAccess`, so a viewer gets 403. The actor is
`governedActorId(req)`. A refusal returns its own status and sentence, with
`field: 'resolutionNote'`.

**Board.** The resolve form states the reason floor, and that a later sweep keeps
the resolution while the data stays the same.

## Red, then green

- **Service, on PGlite** (`contradiction-lifecycle.pglite.test.ts`, 7 tests).
  The reconciliation table above, and the governed resolution: the status, the
  provenance and the audit row under the resolver's id; no reason refused with
  nothing changed; already resolved; another organisation's.
- **Route** (`module3GovernedActs.test.ts`). A viewer is refused before
  anything is resolved. A member resolves under their own id with their note.
  The service's refusal is returned with its status.
- **Staff simulation, real server.** New step 12c re-runs the sweep after QA's
  step 12b resolutions.
  - On trunk code (`red-simulation-before.txt`), **2 open again, 0 still
    resolved (of 2)**. The harm cascaded: with the critical findings reopened,
    the export gate refused, placement into the IND failed, and the eCTD
    compile rendered nothing. The run scored 125 passed, 6 failed.
  - With this change (`green-simulation-after.txt`), **2 still resolved, none
    reopened**, and the run scores 131 passed, 0 failed.
- **Wider runs.** The CMC services, all CMC route suites and the board's client
  writes pass: 56 files, 606 tests.
