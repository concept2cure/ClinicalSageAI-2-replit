# Final corrected integration gates

W1 / D2, `concept2cure-v2`, 2026-10-14. This is the corrected source phase,
after the six fixture type repairs and the canonical unread-plan catalog/UI
correction. It supersedes the initial gate results for these 47 changed code
inputs without rewriting those earlier logs or any sealed component phase.

- Sole Node22 whole-tree TypeScript gate: **zero errors, exit0**, baseline0
  unchanged, incremental mode with a12,288MB heap. The compiler completed.
- Final client/server build: **exit0**, client26.34s, server bundle completed.
  The existing chunk-size advisory remains visible in the raw build log.
- Final global ESLint: **zero errors and6,090 warnings across8,420 report
  entries**. The canonical warning ratchet passes at the tightened6,090 ceiling,
  30 fewer than the former6,120 baseline. No suppressions or warning waiver.
- Frozen47 changed-code pins verified unchanged after all three gates.

The complete earlier Proof tier passed1,421 cases/125 files before the final
fixture-type and catalog-display phase. Its original139 pins/census remain
separate. Later affected checks passed45 citation cases,90 signing permission
cases,114 backend catalog/reporting cases and161 UI cases across17 suites,
each with zero skips. These runs overlap earlier suites and are not summed into
a new full-suite count. Their evidence is in
[citation typing](../../citation-writer-query-type-followup/README.md),
[permission typing](../../signature-resource-permissions-fixture-types/README.md),
[UI typing](../../retained-report-pack/ui-type-fixtures/README.md),
[canonical projections](../../report-catalog-entitlement-projection/README.md)
and [UI plan guards](../../retained-report-pack/ui-unverified-plan/README.md).

The real six browser downloads and matching export audit hashes, native packet
reservation/scope tests, native post-parent authority and current parent-access
tests qualify their own pinned component phases. Later catalog/UI notice edits
do not turn those phase records into a new whole-application browser/native run.

This record describes local source validation before commit/publication. It
does not declare all hosted CI jobs green. The previous10f4e4557 hosted run has
separate production-validator download, legacy request-client fixture and
native fixture failures being assessed in the following workstream. No current
local result is presented as production deployment, scientific/clinical
qualification, PDF/A conformance or full IND/BLA/CTD readiness.

Readable logs normalize trailing blank lines only. Deterministic gzip archives
retain exact original bytes. The private full ESLint JSON report is recorded by
hash rather than copied as8,420 unrelated per-file findings. Publication and
remote equality are recorded after the normal hooks have completed.
