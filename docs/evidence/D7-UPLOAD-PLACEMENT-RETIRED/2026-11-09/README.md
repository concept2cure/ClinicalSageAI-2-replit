# P-108 3(b): an upload is no longer placed in a sequence; an upload already filed can still be withdrawn (row D7, 2026-11-09)

## The decision, verbatim

- **P-108 item 3(b)** (founder, 2026-11-08): "Retire ctd_onboarding_documents as a source of placeable leaves; it has no
  upload caller in any history and no deploy applier. Its replacement is VaultPlaceIntoSubmission.tsx." Answer: "Accept
  both."
- **The coordinating session's confirmation of the scope** (2026-11-09):
  > One refusal at `upsertLeaf` for any new content (any lifecycle op except `delete`) that names
  > `ctd_onboarding_documents`, in your words, ending "Nothing was placed." … The vocabulary is unchanged. Existing
  > upload leaves still resolve, readiness still judges them under C1, and a filed upload can still be withdrawn. …
  > AnA's enum keeps the table for withdrawals, and the refusal answers everything else. … Red first: one case each
  > for REST, AnA and MCP reaching `upsertLeaf` with new upload content, plus a passing withdrawal of an existing
  > upload leaf.

The upload route itself (`POST /api/ctd/projects/:id/upload`) is item 5, a separate commit after this one.

## What already exists (RULE 3)

- **The one vocabulary** is `server/services/ectd/leaf-document-tables.ts`. `isPlaceableDocumentTable` decides
  which stores a leaf may name.
  - Its readers are the REST schema, `upsertLeaf`, AnA, dispatch-readiness, the readiness resolver and the Builder's
    evidence reader.
  - Taking the upload store out of it would turn every placed or filed upload leaf, and every withdrawal of one, into
    an "unknown table". So the vocabulary is not changed.
- **The one write** is `upsertLeaf` (`server/services/submission-service/submission-service.ts`). It already refuses
  an unknown table, a mismatched key space, another tenant's document and another project's document, before anything
  is written.
- **The three doors** that reach it with a document pointer:
  - REST `PUT /api/submissions/sequences/:seqId/leaves` (`server/routes/submissions.ts`);
  - AnA's `place_into_sequence` (`server/services/ana/AnaToolExecutor.ts`), whose lifecycle filter allows `delete`;
  - the MCP connector's `c2c_file_draft_for_review` (`server/mcp/tools/governed.ts`), whose enum names the upload
    store and whose lifecycle enum has no `delete`.
- **No client screen places an upload**, in this tree or in this clone's history (`history-searches.txt`, search 1).
  The only client line that ever named the store is `SubmissionRequiredDeliverables.tsx`'s type guard on an evidence
  reference it reads.
- **The replacement** is `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx`, mounted by `Vault.tsx`
  (line 3284). Its reach is proven by `vaultPlaceIntoSubmission.test.tsx`, `vaultPlaceIntoSubmissionDialog.test.tsx`,
  `vaultPlaceFromVault.test.tsx`, `vaultPlaceOccupancy.test.tsx` and `authoringVaultPlacementFlow.test.tsx`, all run in
  `green.txt`.
- **P-94 C1** (`380fa4782`) already makes readiness and transmit refuse an upload whose bytes no Vault version of its
  project has approved. That stays, for the uploads already on file.

## The change

- **`retiredPlacementRefusal(table, lifecycleOp)`** in `leaf-document-tables.ts`, beside the vocabulary. It stays
  pure, with no imports.
  - It answers only for a store listed as withdrawal-only. Today that is `ctd_onboarding_documents`.
  - Only the exact operation `delete` passes. An absent operation does not pass: on a rewrite it would keep whatever
    operation the leaf already has.
- **`upsertLeaf`** calls it right after the vocabulary check, before the document is read and before anything is
  written, on a create and on a rewrite alike. The refusal is `VALIDATION` (400):
  > Uploads are no longer placed in a sequence. Upload the file to the project’s Vault, approve it there, and place
  > that Vault version. An upload already filed can still be withdrawn (lifecycle operation delete). Nothing was
  > placed.
  - The sentence names no decision number. A person filing does not know P-108; the code comments carry it.
- **Unchanged:**
  - the vocabulary, AnA's and MCP's enums, the REST schema and the readers;
  - P-94's release rule for uploads already on file;
  - removing a misplaced upload leaf (`removeLeaf`, `DELETE …/leaves/:leafId`), which is not `upsertLeaf`.
- No migration, no route, no screen, no client change.

## What a person reads

- **A tool or API caller that tries to place an upload:** the sentence above, word for word, from every door.
  - REST answers 400 `{ code: 'VALIDATION', message }`.
  - AnA returns `place_into_sequence failed: <sentence>`.
  - MCP is refused with `<sentence> (code VALIDATION)`.
- **What they do:** upload the same file to the project's Vault, approve it there, and place that version from the
  Vault ("Place into submission", `VaultPlaceIntoSubmission.tsx`).
- **To withdraw an upload already filed:** place a leaf with lifecycle operation `delete` naming it, as before.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | before the change: every new-content case is placed (5 service cases against PGlite, and REST, AnA and MCP); both withdrawals pass |
| `green.txt` | the submission-service, ectd, MCP, ingestion, CMC, pathway-engines and submissions-route suites, AnA's submission tools, and the replacement's client reach tests (`vaultPlace*`, `authoringVaultPlacementFlow`): 4847 pass, none fail |
| `mutation-1-upsertleaf-never-refuses` | the refusal is computed and not thrown: the five service cases and all three doors fail |
| `mutation-2-withdrawal-refused-too` | `delete` is refused as well: both withdrawals (service and AnA) fail |
| `mutation-3-absent-op-counts-as-withdrawal` | an absent operation passes: the "none given" case, the rewrite and the AnA door (which sends no operation) fail |
| `mutation-4-rewrite-not-judged` | only a create is judged: the rewrite of an upload leaf placed before this change fails |
| `history-searches.txt` | the deletion record's searches: client history, deleted files, the doors, the replacement's mount and reach tests |

The tests:
- `server/services/submission-service/__tests__/upload-placement-retired.pglite.test.ts`, against real SQL:
  - a withdrawal of the filed upload is placed;
  - four lifecycle cases (none given, new, replace, append) are refused and write nothing;
  - a rewrite of an upload leaf placed before this change is refused and leaves the row as it was.
- `server/services/submission-service/__tests__/upload-placement-retired-doors.test.ts`:
  - REST, AnA and MCP each hand back the sentence and write nothing;
  - AnA still places a withdrawal.

Two existing cases placed an upload as new content, and now name the path that remains, a withdrawal. Neither
assertion changed:
- `leaf-document-table-allowlist.test.ts`: "accepts ctd_onboarding_documents" now places it with lifecycle operation
  `delete`. The table stays in the vocabulary.
- `leaf-source-tenancy.pglite.test.ts`: another organization's upload is still refused as "not found for this
  organization", now on a withdrawal. The tenancy check covers the one placement the store still takes.

## Not done here

- **Item 5, the upload route** (`POST /api/ctd/projects/:id/upload`). It is the next commit, option (a) by the
  coordinating session's ruling: the handler is removed, with a route test that it answers 404.
- **The rest of `/api/ctd`** (list, get, validate, detect-section) is noted under RIM's row as an R1 candidate, to be
  judged on its own history.
- **AnA's tool description** for `place_into_sequence` (`server/services/ana/submission-center-tool-defs.ts`) still
  lists the upload store among the stores materialized into a package. That is true of the uploads already on file. A
  new placement is answered by the refusal. The wording is left to that file's holder.

## Plan

`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`, `Completes:
server/services/ectd/leaf-document-tables.ts`.
