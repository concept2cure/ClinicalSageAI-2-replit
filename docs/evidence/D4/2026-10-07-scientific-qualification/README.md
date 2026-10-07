# Scientific evidence and result freshness follow-through

Workstream W3, launch row D4. Parent source:
`cdc1308d97fa4564d799001f536fb423b9a5cc0e`; direct work on
`concept2cure-v2`. This improves existing CMC, analytics and Authoring paths.
It does not declare D4, commercial deployment or regional filings qualified.

## Existing-path corrections

| Boundary | Result | Contract and proof |
| --- | --- | --- |
| Recorded CMC values and times into deterministic assessment | Complete finite measured values, explicit month labels, and honest refusal of invalid present observations. A censored/malformed observation cannot be discarded while the remainder is fitted; unresolved selected-batch evidence cannot be replaced by other batches or produce a programme shelf-life claim. Raw records stay intact. | [Plan](CMC-NUMERIC-PLAN.md), [results and limits](CMC-NUMERIC-RESULTS.md), [actual RED](CMC-NUMERIC-RED.md), [GREEN](CMC-NUMERIC-GREEN.md) |
| Recorded evidence into Module 3 narrative | Valid comparisons remain visible, with unassessed values, unresolved times and unreadable payloads named. A passing subset cannot assert overall stability support while those gaps remain. Unsupported criteria are described as unusable, rather than absent. | Same CMC contract and proof above |
| Biostat inputs and responses into Authoring | Edits, resets and reruns invalidate old results; obsolete responses cannot restore them or disturb the current attempt. Insert requires the current accepted result. Full tables/hash and an already authorized save snapshot remain intact. | [Contract](BIOSTAT-FRESHNESS-CONTRACT.md), [results](BIOSTAT-FRESHNESS-RESULTS.md) |
| Adoption SQL test fixture into audit-contract validation | Four missing nullable audit columns restored; the unchanged guard and actual SQL adoption regression pass. No audit gate or sealing seam changed. | [Plan](AUDIT-FIXTURE-PLAN.md), [results](AUDIT-FIXTURE.md) |
| Vault originals and retained data into CMC evidence | Every disposition excludes the original from new document-evidence admission. Canonical locks precede reads/writes; refusal preserves earlier links. Terminal data withdrawal holds affected sections, while `keep_data` preserves retained-data grounding and exposes original-file availability separately. | [Contract](CMC-DISPOSITION-PLAN.md), [actual SQL results and limits](CMC-DISPOSITION-RESULTS.md) |
| Catalog disposition test fixture into actual consumer queries | The fixture carries the canonical recorded content hash, allowing existing readable-source, retained-text and withdrawn-grounding checks to execute. Production readers and predicates are unchanged. | [Fixture RED/GREEN](CATALOG-FIXTURE-PARITY.md) |

The two scientific fixes received independent read-only review. Models do not
provide calculated numbers or infer handling for unsupported observations.
Clients must clarify the values, units and intended handling before the
affected series is fitted. Human scientific review, approval, signatures,
provenance and export gates remain in the existing governed paths.

## Source and validation evidence

[Prior-source GitHub verification](PRIOR-SOURCE-GITHUB.md) records actual
TypeScript zero errors and ESLint zero errors for the preceding source, plus
the four failed CI jobs. Its 56 core-suite failure names exactly match the
preceding adoption source; they remain unresolved. The audit-fixture failure
from that run is corrected here and independently checked locally.

Integrated verification of this change is recorded separately in
[INTEGRATED-VALIDATION.md](INTEGRATED-VALIDATION.md). The preceding source's
TypeScript result is not reused to validate changed production/tests. Full
TypeScript runs on GitHub because the local whole-tree compiler has a known
memory limit. Raw Vitest log start clocks are runtime-local EDT; explicitly
labelled UTC times are converted accordingly.

The new qualification test's heterogeneous table initially caused ten GitHub
TypeScript errors. [The fixture correction](CMC-NUMERIC-TYPECHECK-CORRECTION.md)
preserves every runtime case without casts or baseline changes. Corrected source
`9dd81408d4775b8361a96bcf5e6002955db3722e` subsequently passed actual whole-tree
TypeScript (zero errors, baseline zero) and ESLint (zero errors, 6,258 warnings)
in C2C run `37604598878`, job `112736901380`. That verification is scoped to
that source; the subsequent CMC disposition increment requires its own final
publication checks.

[Exact-source publication and GitHub receipts](GITHUB-VALIDATION.md) preserve
both test-fixture TypeScript failures and their scoped corrections. The
row-type correction emits identical runtime JavaScript; its 14 actual-SQL
cases and lint pass. Full semantic TypeScript is checked on the correction's
own published source through GitHub Actions.

## Remaining qualification work

| Existing gap | Required next boundary |
| --- | --- |
| Permissive legacy criterion text and incomplete dimensional semantics | Explicit criterion/unit grammar and client-approved censoring/missing-data handling. This correction does not comprehensively qualify the criterion parser; `<=12abc` remains a documented example of permissive legacy behavior. |
| CMC withdrawal enforcement in deployment | Independent-connection lock scheduling, runtime-role RLS and staging qualification; the actual-SQL admission/read/drift regression above does not replace those checks. |
| Uploaded files into analysis-ready datasets | A unified, versioned qualification step for columns, units, populations, methods and intended analysis, before deterministic computation. |
| Connector retrieval into governed intake | Authorized byte admission through scanner, hash verification, canonical capture and audit; retrieval alone is not this bridge. Watched folders/SFTP and specialized scientific formats remain unqualified pathways. |
| Broader CI and release evidence | Resolve the remaining named inherited failures, inspect final-source TypeScript/CI, and complete staging/intended-use/human-reviewed release qualification. The three catalog-fixture errors are corrected locally here; no agency acceptance is claimed. |

Earlier intake/catalog/derivation work and its remaining handoffs are described
in [the preceding evidence](../2026-10-07-evidence-orchestration/README.md).
