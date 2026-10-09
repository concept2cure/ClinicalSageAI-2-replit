# AnA context-enrichment memory recall — W3 / D4

Canonical branch: `concept2cure-v2`.
Publication base: `2ad484223e8fc84ae0a627e4038653caf93ba787`.
Owned production scope: `server/services/ana-ri/context-enrichment.ts`.
No UI contribution.

## Delivered behavior

Three structured project-memory queries used `confidence` and `importance`,
while the canonical provisioned table declares `confidence_score` and
`importance_level`. The queries raised PostgreSQL 42703: precedent and knowledge
context was omitted; claims fell through to a generic memory query. The existing
common-memory integration test could pass via that fallback without establishing
that the structured evidence-chain query worked.

The structured queries now read canonical metadata columns through aliases that
preserve the existing formatter's row fields. Severity ranking follows the
common reader's existing critical, high, medium, low, unknown order, followed by
newest creation time. Category sets, query limits, grouping caps, project/tenant
predicates and parameter arrays remain unchanged.

All four project-memory selectors in this context-enrichment module require the
existing top-level `status = 'active'` lifecycle state. This keeps actual
quarantined, superseded, archived, rejected, null and unknown-state records out
of these reads, including claims' generic fallback. Other canonical recall paths
already use this rule. No lifecycle write, status transition or schema is changed.

The mounted streaming path and chat-context builder call `enrichContextForChat`;
the corrected readers remain reachable through their existing slash commands,
composites, app mentions and natural-language triggers. Existing formatters,
evidence-confidence computation, source reporting, deadlines, guards and catches
are preserved. Healthy claims use the structured primary query directly.

## Qualification

| Check | Result |
| --- | --- |
| Selected regression checks against published source | Eight failures; one invariant pass; 45 skipped |
| Final real-PGlite focused suite | 54 passed, zero failed or skipped |
| Healthy formatter contracts | Four exact block fixtures passed |
| Broader AnA qualification | 575 passed across 34 files in 65.078s; zero failed or skipped |
| Forced lint | Zero errors; six unchanged production warnings; zero test warnings |
| Production build | Passed in 18.020s |
| Unchanged full pre-push gate | Passed in 55.690s |
| TypeScript gate | Zero errors; `tsc` exit zero; baseline remains zero |
| Independent reviews | Production, focused tests and final evidence approved without blockers |

The full pre-push gate qualified source checkpoint `3c7b1620ce6429b05bde14fd1ee261d3c7a220a9`
against publication base `2ad484223e8fc84ae0a627e4038653caf93ba787`. The existing native TypeScript
cache-preparation helper ran in 2 bounded processes, ending with zero
unchecked files and zero cached diagnostic files. That preparation is not the
qualification verdict: the unchanged repository gate then ran
`tsc --noEmit --incremental`. Node 22.23.3 and a 6656 MB heap were used.
No compiler configuration, baseline, gate or lint suppression was changed.

The focused suite executes the actual SELECTs through `enrichContextForChat`
against PGlite with canonical metadata/status columns pinned to Drizzle source.
It proves valid structured headings and confidence, zero SQL errors on healthy
reads, severity/case/newest ordering, null/unknown priority handling, original
limits and category sets/caps, and inactive-row exclusion even when those rows
have higher severity. It also covers active-only five-row claims fallback after
a forced primary failure, cross-tenant/project exclusion, linked-program and
missing/unresolved project guards, healthy/inactive-only empty results, real
42P01 missing-table and 42703 column failures, and existing zero-confidence
handling. Schema changes in failure fixtures are restored in finally.

Healthy populated claims now needs one primary memory read rather than an
invalid primary read followed by the generic fallback. Healthy empty claims
still follows the original fallback and makes two reads. No production latency
benchmark is claimed. Existing fallback/catch/error-reporting behavior is kept;
this batch does not add new unavailable-source reporting for structured readers.

Only four SQL literals changed; masking them proves every other source byte
matches the published base. Formatters and deterministic evidence-confidence
calculation are unchanged. The fix intentionally restores structured results
where original SQL failed, so whole-result equality against the broken queries
is not claimed. Four controlled healthy block fixtures establish the formatter
contract; trigger composition remains governed by its existing timing.

Qualified production blob: `8899226b64533be55a1636c184e997a2bb318aa7`.
Qualified focused-test blob: `47c9affa0283ff18edc738eaf71a13279752c0e0`.
SHA-256 pins are in `source-files.json`. Unchanged client subtree:
`f4a50c306387585250e354c68e08a099362e3823`.

Publication uses a non-force expected-SHA update of `concept2cure-v2`, verifies
all uploaded blobs and the complete resulting tree, and reports remote CI
separately from local qualification. The local checkout is aligned to the
published commit after remote verification.

During the publication lease check, automatic repository-health commit
`2ad484223e8fc84ae0a627e4038653caf93ba787` advanced the canonical head from `512369c95a4a89a32e20bc2cb32601521a2a2df4`.
Only the two repository-health reports changed. Both remote blobs and the exact
Git tree/commit were verified and merged on the sole branch, preserving their
bytes. The reviewer independently verified unchanged production, test and client
hashes, and exactly four SQL-literal changes against the updated base. The
575-test and build evidence still pins the same source; the unchanged full
pre-push gate was repeated successfully against the updated head. Its original
59.348s pass is retained under `before-head-advance-*`.
The repeated gate completed in 55.690s with zero TypeScript
errors. `head-advance.json` records the synchronization evidence.

## Boundaries and remaining work

This batch corrects four AnA context-enrichment selectors. It does not establish
that every platform recall path is corrected. The separate command-executor
memory reader still uses obsolete metadata columns. A separate pattern nomination
writer stores review status inside JSON while inheriting top-level active; these
selectors only enforce the actual top-level lifecycle status. Both are recorded
for later bounded work, outside this batch.

Tests use the canonical provisioned table shape and real PostgreSQL-compatible
SQL execution locally. A deployed database was not queried. This is source
publication, not a production deployment or a full-repository test verdict.
No UI, dependency, new model, tool, integration or capability is added.
