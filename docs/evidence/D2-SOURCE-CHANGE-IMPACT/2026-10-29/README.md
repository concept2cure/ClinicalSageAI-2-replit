# G7: Vault where-used names the sections that cite a version, and a new version lists what still cites the old one

Row: D2 (W1). This is slice G7 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`. Benchmark: Weave's Dossier Manager, where a source update shows the sections that need changing.

## What already exists

- **Where-used** (`server/services/vault/vault-where-used.ts`) lists three uses of a version:
  - submission leaves that place it;
  - official eSTAR exports that attach it;
  - CMC evidence links.

  `GET /api/c2c/project-vault/:id/documents/:documentId/versions` (`project-vault.ts`) reads all three, and `VaultVersions.tsx` shows them per version.
- **The section-to-Vault link** is span lineage. `document_span_lineage` rows with `provenance_kind = 'vault_document'`, `document_table = 'authoring_sections'`, `reference_id` = the `vault.documents` id of the cited version (`span-lineage-vault.ts`, written when a section is seeded from Vault sources by `authoring-section-seed.ts`). A stale figure is retired (`deleted_at`) when the text moves.
- **What it did not do.** Nothing read that link back for the Vault. A new version therefore could not say which sections were written from its predecessor.
- **Citation tables.** Six citation tables are unconverged (the inventory's finding). `authoring_citations` carries data-room source ids (`cre_evidence_source`), not Vault versions. Span lineage is the one store keyed to a Vault version, so it is the join key used here. No new store is added.

## What changed

- **Server.** `readVaultSectionCitations` lists the editor sections whose live span lineage names each version. It reads their document, code, title and span count, within the caller's current project scope; a retired span is not a use. The versions route returns them as `sectionCitations`.
- **Client.** In `VaultVersions.tsx`:
  - each version says where it is cited ("cited in Clinical overview §2.5.4");
  - the current version lists the sections that cite only an earlier version, as "may need its text updated". Each entry opens the editor at that section (`openImportedDocument` with the section code, wired from `Vault.tsx`).
  - The shape guard rejects a malformed citation, so it is never shown as no citations.

## Proof

- **The SQL, on PGlite**, run as written in `vault-where-used.ts`:
  - two live spans of one section are one citation with `spans: 2`;
  - a retired span, a section in a project outside the caller's scope, and another tenant's row are not listed.
- `client/src/concept2cure/v2/__tests__/vaultSectionCitations.test.ts`:
  - a section citing only v1 is listed on v2, and one citing both is not;
  - a section cited by several earlier versions is named once, at the newest;
  - the shape guard accepts the server shape and refuses a malformed citation.
  - **Shown failing first:** red at HEAD, where the functions do not exist.
- No Postgres server is available in this environment, so `tests/db/vault-where-used.dbtest.ts` was not extended. That is owed with D1's database lane.
