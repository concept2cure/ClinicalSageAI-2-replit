# Incoming workflow integration — 2026-10-13

Read-only integration review of incoming `22c0c85b2210c426fec66d8b951fe60abf65a0a1`
merged over verified platform commit
`728f6364f50c26f5af1f09e97fd6fecc84920ffd`. These runs use the merged working
tree, installed repository dependencies and Node 22. No source files were
changed for this review, and no external model or agency request was made.

## Results

| Regression pack | Files | Tests | Evidence |
| --- | ---: | ---: | --- |
| File-to-Vault, document-data disposition, Vault leaf resolution | 17 | 198 | [filing-disposition-leaf-tests.txt](filing-disposition-leaf-tests.txt) |
| Coauthor source snapshots, seals, status guards, leaf pins and deletion audit | 7 | 154 | [coauthor-filing-tests.txt](coauthor-filing-tests.txt) |
| Total, with no files shared between these two packs | 24 | 352 | Both packs passed |

Logs retain test names and final results. Application stdout/stderr, fixture
identities and runtime SQL metadata are omitted. PGlite cases exercise actual
SQL and transactions; other cases use their existing isolated test seams.
This is local regression evidence, not production qualification or agency
acceptance.

The first command was `npx vitest run` with:

- `server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts`
- `server/services/document-data-disposition/__tests__/`
- `server/services/coauthor/__tests__/coauthor-status-write.test.ts`
- `server/services/ectd/__tests__/leaf-source-resolver-vault.test.ts`
- `server/services/ectd/__tests__/leaf-source-resolver-vault-finalized.test.ts`

The second command was `npx vitest run` with:

- `server/routes/__tests__/coauthorSnapshotFromSource.test.ts`
- `server/routes/__tests__/coauthorSnapshotSeal.test.ts`
- `server/routes/__tests__/coauthorSnapshotPinnedByLeaf.pglite.test.ts`
- `server/routes/__tests__/coauthorSnapshotStatus.test.ts`
- `server/routes/__tests__/coauthorSnapshotSeeds.test.ts`
- `server/routes/__tests__/coauthorPutStatus.test.ts`
- `server/__tests__/security/coauthor-document-delete-audit.contract.test.ts`

## Workflow boundary review

The incoming exact Vault/data-room import receipt survives file-to-Vault in
the existing export-history and audit metadata. Saving a new rendition
revalidates current source identity, tenant, program, SHA-256 and data
eligibility. The disposition impact follows this receipt to a different-byte
Vault rendition and refuses original-data withdrawal while the rendition is
still reusable. Retaining extracted data remains available under the existing
policy.

No direct promotion from `csr_sections` or protocol records was added by this
incoming change. An imported working copy receives no inherited review,
signature or approval. Existing filing-copy seals, immutable leaf pins,
submission status gates and transactional audit refusal remain intact in the
tested paths. No verified incoming workflow blocker was found.

Source import, from-draft, reservation and machine-claim suites were assigned
to a separate integration reviewer and are not counted here.
