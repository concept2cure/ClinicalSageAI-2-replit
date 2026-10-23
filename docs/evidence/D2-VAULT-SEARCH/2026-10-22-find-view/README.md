# D2: the Vault find view filters by metadata, and a file found in the editor's rail can be cited (VR-18, client half)

**Launch row:** D2. **Workstream:** Vault, Veeva gap 7 slice B (`docs/design/VEEVA_GAP_2026-10-22.md` §7).
**Naming (Rule 3):** this *completes* VR-18's client half on the existing find view (`Vault.tsx`), and *fixes* the
files rail's hit key by *converging* two hit mappers onto one. No surface and no UI file is added. The only new file
is the test.
**Server half:** `docs/evidence/D2-VAULT-SEARCH/2026-10-22/` (`beee2f54c3`).

## What already exists

| Path | What it did | What it did not do |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/Vault.tsx` find view | Search box, "Include earlier versions" and "Accessible projects" in the breadcrumb bar. It reads `/:id/search` through `useLiveData` + `isVaultSearchShape`, and keeps a failed read apart from an empty one. | It had no filter of any kind, and an empty box was always the folder tree. |
| `Vault.tsx` `searchHitToDoc` | Maps a hit to the tree's row, keyed `up-<uuid>` (the tree's key), with the reader's type label. | It was private to `Vault.tsx`. |
| `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx` `hitToDoc` | A second copy of that mapping, for the editor's files rail. | It keyed a hit by its bare uuid and showed the raw type token. A hit never met its tree row, so the row had no checksum, and a file found by search could not be cited. `projectVaultSearch.test.tsx` hid this by giving the tree row and the hit the same id. |
| `client/src/concept2cure/v2/editor/projectVaultSearch.ts` `SearchHit` | The rail's hit type. | It was a second copy of `VaultSearchHit` (`VaultLibraryResults.tsx`). |
| `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` | Library search, with honest states. | It took text only. |
| `VaultEditDetails.tsx` `CLASSIFICATION_LABEL` | The reader's words for the classifications. | The map was private to that file. |
| `shared/navigation/surface-actions.ts` `vault.search` | AnA's description of the action. | It said the search "filters the filing-cabinet tree … to title matches". It does neither: it is full text over title, file name and body, and the tree is not filtered. |

## What changed

- **One hit mapper.** `searchHitToDoc` moved to `VaultLibraryResults.tsx`, beside `VaultSearchHit` and `isVaultSearchShape`. Both `Vault.tsx` and `ProjectFilesPanel.tsx` use it, and the files rail's `hitToDoc` is deleted.
  - The rail now selects and renders a hit by the tree's key, so a hit carries its tree row's checksum and can be cited.
  - It also shows the reader's type label.
  - The rail's `SearchHit` is now an alias of `VaultSearchHit`.
  - `VaultSearchHit` gains the metadata the server now returns: `evidenceKind`, `classification`, `lifecycleStage` and `updatedAt`. A hit's review stage now reaches the row.
- **The filter row.** `VaultFindFilterRow` sits in `Vault.tsx`, under the search bar, as a `role=group` named "Filter documents". It has Type, Filing, Classification, Evidence kind, Review and CTD section, plus "Clear filters".
  - **Vocabularies:** each control's options come from the vocabulary the server checks: `VAULT_INGEST_DOCUMENT_TYPES`, the tree's filing words, `VAULT_CLASSIFICATIONS` (labels now shared as `VAULT_CLASSIFICATION_LABELS`), `VAULT_DOC_KINDS`, and `VAULT_STAGE_CHOICES`.
  - **Review stages:** `VAULT_STAGE_CHOICES` is new in `VaultLifecycle.tsx`, beside `STAGE_LABEL`. "Approved" covers every approved stage (`APPROVED_STAGES`), and "Not sent for review" covers no record or `authoring`, so the filter and the row's stage words agree.
  - **CTD section:** it is applied on Enter or when the field is left. It is normalised with `normalizeCtdCode` and sent only when it is a code. Otherwise the row says it is not applied, and nothing is sent in its place.
- **Finding is text, filters, or both.**
  - **Filters alone** browse what they select. The breadcrumb reads "Filtered — N of total", and a verified empty read says "No documents match these filters."
  - **A failed read** stays the alert it was.
  - **Library mode** sends the same filters (`vaultFilterParams`), and its headline says "match the filters" or "match "x" and the filters".
  - **Leaving the find view** clears the text and the filters together: a folder in the tree, the crumb, "Open in Vault", AnA's open-folder.
- **AnA's context** now carries the filters (`facts.filters`), and its summaries say what is narrowing the list.
  - The phrase "filtered to N", whose absence a test asserts after a failed read, is kept on purpose.
  - The stale upload description ("auto-classified to a suggested dossier folder") now says what the uploader does.

## Verified by making the checks fail

- **`red.txt`:** the new tests, with `Vault.tsx` and `ProjectFilesPanel.tsx` at trunk, give **9 failed**. Eight are the filter-row cases. The ninth is the files rail, where the hit never meets its tree row once the fixture keys it the way the server does.
- **`green.txt`:** after the change, 168 files and 2,059 tests pass. That covers every Vault surface test, the editor tests, AnA's screen tests and `shared/`.
- **Gates:** typecheck clean, `ci:undefined-css-classes` OK, ESLint warning ratchet unchanged.

## What remains

- **Facet counts in the options** (VR-18 "with counts"): next.
- **Saved views:** personal and organisation-wide (founder 2026-10-22). Their design is in progress.
- **One client reader:** the find view still reads up to 100 rows through `useLiveData`, while the rail pages through `useProjectVaultSearch`. Converging them is recorded in the gap 7 plan and not done here.
