# D5: Edit details in the Vault, and a re-upload that changes nothing

**Row:** D5 (§11.10(e): a change records what it changed, who made it and why).
**Workstream:** the AnA client-files lane (`…01DiJJAk`). **Date:** 2026-09-26.
**Source:** VR-05 in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. Per its
ownership note, it is executed in this lane, and its file list includes
`project-vault.ts`, `Vault.tsx` and `useVaultUpload.ts`.

This completes VR-05. Two earlier changes today supplied its first parts: the
re-upload that keeps what was recorded
(`docs/evidence/D5/2026-09-26-vault-reupload/`) and the governed writer
(`docs/evidence/D5/2026-09-26-vault-metadata-edit/`).

## What a user can do now

- **Edit details.** The Vault detail pane has a **Details** section showing the
  version's recorded title, type and classification. **Edit details** opens a
  form with those three fields and a required **Reason for change** (at least 8
  characters). **Save details** is enabled only when a field has changed and the
  reason is long enough. The pane says the change is recorded only after the
  server confirms it. A refusal, such as a viewer or a rejected value, is shown
  as an alert, and the displayed values stay as recorded. The document's
  **History** then shows the change.
- **Route.** `POST /api/c2c/project-vault/:id/documents/:documentId/details`
  sits behind `requireEditorAccess`, like filing. It carries only the request's
  own fields and the session's identity; an `organizationId` in the body is
  ignored. It calls `editVaultDocumentMetadata`.
- **Re-uploading a file the Vault already holds changes nothing descriptive.**
  Title, type, classification and filing are no longer in the ingest's
  `ON CONFLICT … DO UPDATE`. The response carries
  `reupload: { unchanged, changes, differs }`, where `differs` lists the values
  the upload asked for that the record does not have. The upload message reads
  "Already in the Vault, nothing changed: protocol.pdf (as "Protocol")". When
  something differs, it adds that the title, type or classification is changed
  with Edit details, not by uploading again. Before this change it reported
  such a file as "Auto-filed … suggested until confirmed".

## Two behaviours removed, and their replacements (working agreement)

| Removed | Replacement, by path | Proven reachable by |
|---|---|---|
| Changing a title, type or classification by re-uploading the same bytes | Edit details: `client/src/concept2cure/v2/surfaces/VaultEditDetails.tsx`, rendered in the Vault detail pane (`Vault.tsx`), which posts to the route above, which calls `server/services/vault/vault-metadata-edit.service.ts` | `vaultEditDetails.test.tsx` (the form and its request), `server/routes/c2c/__tests__/vault-document-details-route.test.ts` (the route and its gate), `tests/db/vault-metadata-edit.dbtest.ts` (the write and its audit row, as `app_service` with RLS on) |
| Re-proposing a filing on a retry of the same bytes | Confirm filing and Move in the Vault detail pane (`Vault.tsx`), through `placeVaultDocument` | `tests/db/vault-placement.dbtest.ts`; the Vault client suites (`vaultFiledDocumentVisible`, `vaultSearchSelection` and others) |

No file, route or surface was deleted.

## Evidence

| File | Result |
|---|---|
| `red/db-reupload-retitles.txt` | Against HEAD's ingest: 2 failed, 1 passed. A retry asking for "Clinical protocol v1" retitled the record, and the response had no `differs`. |
| `red/unit-upload-already-recorded.txt` | Against HEAD's `useVaultUpload`: 1 failed, 5 passed. A file the Vault already held was reported as auto-filed, and the outcome had no `alreadyRecorded`. |
| `green/db-vault-suites.txt` | 108 passed across 14 files: every `tests/db/vault-*`, `document-catalog*` and `chat-upload*` suite, as `app_service` with RLS on, including `vault-reupload`, `vault-metadata-edit`, `vault-placement` and `vault-ingest`. |
| `green/unit-vault-client-and-routes.txt` | 496 passed across 61 files: every Vault client suite, `vaultEditDetails` (5) and `useVaultUpload` (6); every `server/routes/c2c` suite, including the new route test (5); and every suite that drives the ingest. |

Gates, all passing: `check:microcopy`, `ci:internals-in-copy`,
`ci:action-overclaim`, `ci:success-before-ok`, `ci:check-client-api-calls`,
`ci:design-system`, `ci:empty-state-honesty`, `ci:error-envelope`,
`ci:ana-surface-context`, `ci:launch-scope-api` (and its selftest),
`ci:tenant-isolation`, `ci:requestdb-coverage`, `ci:unreferenced-modules`,
`ci:discarded-audit-write`. ESLint is unchanged against HEAD on every changed
file, and the new files have 0 warnings; the new component was split into a
view, a form and a hook to stay under the complexity limits.

## Not done here

- **Lineage on the ingest body.** `supersedesId` and `parentDocumentId` are
  still accepted as bare UUIDs (`server/routes/vault-ingest.ts`). No client
  sends them. Refusing them is in VR-05's list, and it belongs with whoever
  defines how lineage is set, which today is nothing.
- **The filing audit row's evidence kind.** VR-05 also asks that `writePlacement`'s
  audit row carry `evidenceKind` in from/to. That is a separate, small change to
  the placement writer.
- **VR-06's trigger.** With this change no ingest path rewrites a version's
  descriptive fields, so the trigger's column rules can be written as the plan
  states them. The trigger itself is unclaimed.
