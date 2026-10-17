# Document store consolidation — plan

**Status:** proposed 2026-10-17, from the app audit of that day; steps 1–2 done the same day
(`docs/evidence/D2-APP-AUDIT/2026-10-17/`). Not yet decided or started. Row: **D2**.

Nine tables each hold "documents". A client cannot tell which one a screen reads, and some writers
say one store and write another. This plan reaches three canonical stores in seven steps. Each step
ships on its own, keeps every existing user outcome reachable, and follows CLAUDE.md RULE 1: data
moves are `INSERT … ON CONFLICT DO NOTHING`, and removing schema means amending its creator, never
appending a DROP.

## Target model

| Store | Holds | Notes |
|---|---|---|
| `authoring_documents` / `authoring_sections` | Every editable draft: human edits, AnA drafts, imports | Created by the deploy authoring step (`scripts/db/authoring-subsystem.mjs`) |
| `vault.documents` + `canonical_documents` | Every filed, immutable version, its bytes, SHA-256 and lifecycle | The one admission point is `vault-ingest.service.ts` |
| `c2c_documents` | A filing's outline and readiness only; section text derives from authoring | `c2c_document_sections` becomes write-through only |

`protocol_documents` stays as a structured register that feeds authoring. `concept2cure_artifacts`
keeps AI-output provenance only (version spine, seals, signed acts, rewrites, compute outputs).
New `submission_leaves` point at `vault_documents`; existing leaves are never rewritten.

## Today

| Table | Deploy path | Reachable writers at launch | Role |
|---|---|---|---|
| `vault.documents` | Created by the gcc tree (install-fresh); reshaped on the deploy path | Vault ingest, placement, metadata edit | Filed record |
| `canonical_documents` | Yes | `canonicalDocumentStore.ts` | Lifecycle per Vault version |
| `authoring_documents` | Yes (authoring step) | Authoring router, from-draft | Working draft |
| `protocol_documents` | Yes | Protocol development service | Protocol register |
| `coauthor_documents` | Drizzle baseline | Filing copies, CMC M3 placement, batch draft | Filing copy; leaves pin it |
| `concept2cure_artifacts` | Drizzle baseline | ~30 writer files | Mixed: AI outputs, upload copies, governance spine |
| `c2c_documents` | Yes | Project scaffold, markets, write-through | Filing outline |
| `unified_documents` | Yes | None reachable (AnA Command removed 2026-10-08) | Dead; read by old leaves |
| `project_sections` | Yes | Legacy numeric-project routes only | Dead for v2 programs |

**Defect found:** AnA's `save_document_to_vault` tool (`AnaToolExecutor.ts` ~21068) inserts a
`concept2cure_artifacts` row; it never writes `vault.documents`. A client told a document was saved to
the Vault will not find it in the Vault. Step 2 fixes it.

## Steps

1. **Identity.** *Done 2026-10-17.* Amend the store vocabulary in `migrations/20260814d_document_alias_map.sql` in place
   (its compare-then-replace CHECK idiom is RULE 1-safe) to admit `vault_documents` and
   `protocol_documents`; backfill aliases keyed `(store, native_id)`. No behaviour change.
2. **AnA saves where it says.** *Done 2026-10-17.* `save_document_to_vault` creates an authoring
   draft through the same path as `draft_authoring_document` (one section) and files nothing: under
   P-30 AnA prose is not credited as governed content without a passed PQ, so filing stays a
   person's act. Its audit record is the authoring CREATE row carrying the stated reason, as for
   `draft_authoring_document`. Existing artifact rows stay readable; no backfill.
3. **Uploads go to the Vault once.** Chat, knowledge-source and MDx-import uploads admit through
   `ingestVaultDocument`; artifact rows become pointers. Backfill on `(program_id, content_hash)`.
4. **Placement files a Vault version.** "Place into filing" and CMC `place-module3` file to the Vault,
   then `upsertLeaf` with `vault_documents`. The coauthor resolver branch stays for existing leaves.
   **Riskiest step:** leaves pin SHA-256 and sequence history, and transmit gates read
   `coauthor_documents.status`. Prove PDF parity of the Vault leaf resolver
   (`leaf-document-tables.ts`) against the coauthor path before switching.
5. **One editor.** `c2c_document_sections` becomes read-only to the MDx pathway editor; authoring is
   the only editor and write-through the only writer.
6. **Retire the authoring → artifact projection** once `canonical_documents` carries review state;
   artifact readers move to it.
7. **Dead tables.** Remove the remaining launch reads (ectd-compile's numeric-project branch, the
   TaskTray approvals query), then amend the creators of `unified_documents`, `project_sections` and
   `coauthor_sections` once nothing writes them. Resolver branches stay for historic leaves.

## Open before step 1

- Trace all 133 `concept2cure_artifacts` references by route mount, not by client grep.
- Decide whether `vault.documents`' creator moves onto the deploy set (it is install-fresh only today;
  later changes to it reach a running database only through the reshaping files).
