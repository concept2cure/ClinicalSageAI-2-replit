# D4: the Vault's "N documents" counted tree entries, not documents

**Row:** D4 (Validation package). The fix makes URS-VAULT-004 hold ("the
program's vault read model lists every stored document under its folder tree
with an honest `documentCount`; … no fabricated folders or counts"), which it
did not. **Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** `GET /api/c2c/project-vault/:id`, the Vault header, and AnA's
screen context for the Vault. Not behind a toggle.

## The defect

`documentCount` was `countDocs(tree)`: every leaf of the tree. The Vault header
and AnA's screen context (`facts.totalDocuments`, and the summary "Document
vault: N document(s) in the tree") counted the same leaves on the client
(`allDocs.length`). That meant:

- **An authored document counted once per rule-pack section.** One IND whose
  pack has 40 sections, with no uploads, showed "40 documents", and AnA was told
  `totalDocuments: 40`.
- **Uploads counted as the page the tree carries, not the programme.** The
  uploads read is capped (`VAULT_TREE_MAX_DOCS`, default 2,000). Above the cap,
  the header gave the page size while the note directly below it, from the same
  response, said "showing 2,000 of 2,500".

## The fix

- The server counts documents per branch and returns the breakdown:
  `documentCounts = { authored, cmcArtifacts, uploads }`. `authored` counts
  authored documents, one each however many sections. `cmcArtifacts` counts
  the governed Module 3 artifacts. `uploads` is the programme-wide total
  (`uploadsWindow.total`). A branch that could not be read is `null`, unknown
  rather than zero, and `unavailable` already says why. `documentCount` is the
  sum of the known branches. `countDocs` is removed; nothing else used it.
- The header shows the server's `documentCount`, and nothing while the read is
  pending. AnA's context reports `totalDocuments` from the server, with the
  breakdown, and its summary no longer calls tree entries documents.
- OQ-VAULT-04 (`tests/validation/oq/vault/run.mjs`) asserts
  `documentCount ≥ 1` after an upload. That still holds, because uploads are
  counted, and the step needs no change.

## Evidence

| File | Result |
|---|---|
| `red/unit-server-document-count.txt` | 3 failed. One IND with three sections: `expected 3 to be 1`. No `documentCounts` breakdown, so neither the programme-wide upload total (2,500 behind a 2-row page) nor an unreadable branch can be told apart. |
| `red/unit-client-document-count.txt` | 1 failed. The header read `IND · 21 CFR 312  3 documents` for one authored document. |
| `green/unit-document-count.txt` | 330 passed across 40 files: every `server/routes/c2c` test, both Vault surface files, and the editor panel. |

`ci:check-test-imports` and `ci:check-unrun-tests` pass with the new fixture
module. Typecheck: 0. ESLint is unchanged against HEAD for every changed file.

## Test-file move

`vaultSurface.test.tsx` would have gone past the 500-line lint limit. Its
fixtures (payload shapes and the api mock) moved, unchanged, to
`client/src/concept2cure/v2/__tests__/_vault-surface-fixtures.ts`, which is not
a test file. The two cases about what AnA is told (this change and the upload
completion fix) moved to `vaultSurfaceAnaContext.test.tsx`. No assertion was
changed by the move; the 21 cases pass in their new places.
