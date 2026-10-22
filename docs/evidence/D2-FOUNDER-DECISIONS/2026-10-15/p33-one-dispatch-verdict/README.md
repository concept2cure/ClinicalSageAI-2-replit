# P-33: one dispatch verdict per sequence

Row **D2**. Decision **P-33** (2026-10-15, under the founder's delegation;
`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-33"), on
`docs/design/WORKFLOW_DECISION_2026-10-08.md` §1 item 2 and §4 Q3.

## The defect

A US IND sequence had two go/no-go verdicts:

- `assessSequenceDispatchReadiness` (`server/services/ectd/assess-dispatch-readiness.ts`).
  Submit, the Submission Center and the governed freeze / dispatch / transmit
  steps read this one.
- `evaluateDispatchGate` in `server/services/ind-lifecycle/ind-dispatch-gate.ts`.
  The IND lifecycle routes answered with this one: `POST /sequence/:id/dispatch-gate`,
  its snapshot, `POST /submission/:id/cockpit`, `/drift` and `GET /portfolio/drift(/csv)`.

For the same sequence the two could disagree in both directions. The IND gate
blocked a complete amendment that Submit cleared. It also failed to block
amendments that Submit cleared and that should have been blocked:

| What the IND gate checked | The assessor before P-33 | After P-33 (`server/services/ectd/ind-program-findings.ts`) |
|---|---|---|
| `ALREADY_DISPATCHED`: blocks a sequence whose status is `dispatched` | not checked | **Not carried, on purpose.** Transmit requires a dispatched sequence with a clear gate, so this check would make transmit unreachable. Guard (g). |
| `EMPTY_SEQUENCE` | `EMPTY_SEQUENCE` error (`computeDispatchReadiness`) | Unchanged. It was already in the assessor. |
| `MISSING_REQUIRED_SECTIONS`, from `validateSequenceLeaves(filingTypeForSequence(type, leaves))` | Original: the regional Module 1 record plus the IND Module 3 profile. Continuing US IND: **1.1 only** (the j7 / P-20 pin). | Original: unchanged. Continuing US IND: **`validateSequenceLeaves` / `filingTypeForSequence` are imported, not copied.** They require 1.1, 1.2 and the content the type needs. Each gap is a `MISSING_REQUIRED_SECTION` error. |
| `MISSING_CHECKSUMS` | not checked | **Not carried, on purpose.** The governed leaf route cannot set the column, and the packager computes checksums from the bytes. This check would refuse every sequence the product builds. Guard (h). |
| `CLINICAL_HOLD_NOT_EVALUATED`: blocks whenever the request body has no clock | not checked | **`CLINICAL_HOLD_NOT_ASSESSED`**, an info finding on every US IND sequence. The same note appears as the structural gate's `notAssessed`. It never blocks, and nothing is read from a body. `clinicalHoldState()` is the seam for a future hold register. |
| `CRITICAL_ACTIONS_OPEN`: a hold from the body clock, or an overdue safety report | not checked | Hold: as in the row above. Overdue report: **`IND_SAFETY_REPORT_OVERDUE`**, a warning per report from `listOverdueSafetyReports`. It never blocks, and it is not raised on the sequence that carries the safety report (a 312.32 filing, or a leaf at 1.12.4). |
| `UNAUTHORIZED_CROSS_REFERENCES`: the register's `missingLoa` count, submission-wide | Only an original IND's Module 3 heading with no leaf | **`CROSS_REFERENCE_LOA_MISSING`**, an error per reference on **every** US IND sequence, read through the register's own reader (`getCrossReferenceRegister`). The Module 3 check now reads the same register once, not its own copy of the query. An unreadable register blocks and says why. |
| `UNKNOWN_SECTIONS` warning | not checked | **Not carried into the verdict.** P-33 is silent on it, and it never blocked. The IND route still returns it in `sequenceValidation.unknownSections`, for display. |

Shape: no new gate key. `GATE_ORDER`, `DISPATCH_GATE_RULE_IDS` and the client
union in `client/src/concept2cure/v2/surfaces/programSequence.ts` are
unchanged. One optional field is added:
`indProgram?: { crossReferencesWithoutLoa, overdueSafetyReports, carriesSafetyReport, continuingFilingType, clinicalHold: { assessed: false, note } }`.
The three new codes are catalogued in `validation-rule-corpus.ts`, and the
corpus source scan now reads `ind-program-findings.ts` as well.

### The j7 pin, and why P-33 reverses it

`assess-dispatch-readiness.gates.test.ts` pinned two things. A continuing IND
sequence was held "to its 1.1 form and to nothing else". And an amendment
carrying only a 1571 had no missing section. j7 gave two reasons:

1. An amendment does not re-file the IB or the general investigational plan.
2. The regional Module 1 record makes no per-sequence claim.

Neither reason says a continuing sequence needs no cover letter or no content.
No regulatory reason was cited for exempting any sequence type from 1.2. Both
reasons still hold and are still honoured: the application's Module 1 list
(1.20, the IB, the plan) is never asked of an amendment. Both tests were
rewritten in the same change, with a comment citing P-33.

### Routes

The IND routes keep their paths. Each one answers from
`assessSequenceDispatchReadiness`, through `indVerdictFromAssessment`
(`server/services/ind-lifecycle/ind-cockpit.ts`, pure). The verdict is:

```
{ canDispatch: gate.cleared, blockers, warnings, notAssessed, source: 'assess-dispatch-readiness' }
```

- `sequenceValidation`, `manifest` and `actionItems` are still returned, for
  display. The body's `filingType` and its readiness / clock / timeline inputs
  shape only those parts, never the verdict.
- A snapshot records `verdict.source`. A row from before P-33 has no source.
  It is reported as `recorded_under_previous_gate`, in the cockpit, the drift
  digest, the portfolio drift sweep and its CSV, and never as drift.

## Deletion rule (CLAUDE.md working agreement)

`git log --all --diff-filter=D --oneline -- '**/*dispatch-gate*'` returned no
lines, so no dispatch-gate file had been deleted before. The file that now
delivers each user outcome, and the test that proves it is reachable:

| User outcome | Delivered by | Proven reachable by |
|---|---|---|
| Go/no-go per IND sequence | `server/routes/ind-lifecycle/sequence.routes.ts` (`POST /api/ind-lifecycle/sequence/:seqId/dispatch-gate`) → `server/services/ectd/assess-dispatch-readiness.ts` + `server/services/ectd/ind-program-findings.ts` → `ind-cockpit.indVerdictFromAssessment`. The same verdict as `GET /api/submissions/sequences/:seqId/dispatch-readiness` (Submit, `DispatchReadiness.tsx`). | `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts`; `routes.contract.integration.test.ts` ("POST /sequence/:id/dispatch-gate → 200 with the one verdict") |
| Snapshot history | `sequence.routes.ts` (`…/dispatch-gate/snapshot`, `GET …/snapshots`) + `server/services/ind-lifecycle/ind-dispatch-snapshot-service.ts` | `routes.contract.integration.test.ts` (snapshot → 201, then GET /snapshots); the parity test (the snapshot records its source); `ind-persistence-pglite.integration.test.ts` |
| Cockpit and drift | `server/routes/ind-lifecycle/submission.routes.ts` (`/submission/:id/cockpit`, `/drift`, `/portfolio/drift`, `/portfolio/drift/csv`) + `ind-cockpit.ts` + `ind-portfolio.ts` | The parity test (the cockpit agrees with Submit sequence by sequence; a pre-P-33 row is not drift); `routes.contract.integration.test.ts` (cockpit, drift, drift CSV); `ind-cockpit.test.ts`; `ind-portfolio.test.ts` |

Reachability in production: under P-32 the `/api/ind-lifecycle/sequence`,
`/submission/:id` and `/portfolio` paths are left unclaimed by any launch
surface (`shared/constants/ui-surface-registry.ts`, the `ind-checklist`
note). The product's screen for this verdict is Submit's, which already read
the assessor.

## Red, then green

Red is the new tests run against the code before the change (`red/`). Green is
after the change (`green/`).

| Test | Red | Green |
|---|---|---|
| (a) `tests/schema-contract/one-dispatch-verdict.contract.test.ts` | 5/5 failed (the IND gate exists, is imported, defines a second `evaluateDispatchGate`, and the routes do not call the assessor) | 5/5 |
| (b) `assess-dispatch-readiness.ind-program.pglite.test.ts`: an LOA-missing reference blocks an amendment and the original; an unreadable register blocks | 4 failed (no `CROSS_REFERENCE_LOA_MISSING`, `gate.cleared` true) | pass |
| (c) Same file: an overdue safety report warns and never blocks, and is not raised on the safety-report sequence | 2 failed | pass |
| (d) Same file: a US IND states the hold is not assessed (finding + structural `notAssessed`), not blocking, and the response sequence clears | 2 failed | pass |
| (e) Same file: a continuing amendment with only its 1571 is blocked (1.2, 5.3.5); an annual report needs 1.13 | 2 failed | pass |
| (f) `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts`: IND `verdict.canDispatch` equals Submit `gate.cleared` (clean, missing sections, missing LOA); snapshot source; cockpit parity; a pre-P-33 row is not drift | 5/5 failed. The IND route answered `canDispatch: false` for the clean amendment that Submit cleared. By the deleted gate's code, the cause was `MISSING_CHECKSUMS` (the governed leaves carry no checksum) and `CLINICAL_HOLD_NOT_EVALUATED` (no clock in the body). It cleared nothing Submit blocked, and Submit cleared the 1571-only and LOA-missing amendments. | 5/5 |
| (g) A dispatched clean sequence keeps `gate.cleared` | green before. **Red by mutation**: an `ALREADY_DISPATCHED` error added to the assessor fails it (`green/mutation-g.txt`). Mutation removed. | pass |
| (h) A null leaf checksum does not block | green before. **Red by mutation**: a `MISSING_CHECKSUMS` error added fails it (`green/mutation-h.txt`). Mutation removed. | pass |

Two cases in the same file were green before the change, as expected:

- "an amendment with no 1571 is blocked on 1.1": 1.1 was already required.
- The two NDA scope cases.

The full required run is in `green/summary.txt`.

## Files

Added:

- `server/services/ectd/ind-program-findings.ts`
- `server/services/ectd/__tests__/assess-dispatch-readiness.ind-program.pglite.test.ts`
- `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts`
- `tests/schema-contract/one-dispatch-verdict.contract.test.ts`

Deleted:

- `server/services/ind-lifecycle/ind-dispatch-gate.ts`
- `server/services/ind-lifecycle/__tests__/ind-dispatch-gate.test.ts`

These two deletions were staged with `git rm`, and a concurrent commit swept
them into `0a047fbcf`. The rest of this change is the commit that makes that
one consistent.

Changed:

- Assessor and corpus: `assess-dispatch-readiness.ts`, `validation-rule-corpus.ts`
- Routes: `ind-lifecycle/sequence.routes.ts`, `submission.routes.ts`, `openapi.ts`
- IND lifecycle services: `ind-cockpit.ts`, `ind-dispatch-snapshot-service.ts`, `ind-portfolio.ts`, `index.ts`
- Tests: `assess-dispatch-readiness.gates.test.ts`, `validation-rule-corpus.test.ts`, `ind-cockpit.test.ts`, `ind-portfolio.test.ts`, `ind-persistence-pglite.integration.test.ts`, `routes.contract.integration.test.ts`
- Fixture: `withdrawal-approval-binding.pglite.test.ts`. Its IND amendments now carry the 1.2 cover letter P-33 requires; its subject, withdrawals, is unchanged.
- Docs and comments: `docs/IND_LIFECYCLE_MODULE.md`, a comment in `services/regulatory/ind-ectd-sections.ts`

ESLint problem counts per file are not above HEAD (`green/lint.txt`).
`assessSequenceDispatchReadiness` went from 137 to 134 lines and the file
from 571 to 568 counted lines. The new rules live in the extracted module.
