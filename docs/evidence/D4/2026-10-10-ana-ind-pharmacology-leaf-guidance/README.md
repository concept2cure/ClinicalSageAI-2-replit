# Seven pharmacology summary leaves — delivery evidence

Owner: W3 authoring / D4 governed workflow. Sole branch: `concept2cure-v2`.
Baseline: `26b187705e0f6cc38ed4c2ec4ceee8eb149ba596`. Reviewed 2026-10-10 UTC.

## Delivered behavior

The existing canonical authoring overlay now supplies exact advisory content for
`2.6.2.1–2.6.2.7`: Brief Summary, Primary Pharmacodynamics, Secondary
Pharmacodynamics, Safety Pharmacology, Pharmacodynamic Drug Interactions,
Discussion and Conclusions, and Tables and Figures. Previously these seven
requests inherited the broad `2.6.2` record. The existing requirements resolver
and actual AnA drafting gateway request now identify the requested exact leaf.
Seven structural rows move into the content half of the same record; there is
no duplicate registry or additional modeled CTD code.

Each new leaf preserves development phase, modality, route, population, duration,
study status, report version and evidence cutoff as actual evidence inputs or
unresolved gaps. Its guard prefix fits within the existing 900-character
authoring-guidance clip. Missing reports do not establish that a study was not
performed. Planned, deferred and not-applicable claims require supplied status
evidence and rationale. No fabricated results, GLP status, exposure margins,
negative findings or clinical-entry/regulatory sufficiency verdict is authorized.

The seven new `required: false` / `requiredFor: []` values avoid imposing every
marketing-dossier subsection automatically on an initial IND. Those legacy
flags do not waive study or program obligations, establish inapplicability or
change the parent flags. The original 127 content records, including `2.6.2`,
retain identical values and order; all other 115 structural records are also
unchanged. The fingerprint fixture captures the baseline records before edits.

The related CMC in-text-reference regression is corrected: `3.2.P.2.1` is a
recognized structural parent of the newly recorded children. Tests distinguish
heading validity from exact authoring coverage and retain unresolved descendants
such as `3.2.P.2.1.1.99`. Production classification behavior is unchanged; its
stale comment example is corrected.

## Primary-source and inventory boundary

[SOURCE_REVIEW.md](./SOURCE_REVIEW.md) records the final M4S headings and scope,
supporting M3(R2), S7A and S6 guidance, exact versions, source pins and temporal
limits. Static references are advisory. The existing CTD resolver still returns
an empty structured scientific `basis`; this batch introduces no qualified-source
admission, live regulatory update feed or authenticated scientific verdict.

| Inventory | Before | After |
|---|---:|---:|
| Exact content records | 127 | 134 |
| Structural records | 122 | 115 |
| Unique combined codes | 249 | 249 |
| Terminals | 203 | 203 |
| Exact-content terminals | 103 | 110 |
| Structure-only terminals | 100 | 93 |

The refreshed [backlog](../../../design/ANA_IND_REQUIREMENTS_BACKLOG.md) and
[machine-readable audit](./structure-only-terminal-backlog.json) retain all 93
open terminals: 60/2/17/14 in Modules 2/3/4/5. These are lifecycle catalogue
coverage gaps, with undetermined initial IND applicability. Historical dated
100-row evidence remains unchanged.

## Fail-first evidence and intentional snapshot change

[pharmacology-red.txt](./pharmacology-red.txt) records all 17 initial checks failing
on absent exact content or inherited source identity. The final suite adds one
declared gene-therapy context case and passes 18 checks. The real drafting service
is used with an explicitly labeled gateway double; this proves request wiring,
not model output or scientific/regulatory qualification.

[references-red.txt](./references-red.txt) records the two outdated CMC assertions
failing before correction. [references-green.txt](./references-green.txt) records
56 passing reference checks after correction.

The existing requirements fingerprint test correctly rejected the new content
before its intentional update: [requirements-snapshot-red.txt](./requirements-snapshot-red.txt).
[requirements-snapshot-delta.json](./requirements-snapshot-delta.json) accounts
for every change: 21 new exact, m-prefixed and deeper variants; changed `2.6`
and `m2.6` child listings; 661 previous hashes preserved and no removed input.
The snapshot grows from 663 to 684 inputs. No security or compiler baseline is
changed. [pharmacology-and-resolver-green.txt](./pharmacology-and-resolver-green.txt)
records 25 passing checks after the update.

## Remaining IND and release work

The [IND coverage plan](../../../design/ANA_IND_COVERAGE_PLAN.md) remains open:
scientific source qualification and seal admission, remaining exact/unindexed
coverage, owned-program and phase applicability, regulatory currency, lifecycle
context, and representative qualified model/human/end-to-end journeys. Next
bounded content batch is the ten pharmacokinetic written-summary leaves.

No UI, production classification logic, dependencies, database schema, workflow,
security suppression, waiver, approval policy or test baseline is changed.
This receipt does not establish complete IND capability or release clearance.
Execution results and exact-commit publication verification are appended only
after their respective checks complete.

## Completed local checks before publication

Node `v22.23.3`, npm `11.9.0`, unchanged engine enforcement.

| Check | Observed result |
|---|---|
| Exact leaf and requirements-resolver tests | 25 passed, including 18 leaf/gateway/preservation checks. |
| IND/regulatory/drafting/source/tenant/signature/modality and reference selection | 2,039 tests passed in 82 files; exact selection recorded in `regression-selection.json`. |
| Production client/server build | Passed; existing large-chunk warnings remain. |
| Changed-file ESLint | Zero errors; one existing canonical guidance file-length warning. |
| Embedded backlog reproduction | Passed through actual resolver; stored rows, partition, counts and file hashes agree. |
| `git diff --check` | Passed. |

Raw receipts: [regression-green.txt](./regression-green.txt),
[build-green.txt](./build-green.txt), [changed-lint.txt](./changed-lint.txt),
[backlog-reproduction.txt](./backlog-reproduction.txt).

The complete canonical pre-push hook and full-program zero-baseline TypeScript
gate must complete before publication. This paragraph claims neither a pending
check's success nor remote verification.


## Complete canonical pre-push verification

The complete canonical hook passed on local checked commit
`017d90a5fe09720f30b96380cdfc4423ac97e70c` in 1,031.67 seconds, ending
2026-10-10T05:44:35Z. The supported optional memory-bounded mode used
`TYPECHECK_HEAP_MB=6144 TYPECHECK_FILES_PER_PROCESS=1000`, the installed
TypeScript and unchanged full project configuration and zero-error baseline.
All 12,173 source files were checked exactly once in 15 workers; final
verification found the compiler-input snapshot unchanged, zero errors and
aggregate exit 0. Every preceding canonical pre-push gate also passed, including
no changed-file ESLint warning growth.

Full compiler-input snapshot:
`8e6cbd5d584272383ebdd886526b29b8cbb5b8c6c5b7e6465f5bcd5b5ee5e04c`.

Raw evidence: [pre-push-green.txt](./pre-push-green.txt),
[pre-push-completion.json](./pre-push-completion.json), and
[checked-source-identity.json](./checked-source-identity.json).
Only documentation is added after that check; all seven changed source/test
files remain byte-identical to the checked commit. Publication must preserve
that identity. Exact remote results belong in a separate post-push receipt.

[PRIOR_HEAD_CI.md](./PRIOR_HEAD_CI.md) records completed results on the previous
remote head `26b18770`, including the repaired dependency gate and Tier 5 pass
and remaining failed broader gates. Those results do not verify the new commit.
[NEXT_GOVERNANCE_REPAIR.md](./NEXT_GOVERNANCE_REPAIR.md) records a read-only,
version-bound-review prerequisite under plan 1h. Its negative-control contract
is proposed work, not an executed or delivered governance repair.
