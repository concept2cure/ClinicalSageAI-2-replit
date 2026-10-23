# Complete existing authoring filing traceability

W1 / D2; `concept2cure-v2` only; local/Codespaces testing. Root owns Git,
canonical synchronization, final scope and qualification. This discovery
continues the existing editor, Vault filing/check-in and submission compiler.

## What already exists

- `editor/FileToVaultDialog.tsx`, `DocumentWorkbench.tsx` and
  `DocumentCanvas.tsx` already deliver the one editor's guarded filing dialog.
  `90043b5ea` verifies receipts, preserves uncertain outcomes through ordinary
  close/reopen and proves the existing Vault placement handoff. No new editor,
  placement control or UI pattern is needed.
- `authoring-file-to-vault.ts` already locks and compares exact source headers
  and sections, uses canonical ingest, requires proven creation, records export
  history and chained audit, and attempts byte-bound approval carryover. It
  still gives exports a `draft-<sha8>` or `<source-version>-<sha8>` label and
  supplies no predecessor. Its existing recording metadata identifies the
  source document, admitted Vault UUID and artifact hash.
- `vault-version-checkin.ts` already owns next-major assignment, current-head
  checks, duplicate-byte refusal, inherited placement and transaction locks.
  `vault-version-family.ts` and
  `migrations/20260930_vault_documents_version_lineage.sql` already own family
  identity, valid links and single-successor rules. FD1 in
  `VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` requires sequential majors and immutable
  version labels. Unknown labels are refused; historical hash-labelled rows
  cannot be silently renumbered or ordered by a title/date.
- `leaf-source-resolver.ts` already attaches `coauthorLineage` to co-author
  staged files and validates Vault bytes/current approval in its Vault branch.
  The existing parity fixture explicitly records missing Vault authoring
  lineage and the edited re-filing TODO. `submission-leaf-source-evidence.ts`,
  `sequence-manifest.ts`, the authoring export ledger and approval-carryover
  source references must be audited before proposing another lineage store.
- `document-alias-map.ts` already admits Vault aliases but permits only one
  native representation per canonical document/store. It must not be used to
  equate every per-version Vault UUID with one authoring document. Existing
  `audit/chain-row.ts` and `vault-history-access.ts` provide canonical payload,
  link and HMAC verification to reuse for an audited derivation receipt.
- Existing check-in, snapshot/compensation, placement parity, resolver lineage,
  release and governance fixtures are the verification starting points. Extend
  their actual service/SQL boundaries rather than copy their algorithms.

Searches covered client surfaces, routes/API, services, AnA references, schemas,
migrations, the Vault parity decisions and deleted history. Targeted deleted
authoring/Vault lineage and leaf-source searches found no retired competing
implementation. General version history includes legacy/deprecated editor and
version helpers, not a replacement for the canonical Vault check-in service.
No deeper `AGENTS.md` was found in the searched implementation roots.

## Discovery boundary and ownership

Before production edits, two read-only audits establish an implementable bound:

1. Server version audit: existing authoring filing and canonical check-in,
   ledger identity, legacy labels, tombstones, duplicate initial admissions,
   branch ambiguity, inherited filing and pinned-leaf behavior. Identify a
   bounded correction supported by current decisions without inventing a
   legacy ordering, replacing the version engine or rewriting retained rows.
2. Submission traceability audit: existing Vault/co-author lineage and source
   evidence into staging/governance manifests. Determine which immutable,
   tenant/project/byte-bound source facts are already recorded and how to reuse
   them safely. Never infer identity from title or document-code text alone.

Auditors do not edit production/tests, run tests or mutate Git until root adds
the exact implementation contract and disjoint file ownership. Each reports
existing paths, proposed boundary, real fixture seams and remaining limits.
Root selects and documents the bounded implementation after both reports.
No new UI, provider, transport, dependency, version-numbering policy or schema
change is approved by this discovery contract. No human acceptance, native
concurrency or agency transmission is inferred from deterministic fixtures.

## Qualification

Retain meaningful RED before source edits, actual GREEN commands/exits, before
and after source pins, compressed raw output and hashes. Preserve current
authoring/approval/access/placement gates. Run affected merged regressions,
compiler/build, changed-file lint and warning comparison, single-editor/design
and existing repository safety gates before direct canonical publication.
Evidence belongs in
`docs/evidence/D2-AUTHORING-REFILING-TRACEABILITY/2026-10-21/`.

## Approved bounded implementation: version hints

The version audit confirms there is no safe automatic migration from historical
hash labels. Numeric initial filings also need policy for tombstoned slots and
explicit PDF/DOCX replacement intent. Those changes remain excluded.

`currentVersionOfCode` presently chooses the newest `created_at` among multiple
live roots. That guess reaches the Data Room's existing “add as version” action.
Extend this existing helper to offer a head only when exactly one scoped live
valid-chain head exists: bounded `LIMIT 2`, no date-based selection. Ambiguous
codes return no hint; explicit UUID check-in and numbering remain unchanged.

The version worker owns `server/services/vault/vault-version-checkin.ts`, its
existing `__tests__/vault-version-checkin.pglite.test.ts`, and the existing
`server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts` was
inspected but only extracts shipped SQL; it is not a service refusal proof.
Leave that fixture unchanged. Root qualifies the actual ingest conflict/no-hint
path in the existing placement parity PGlite fixture after trace-worker freeze.
Retain RED before the helper change; prove
ambiguous live roots, unique chains, scoped tenants/programs, tombstones and
existing explicit UUID check-in. No other production or fixture paths without
root coordination. No worker Git, compiler/build or global scans.

## Approved bounded implementation: recorded derivation

Reuse `hashPayload` and `verifySequencedRow` to project the existing chained
`authoring.document.file_to_vault` receipt into a separately typed optional
`derivation` on `ResolvedFile` and the existing governance sources list. Alias
identity remains separate and unchanged. No alias is written for each version.

1. Only after scoped Vault bytes are verified, match the exact native Vault UUID,
   captured program UUID and actual staged SHA-256. Read candidates by tenant,
   filing action and Vault UUID; require exactly one candidate (bounded LIMIT 2),
   a valid source UUID, resource/record/target agreement, payload hash and a
   linked canonical row. Accept the existing verifier's `valid`/`no-key`
   distinction explicitly in the result; `no-key` is not HMAC authenticity.
2. Distinguish recorded derivation, no recorded receipt, unverified receipt and
   unavailable storage/read. A missing relation, failed query, legacy unsequenced
   row, malformed/cross-project/hash-mismatched receipt, broken link/seal or
   ambiguous candidate set must never produce positive source facts. Do not
   choose a receipt by date or infer identity from code/title/current body.
3. Capture only the verified receipt's facts. Extend the existing filing payload
   with the already-computed source sections digest and exact captured source
   version for future filings. Old missing values remain explicitly unknown;
   no backfill or reconstruction is performed. A sections digest is not a full
   header/snapshot proof, and source metadata does not authorize a body read.
4. Preserve native Vault pointers, actual alias identity, byte pins, PDF/raw
   staging, approval/current-version/release and substantive-content gates.
   Derivation metadata neither proves substantive PDF content nor approval. It
   is governance metadata outside the agency backbone, without another UI.

The trace worker owns the narrow read-only projection
`server/services/authoring/authoring-vault-filing-receipt.ts`, the existing filing
payload in `authoring-file-to-vault.ts`, additive types in
`ectd/core-to-packager.ts`, the Vault branch of `leaf-source-resolver.ts`, and
the existing `assemble-from-core.ts` governance projection. Test ownership is a
focused receipt-reader fixture and existing
`ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts`, including conversion
of the explicit missing-derivation assertion into a meaningful RED. Root will
not edit parity until the trace worker freezes it, then owns the one actual
ingest ambiguity case. Coordinate additional directly affected fixture paths
before editing. No policy/schema/identity writer or second engine is added.
The existing `ectd/__tests__/assemble-from-core.vault-uuid.pglite.test.ts` is
also approved if needed to assert the actual governance artifact projection;
extend its current fixture rather than add a parallel assembly harness.

Qualify real writer → ingest → materializer → governance projection, plus
missing/tampered/mismatched/ambiguous/unavailable receipts and exact seal states.
Editing today's source must preserve the historical receipt without reading
today's body. Keep the historical version-supersession TODO explicit.
