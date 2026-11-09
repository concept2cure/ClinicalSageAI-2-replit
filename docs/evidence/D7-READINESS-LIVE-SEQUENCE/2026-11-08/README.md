# F1 repair B: readiness answers only for a live sequence (row D7, 2026-11-08)

This is re-plan step 8, from the design `docs/evidence/RIM/2026-11-08-designs/f1-small-repairs-4-8-24.design.md`
(repair B). The coordinating session ordered it after repair A.

## What already exists (RULE 3), re-anchored on the tree

- `assessSequenceDispatchReadiness` (`server/services/ectd/assess-dispatch-readiness.ts`) is the one dispatch verdict
  per sequence (P-33). Its first read, the tenant's sequence, had **no `deleted_at IS NULL`**. A sequence taken out
  by the filed baseline's removal of drafts (`server/services/submission-service/filed-sequence-baseline.ts`) could
  therefore still be assessed, and a complete one was reported ready.
- Every other sequence read beside it already asks for a live sequence: `getSequence` and the locked reads in
  `submission-service.ts`, the leaf reads in this file, and (since repair A) `transitionSequence`'s compare-and-set.
- Its callers, and how each renders the not-found answer:

| Caller | What it does with `NOT_FOUND` |
|---|---|
| `server/routes/submissions.ts` (readiness route) | `fail` → `handleKnownCodeFailure`: 404 with the message |
| `server/routes/ind-lifecycle/sequence.routes.ts`, `submission.routes.ts` | each reads the sequence live first (`getSequence`, `listSequences`), so a removed one is already 404 there; removed in between, `fail` (`ind-lifecycle/shared.ts`) answers 404 with the message |
| `server/mcp/tools/readiness.ts` | `refused(message)`: the message, as a refusal |
| `server/services/ana/AnaToolExecutor.ts` (`assess_dispatch_readiness`) | `{ error, code: 'NOT_FOUND' }` with the message |
| `submission-service.ts` (validate, the freeze and dispatch gate, transmit preflight, transmit Gate 2) | each reads the sequence live first, so it reaches readiness only if the sequence is removed in between; then the routes answer 404 with the message |
| `server/services/projects/schedule-of-events/service.ts` (`observeProjectFilingGate`) | catches every error: `unavailable`, `CANONICAL_DISPATCH_GATE_UNAVAILABLE`. See "Found here" |

`ind-dispatch-snapshot-service.ts`, `ind-cockpit.ts`, `contradiction-resolution-orchestrator.ts` and
`validation-rule-corpus.ts` name the function in comments only.

## The change

- The sequence read adds `isNull(ectdSequences.deletedAt)`.
- A sequence this tenant holds but removed is answered `NOT_FOUND`, by its number: "Sequence 0002 was removed from this
  submission, so it has no dispatch readiness." It is never answered as ready or not ready. A sequence the tenant
  never held keeps the existing "Sequence not found in this organization." Neither says anything about another tenant.
- No migration, no new non-test file, no route or caller change.

## Proof

`server/services/ectd/__tests__/assess-dispatch-readiness.ind-program.pglite.test.ts`, describe "a removed sequence has
no dispatch readiness (F1 repair B)": a complete amendment 0002 is assessed ready, is removed, and is then answered
`NOT_FOUND` by its number.

| File | What it shows |
|---|---|
| `red.txt` | at HEAD `9f4984fa3`: the removed sequence is still assessed (the promise resolves) |
| `green.txt` | every test file naming `assessSequenceDispatchReadiness` or its module: 654 pass. The one failure is `gateway-selection`'s pre-existing AUDIT_UNCONFIRMED case, with the coordinating session |
| `mutation-1-removed-sequence-assessed.txt` | the filter dropped: the case fails as in red. The restored file's sha256 matches the original |

## Found here, not changed

- `projectFilingHeads` (`server/services/projects/schedule-of-events/service.ts`) counts every sequence of the
  project, removed ones included, as a filing head. A project whose only sequence was removed was reported
  `satisfied` or `blocked` from that removed sequence before this repair. It is now reported `unavailable`, which is
  fail-closed but reads as a failed read. The honest answer is that a removed sequence is not a filing head
  (`FILING_TARGET_REQUIRED`): one `AND s.deleted_at IS NULL` in that query. The file is outside this repair's design,
  so the finding and the patch went to the coordinating session.

## Plan

`Plan: F1`, `Completes: server/services/ectd/assess-dispatch-readiness.ts`. The holds are as
`.design/claude-convergence/COORDINATION.md` records them.
