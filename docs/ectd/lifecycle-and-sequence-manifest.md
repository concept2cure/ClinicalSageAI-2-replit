# eCTD cross-sequence lifecycle & the sequence leaf manifest

How a follow-up eCTD sequence (0001, 0002, …) is computed against what a prior
sequence actually published, so each leaf carries the correct ICH lifecycle
operator (`new` / `replace` / `append` / `delete`) and a resolvable
`modified-file` pointer at the document it supersedes.

## Why a stored manifest

To diff a new sequence against the prior one you need the prior sequence's
**exact published leaves** — precise CTD section, filename, package-relative
href, and MD5. Two obvious sources cannot supply that:

- **`ectd_granules`** is mutable current-state and drifts as authoring
  continues, so it no longer reflects what a past sequence shipped.
- **The published `index.xml`** records only a leaf's *heading-level* section —
  it nests a `3.2.S.4.2` leaf under `m3-2-s-drug-substance`, losing the
  sub-section — so it can't give stable cross-sequence identity.

So the exact set is captured **once, at compile time**, into an immutable
manifest on the compilation row and read back verbatim later.

## The pipeline

```
compile a sequence ─┐
                    ├─► buildLeafManifest(...)  →  ectd_compilations.leaf_manifest (jsonb, immutable)
                    │        server/services/ectd/sequence-manifest.ts
                    │        written by server/services/ectdExportService.ts
                    ▼
plan the NEXT sequence
   loadPriorSequenceManifest(pool, {org, app, priorSeq})   ← tenant-scoped read
       server/services/ectd/prior-sequence-loader.ts
   → manifestToPriorLeaves(...)                             ← PriorLeaf[]
   → computeLifecycleOperations(prior, desired, {prefix})   ← the diff
       server/services/ectd/lifecycle-operator.ts
   → EctdLeaf[] each with operation + modifiedFile
       computeSequencePrefix('0000') = '../0000/'           ← grouped-submission prefix
   ▼
packageEctdSubmission(leaves)  → index.xml with correct operations + modified-file
   server/services/submission-gateways/regional-packager.ts
```

Agent surface: the `compute_lifecycle_operations` tool
(`server/services/ana/AnaToolExecutor.ts`) does this end-to-end — pass
`application_number` + `prior_sequence_number` and it auto-loads the prior
manifest (organization from `ToolContext`, never model input) and derives the
prefix; or pass `prior_leaves` explicitly.

## Lifecycle conventions (pinned by tests)

These are enforced by
`server/services/submission-gateways/__tests__/lifecycle-packaging.test.ts` and
the operator/manifest unit tests. If an external validator ever disagrees, that
test is the single place to change.

| Operator | `xlink:href` | `modified-file` | Ships bytes? |
| --- | --- | --- | --- |
| `new` | this sequence's own path | *(absent)* | yes |
| `replace` | this sequence's own path (the new file) | `../<prior>/…` (the superseded file) | yes |
| `append` | this sequence's own path | `../<prior>/…` (the leaf it extends) | yes |
| `delete` | `../<prior>/…` (the withdrawn file) | `../<prior>/…` (same) | **no** |

- **Identity** across sequences is the precise `ctdSection` + `fileName` (the
  manifest keeps the sub-section verbatim). An unchanged leaf (same MD5) is
  **omitted** from the new sequence — it stays referenced from the prior one.
- A **delete** leaf is *backbone-only*: no new bytes, not written into the
  package, not added to `util/index-md5.txt`. `packageEctdSubmission` detects it
  by an empty `sourcePath` and renders it from `modifiedFile`. (A delete that
  *does* carry a `sourcePath` is packaged normally — an existing pattern the
  qualification fixtures use.)

## Integrity & tenancy

- `leaf_manifest` is **immutable** — written once per sequence, never rewritten
  (21 CFR Part 11 / ALCOA+: it is the canonical evidence pointer for prior
  state).
- Every manifest read is **organization-scoped** (`organization_id` is always in
  the `WHERE`); a prior sequence is never read across tenants.
- The compile path also sets `application_number` + `sequence_number` so the
  sequence-continuity gate (`detectSequenceGaps`, ledger C-31) can see this
  path's compilations.

## Schema

`ectd_compilations.leaf_manifest jsonb` — added in `shared/schema.ts` (fresh
installs, via drizzle-push) and `db/migrations/20260730_ectd_compilations_leaf_manifest.sql`
(existing databases, idempotent). Because this repo's drizzle emits every mapped
column in an INSERT, the column must also exist in every inline DDL mirror used
by tests (see the export golden journey).

Manifest entry shape: `{ ctdSection, fileName, href, md5, operation?, title? }`.

## Known limitations / open decisions

1. **Not yet run through an external eCTD validator.** The DTD/eValidator
   sources are egress-blocked in the build environment, so conformance is proven
   by unit + integration tests and by the qualification harness's structural
   checks. The `xmllint --dtdvalid` step activates automatically once the DTD is
   vendored (`assets/ectd-dtd/`). The **delete-leaf** attribute convention above
   is a best reading of the spec and should get a real-validator pass before a
   production lifecycle submission.
2. **Path-1 (`ectdExportService`) is snapshot-oriented.** It marks every leaf
   `new` and ships the full current dossier. Turning it into a true
   sequence-delta producer (omit unchanged, emit deletes) is a product decision
   that changes submission output; it is intentionally **not** done unilaterally.
   The lifecycle-correct path today is: compute operations (tool / loader) →
   `packageEctdSubmission` (path-2), which renders them correctly.
3. **The submission-package-orchestrator** validates a *derived* leaf manifest
   (all `new`) that stands in for a real ZIP builder. Wiring the real packager +
   lifecycle into it is the larger integration that closes 1–3 together.
