# S5a — sub-agent limits and the verification readers (row 74, ADR-0015 §4, §5, §7)

The first slice of S5. It covers no new surface and no new tool: `run_agent` is not
registered yet, and nothing calls these readers. It sets the numbers and the
pure rules that the next slices (S5b child loop, S5c `run_agent` and stream
hosting) have to obey.

## What landed

| File | Change |
|---|---|
| `shared/ana/run-control-limits.ts` | The sub-agent ceilings: 6 per turn, 4 per round, 8 live per organization **per process**, 10 live per process (ADR-0015 §5: half of 20 gateway permits), 6 child rounds, about 200,000 tokens (soft by up to two calls), 150 s wrap-up, 180 s active time, 2 tools at once, and the input caps |
| `server/services/intelligence/cross-artifact-consistency.ts` | `NumericalIntegrityReport.labelsCompared`: distinct labels stated at least twice. Additive |
| `server/services/ana/AnaToolExecutor.ts` | `check_numerical_integrity` passes `labelsCompared` through. Additive; the parent's own recommendation text is unchanged |
| `server/services/ana/sub-agent-result.ts` | `HARNESS_CHECKS`, the three readers, `dossierCheckSkipped`, `aggregateVerdict`, `agentTraceStatus` |

## Re-derived from the tree, not from the brief

The S5 brief (2026-09-28) anchored the dossier reader on track H's
`verdictFor` and `recommendationFor` copy, plus a `figuresCompared` field. Trunk's `e7021b7bb` replaced
that implementation, and the merge of 2026-10-04 made trunk's canonical. The
reader is pinned to what trunk's handler actually returns:

- not compared for a stated reason gives `{ error, notCompared }`. The reader
  returns **not_assessed**, not error.
- a failed read gives `{ error, unavailable: true }`. The reader returns
  **error**.
- `artifactsCompared: 0` still carries verdict `clean`. The reader returns
  **not_assessed**.
- `draftFactsExtracted: 0` with verdict `clean` covers a section-only
  comparison where no figure was compared. The reader returns **not_assessed**.
- `truncated: true` with verdict `clean` means only part of the project was
  read. The reader returns **see_result**, not pass.
- `blocker` and `needs_review` both return **fail**; `minor_issues` returns
  **see_result**.

Every dossier statement is the handler's own sentence after
`Project records: `. S5 writes no second copy of it.

## Rules the readers enforce

- **check_grounding never passes.** A marker is not a source. Every claim
  marked gives `see_result` ("the cited sources were not opened"). Any unmarked
  claim gives `fail`. The handler returns `ungroundedClaims` as an array; a
  reader that compared it as a number could never fail, and the mutation
  below shows the test catches that.
- **check_numerical_integrity** reports `clean` both when two statements agree
  and when every figure is stated once. Only the first is a pass. It needs
  `labelsCompared ≥ 1`; otherwise the result is not assessed.
- **aggregateVerdict:**
  - any fail gives `issues_found`;
  - otherwise any error or `see_result` gives `inconclusive`;
  - otherwise a pass gives `no_issues_found`;
  - nothing compared gives `nothing_checkable`, never clean.
- **agentTraceStatus** changes only a mechanical `success`:
  - completed gives `success`, whatever the verdict;
  - a budget stop gives `incomplete`;
  - a refusal gives `error`;
  - an unreadable result gives `incomplete`, never `success`.

## Verification

- `red-labels-compared-at-HEAD.txt`: the four `labelsCompared` cases, run
  against the engine as it was at HEAD. All red.
- `mutations.txt`: 11 named mutations of the readers and the handler. All red.
  One mutation survived the first pass ("an unknown dossier verdict
  accepted"): the list check duplicated the switch's fail-closed default. The
  redundant check was removed. The mutation that replaced it ("an unknown
  verdict falls through as clean") is red.
- `green.txt`: the new suites plus neighbours (`server/services/intelligence/__tests__/`,
  `shared/ana`, run-status, and every test naming `check_numerical_integrity`
  or the limits module): 28 files, 335 tests.
- `sub-agent-verifiers.test.ts` runs the **real** registered handlers and reads
  their output. A renamed key in a handler turns it red.

## Not in this slice

The child loop, caps enforcement, `run_agent`, stream hosting, the grounding
corpus fix, the agent-swarm retirement: S5b to S5d.
