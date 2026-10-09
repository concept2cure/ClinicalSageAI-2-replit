# IND depth and dependency repair: local delivery record

Canonical branch: `concept2cure-v2`. Starting implementation/evidence head:
`b879e9a9e4e92e683ffe48ad26d8eac8a51c23b0`. Checked 2026-10-09 UTC.

## Delivered scope

- Twelve exact CMC leaf guidance records and two structural parents in the
  existing canonical CTD records. The combined inventory is 249 records and
  203 terminal nodes: 103 exact-content and 100 structure-only. This is a
  lifecycle catalogue, not a census of required initial-IND documents.
- Optional, independent caller-declared therapeutic-area and modality context
  reaches actual nested drafting through the existing batch tool. Existing
  profile rules and gaps are scoped to the active section. Declared labels
  remain unverified; no owned-program context or scientific review is inferred.
- Canonical modality normalization refuses inherited object-property names.
  Two crashing inputs and an unrelated clinical gap in CMC were reproduced
  before repair. All 25 profile/11 modality inputs reach the drafting gateway
  in 275 wiring cases; this does not qualify their scientific combinations.
- Existing transitive development dependency Handlebars is upgraded from
  4.7.9 to 4.7.10. Its three advisory-specific probes fail on the old package
  and pass on the installed patched package. Existing reviewed dependency-risk
  decisions are unchanged; no new exception or scanner suppression is added.
- The pre-existing ESLint failure in the signature test adapter is repaired
  without changing production signing behavior. No UI files change.
- The existing TypeScript gate gains an explicit optional memory-bounded
  compiler-API mode. Every process retains the full identical project context;
  only diagnostic targets are partitioned. The ordinary CLI path, configuration,
  zero baseline and CI workflows remain unchanged. Snapshot drift, incomplete
  coverage and abnormal worker completion fail closed.
- A reproducible backlog enumerates all 100 current structure-only terminal
  sections, their nearest exact-content ancestors and bounded next scopes.
  Initial IND applicability remains undetermined for every row. See
  `docs/design/ANA_IND_REQUIREMENTS_BACKLOG.md`.

Detailed receipts:

- `../2026-10-09-ana-ind-cmc-leaf-guidance/README.md`
- `../2026-10-09-ana-ind-product-context/README.md`
- `../../D6/2026-10-09-handlebars/README.md`
- `../../D6/2026-10-09-memory-bounded-typecheck/README.md`

## Executed verification

Node `v22.23.3`; npm `11.9.0`. Repository engine enforcement is unchanged.

| Check | Observed result |
| --- | --- |
| Coordinated IND/regulatory/drafting/source/tenant/signature/modality selection | 1,965 tests passed in 80 files. |
| Dependency-risk tests, including installed Handlebars probes | 36 passed. |
| Optional TypeScript gate parity/failure and canonical caller-regression fixtures | 27 passed; independently reviewed. |
| Live lockfile dependency-risk gate | Passed. Zero Critical; existing reviewed High findings remain. |
| Focused changed-file ESLint | Zero errors; no newly introduced warnings. |
| Full repository ESLint | Zero errors; 6,242 warnings observed before the pure-helper extraction. Final pushed-file warning gate passed without an increase. |
| Forced ESLint for normally excluded CI scripts/tests | Zero errors; 11 warnings (five helper complexity warnings and six existing gate console sites). |
| Production client/server build after final code changes | Passed. Existing bundle-size warnings remain. |
| `git diff --check` | Passed. |
| Full TypeScript gate, default 24,576 MiB heap | Did not complete: process killed, exit 137. |
| Same full TypeScript gate, supported 7,168 MiB cap | Did not complete: V8 heap exhausted, exit 134. |
| Optional full-program compiler-API gate and canonical pre-push hook | Passed: all 12,171 files checked exactly once in 15 workers, unchanged snapshot, zero errors, exit 0. |

The failed TypeScript attempts used the existing
`scripts/ci/typecheck-no-regression.mjs --incremental`, the full unchanged
`tsconfig.json`, and the unchanged zero-error baseline. This worker is limited
to 8 GiB physical memory, has no swap, and cannot raise that read-only limit.
Neither attempt establishes a trustworthy error count or a successful check.
The failed gate output is retained alongside this record. The new optional mode
uses the same installed TypeScript and unchanged full configuration. Its exact
coverage and compiler-input snapshot must complete before it can pass the
existing zero baseline. No narrower configuration or alternate compiler is used.
An initial capacity probe completed only 1,000 of 12,171 targets and was
intentionally stopped; it is not a full pass.

The first complete optional run checked all 12,171 source files exactly once
in 15 workers against local commit `a7fc230d065d04e90bc89f3deeb820cd691a706a`.
Its final snapshot was unchanged, but it correctly rejected one TS2345 error:
the new statistics-section predicate passed `string | null` to `RegExp.test`.
The actual failed hook log is `pre-push-typecheck-red.txt`. Coalescing only that
nullable argument to an empty string preserves the existing finite regex
matches and the legacy missing-section default. A fresh complete run against
the corrected source is required; completed workers from the failed run are
not reused.

The corrected source at local commit
`263c1bc627d9b6b8d0b280a03ab127dfaef80d67` then passed the complete canonical
pre-push hook in 993.40 seconds. The full compiler-input snapshot was
`1ddd71e73282f4bc06cde8a8c702d32da462f3cf85c9b872fb40e3294756f518`.
All 12,171 files were checked exactly once in 15 workers; final verification
found the snapshot unchanged, zero TypeScript errors and aggregate exit 0.
Every preceding hook gate also passed. The raw hook output is
[`pre-push-green.txt`](./pre-push-green.txt), and the explicit completion record
is [`pre-push-completion.json`](./pre-push-completion.json). The final 1,965-test
rerun is [`regression-green.txt`](./regression-green.txt); the production build
was rerun after the nullable-argument repair as well.

A preceding corrected-source attempt lost its execution session after 5,000
targets and has no trustworthy completion status. It is not a pass and is
retained as `pre-push-interrupted.txt`. The successful run above started fresh
and reused none of that attempt's diagnostic results. Only this receipt and
other documentation were added after the successful check; runtime code,
compiler scripts, dependencies and compiler configuration remain byte-identical
to the tested commit.

The first canonical pre-push attempt correctly refused one new complexity
warning in the product advisory function before reaching TypeScript. Extracting
the unchanged modality prompt block into an adjacent pure helper restored the
original seven-warning file count without suppressing a rule or changing a
baseline. Independent review confirmed identical prompt text/order, branch
behavior and audit fields. All 1,965 selected tests and the production build
were rerun successfully after the extraction. The fail-first hook log is kept
as `pre-push-warning-red.txt`.

## Publication and remaining qualification

At preparation of this pre-publication record the delivery is local, and the
remote remains at `b879e9a9`. The required full-program TypeScript gate and all
canonical pre-push checks have completed successfully before publication.
No branch, PR, baseline relaxation, hook bypass or security suppression was
created. Earlier remote results qualify earlier commits only.

The completed database-provisioning repair and its successful Tier 5 results
remain recorded at
`docs/evidence/D1/2026-10-09-fresh-ana-runs/POST_PUSH_VERIFICATION.md`.
The new dependency repair still requires a fresh remote Security Scan after
publication, and the ordinary full TypeScript CLI requires fresh remote evidence.
This pre-publication record claims neither result. Broader governance, database
and Semgrep failures remain separate release blockers.

The governing follow-through is `docs/design/ANA_IND_COVERAGE_PLAN.md`:
version-bound scientific source review and seal admission; the remaining
structure-only/unindexed section coverage; product/phase applicability;
owned-program product-context projection; authoritative regulatory currency;
and representative model/human/end-to-end IND qualification. This batch does
not establish complete IND coverage or overall release clearance.
