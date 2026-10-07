# Existing biotech workflow qualification follow-through

2026-10-07 · W3 / D4 · `concept2cure/ClinicalSageAI-2-replit` ·
`concept2cure-v2` only. Starting source:
`40697292af6b813dcfcaba8881e12c250dab69ef`.

The approved [PLAN.md](PLAN.md) bounds this increment to existing CMC assessment,
Module 3 propagation, edited-workbook adoption, source withdrawal and cached
evidence consumers. It adds no surface, dependency, model, statistical engine,
store, production index or migration. Historical evidence and audit identities
remain intact. This increment does not close D4 or D1–D10.

## Resulting behavior

| Existing workflow boundary | Qualified software behavior |
|---|---|
| Single-study CMC claim | Any unestimable recorded parameter/condition or unnamed measured row withholds the aggregate shelf-life claim. Valid per-series estimates and named refusal reasons remain available. |
| Module 3 stability support and trending | Unnamed measured results carry their source/row refusal into qualification and narrative; raw rows and point comparisons remain visible. |
| Conversation edit → project adoption | Existing exact `file_upload.derived` ancestry is carried into capture provenance. Scientific qualification remains unassessed and formula results are not recalculated. |
| Admission, canonical capture and upload readers | Same-tenant recorded terminal ancestor withdrawal, contradictory identities, unresolved named parents, cycles or depth exhaustion refuse eligibility/admission. Retained ancestor data remains usable. |
| Cached atom, RAG and artifact readers | Exact existing normalized associations inherit canonical recorded-lineage eligibility. Data retention remains distinct from original-file availability. Equal bytes alone create no ancestry. |
| Withdrawal impact and review freshness | Known captured grandchildren are included, fingerprinted and require review; named unverified dependencies remain visible for review rather than becoming qualified evidence. |

Detailed contracts, RED/GREEN controls and limits are in
[CMC-RESULTS.md](CMC-RESULTS.md), [LINEAGE-RESULTS.md](LINEAGE-RESULTS.md) and
[DOWNSTREAM-RESULTS.md](DOWNSTREAM-RESULTS.md). The initial CMC and lineage REDs
precede their production edits. The separately approved downstream extension
has its own three-failure RED against the pending canonical lineage repair.
Later isolated-original controls and fixture/runner failures are explicitly
labeled; no failed or empty execution is represented as GREEN.

## Final integration evidence

- [Combined regression](COMBINED-REGRESSION.txt): **69 physical files,
  1341/1341 cases passed, zero skipped/todo, exit 0, 224.99 seconds**. Runs use
  the repository Vitest configuration, one fork and a 4096-MiB heap.
  [Requested files](COMBINED-REQUESTED-FILES.txt) and the
  [executed manifest](COMBINED-EXECUTION-MANIFEST.json) verify that every
  requested file executed, with no missing or additional file.
- [Qualified source blobs](QUALIFIED-SOURCE-BLOBS.json) pin all 27 changed
  TypeScript source/test/fixture files on which integration was run.
- [Server build](BUILD-SERVER-FINAL.txt) and [client build](BUILD-CLIENT.txt)
  completed successfully. The client retains its existing chunk-size warning;
  builds are not semantic TypeScript proof.
- [Final lint](LINT-FINAL-SUMMARY.json): **27 files, zero errors, 30 inherited
  warnings**. [Warning ratchet](WARNING-RATCHET.txt): no file gained a warning
  against the exact starting source. No suppression or baseline changed.
- The repository pre-commit security check and all pre-push gates preceding
  whole-tree TypeScript are executed before canonical publication; their
  actual receipt is filed as `BRANCH-GATES.txt`.

The prior exact-source full TypeScript gate is independently verified in
[PRIOR-TYPECHECK-GREEN.txt](PRIOR-TYPECHECK-GREEN.txt): source `40697292`, zero
errors, compiler exit 0 and baseline 0. It does not qualify this new source.
The local host has 8 GiB while the canonical compiler requires a 24-GiB heap.
Under the user's continuing authorization, this publication's full semantic
gate is verified in GitHub after publication. That verdict is pending when
this receipt is filed; the exact-source GitHub job, not local tests or builds,
supplies its final result.

## Evidence scanner correction

The prior Semgrep blocking differential scan found three synthetic opaque
preview-token strings in two RED receipts. [EVIDENCE-SCAN-RED.json](EVIDENCE-SCAN-RED.json)
records the exact rule, source, job, paths and counts. Those three strings are
replaced with a synthetic-token redaction marker; assertions, SQL, failure
counts and verdicts are preserved. New receipts are checked for the same token
shape. No scanner rule, ignore list or baseline is weakened. The new source's
actual remote scan verdict remains a separate release gate.

## Remaining qualification

Fixed-size local SQL timings are descriptive, not performance acceptance.
The first cached-reader timing exposed seconds of avoidable lookup cost;
candidate-bounded normalization reduced final medians to 312.32 ms for 203
atoms, 110.12 ms for 201 RAG rows and 92.64 ms for 201 artifacts. The final
relative overhead remains material. Earlier timings are preserved separately.
Production volume, latency/plans, RLS and independent-connection scheduling
remain unqualified; no production index or schema redesign was added.

Archived/missing audit events and unmapped historical associations remain
unknown history. This repair does not reconstruct them or prove parent live
bytes, audit-seal integrity, filesystem symlink containment or scientific
identity/unit/criteria completeness. Scoped SQL/route controls do not establish
deployed intended use, provider PQ, narrative-refinement semantic preservation,
accountable scientific acceptance or signed validation.

[Prior CI snapshot](PRIOR-CI-SUMMARY.json) records the actual preceding source:
main lint/typecheck, security contracts, production image/RLS boot and several
other jobs passed; broad tests/coverage/integration were still running. The
full-history secret scanner failed during pinned dependency installation, and
JavaScript CodeQL failed after analysis/SARIF processing without a proven
precise cause. No new-source release verdict is inferred from that snapshot.
Broad release CI, live/staging execution, complete customer-data/intended-use
qualification, model/provider PQ and signed human validation remain owed.
