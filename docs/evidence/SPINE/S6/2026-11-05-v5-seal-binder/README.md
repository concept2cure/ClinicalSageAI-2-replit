# S6 V5: a seal shows what it holds (2026-11-05)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`: Vault at Veeva parity, on the existing Vault. D6 §8 item 2 hands S6
"binders as a view", to land "as a section or a view here, never a new screen". This slice adds a section inside the
existing Seals view. It changes behaviour only and leaves D6-3's layout (`.design/claude-convergence/D6.md` §C) as it
is.

## The defect

A Vault seal is an e-signed snapshot of the project's current documents (VR-19). The Seals view showed each seal's
date, signer, reason, document count and manifest hash, and nothing else. To learn which document versions a seal
pinned, a person had to verify the seal intact, download its closing archive and open the ZIP's `manifest.json` or
`INDEX.txt`. A seal that did not verify intact offered no archive, so its contents could not be seen at all.

The list of documents was already stored. `recordSeal` writes the whole manifest to
`public.vault_data_room_seals.manifest`. `listSeals` did not select that column.

## What already exists

- **The manifest.** `SealDocument` (`server/services/vault/vault-seal.service.ts:32`) records each sealed version's id,
  code, title, version, content hash, folder, CTD section, index number, filing and lifecycle stage. `recordSeal`
  (`:140`) stores it, and `sealManifestSha256` is the one hash recipe shared by a seal and its verifier.
- **The list.** `listSeals` (`:222`) answers `GET /api/c2c/project-vault/:id/seals`
  (`server/routes/c2c/project-vault.ts:2967`), which passes its result through unchanged. The route is not edited
  here.
- **The verdict.** `verifySeal` (`:248`) reads the live documents and says intact, changed or could not verify.
  It checks that each sealed version is still recorded with its sealed hash. It does not check whether that version
  is still the current one.
- **The closing archive.** `server/services/vault/vault-seal-archive.ts` (VR-20) puts the manifest and an index in a
  ZIP, for an intact seal only.
- **The open path.** `useVaultVersionViewer` and `VaultVersionViewer`
  (`client/src/concept2cure/v2/surfaces/VaultVersionViewer.tsx:55`, `:81`) are what a document's Versions section
  uses (`VaultVersions.tsx:510`). They call `downloadVaultFile` (`v2/editor/vaultPdfViewer.tsx:62`), which uses the
  audited route `GET /api/c2c/project-vault/:id/documents/:documentId/download` (`project-vault.ts:2350`). That route
  serves any version of the project that is not deleted and whose stored file is available, superseded versions
  included. It verifies the bytes against the recorded hash and records the download. A PDF is framed. Any other
  file is downloaded, and the note says why.
- **The list style.** The Vault lists versions as `.vd-vers` > `.vd-ver` (`VersionRows` in `VaultVersions.tsx`,
  `ArtifactVersions` in `VaultGovernedArtifacts.tsx`) and shows an index number as `.vd-num` (the library row in
  `Vault.tsx`).
- **The stage in words.** `stageLabel` (`v2/surfaces/VaultLifecycle.tsx:128`), the words the library row and the
  record already use.
- **"Binders / export"** in D6 §C.1 is `VaultFolderExport.tsx`, a folder's export ZIP. It does not show a seal's
  contents.

Searches run:
- over `server`: `listSeals`, `recordSeal`, `SealDocument`, `manifest.documents`, `vault_data_room_seals`, and
  `/seals` callers. The only consumers of `listSeals` are the route and its tests.
- over `client/src/concept2cure`: `VaultSeals`, `vault-seal`, `binder`, `VaultSealShape`, the `/download` callers,
  and `useVaultPdfViewer|downloadVaultFile|presentOpenedFile`.
- deleted files, via `git log --all --diff-filter=D` on `*Seal*`, `*seal*`, `*Binder*`, `*binder*`, found four:
  - `components/ana/SealBadge.tsx` and `useVerifiedSeal.ts`, AnA's sealed-export signature, deleted 2026-08-04
    with the old shell;
  - `services/ivdrBinderApi.ts` and `components/regulatory/EvidenceBinderTable.tsx`, IVDR claim binders, deleted
    2026-06 as dead code.

  None of them was a view of a Vault seal's contents.

## What changed

| Where | Before | After |
|---|---|---|
| `vault-seal.service.ts` `listSeals` | Each seal's when, who, why, count and hash | The same, plus `documents`, read from the seal's stored manifest only: id, title, version, index number, the first 12 characters of the sealed hash, and stage. No live document is read, because a seal is a snapshot. |
| `vault-seal.service.ts` `sealHoldings` (new, not exported) | none | `documents` is `null`, meaning not read, when the stored manifest is not this schema (`vault-data-room-seal/1`), is malformed, or no longer hashes to its recorded value. An altered record does not list what was signed. `verifySeal` already treats that record as could-not-verify. |
| `VaultSeals.tsx` `SealHoldings` | none | Under each seal, a closed `<details className="pj-more">` titled "What it holds · N documents". Each row is in the `.vd-ver` style: the index number, then the title and version as sealed, then the stage and short hash. **Open** reads that version through `useVaultVersionViewer`. |
| `VaultSeals.tsx`, honest states | none | A record that could not be read says: "What this seal holds could not be read from its record. This is not an empty seal. Verify it to check the record." It is never shown as empty, and the seal itself is still listed. A seal of a Vault with no current documents says: "This seal holds no documents. The Vault had no current documents when it was sealed." |

No new source file, route, table or screen. The client still validates the seal list as before. A seal whose
`documents` field is missing or malformed shows the "could not be read" line. It does not fail the whole list.

**Not claimed: "no longer the current version".** Nothing the Seals view reads says whether a sealed version has
since been superseded. The manifest is the snapshot. `verifySeal` checks presence and hash, so a sealed version
superseded since still verifies intact, which is correct: the sealed version is unchanged. Saying so would need a
live read, and this slice adds none. The row therefore says nothing about it.

## Capability kept

Nothing is removed or moved. The seal row keeps its head line, reason, Verify, verdict, closing archive and note. The
section keeps its heading, count, "Seal this Vault…" and "What a seal records". The closing archive is still the way
to take a seal's files and manifest away as one verified file. `vaultWorkArea.test.tsx` (13 of 13) still passes. It
pins the Seals view's quiet act and its closed "What a seal records".

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The two seal suites with the new cases, against the unchanged service and view: 7 of 26 fail, and they are the 7 new cases. The server's `documents` is `undefined`, and the client finds no "What it holds". The 19 existing cases pass. |
| `02-green.txt` | The same suites with the change: 26 of 26. That is `vault-seal.service.test.ts` 12 (3 new) and `vaultSeals.test.tsx` 14 (4 new). |
| `03-guards-fail.txt` | Each guard removed in turn, and the case written for it fails. M1: the hash check, so an altered manifest is listed. M2: the schema check, so an unknown recipe is read. M3: the client shows an unread record as empty. The sources were restored, checked with `cmp`. |
| `04-db-green.txt`, `running-app-*.png` | Real PostgreSQL and the running app; see below. |

The new cases:
- **Server.**
  - The list returns the manifest's documents and sends one statement, none of it to `vault.documents`.
  - A seal of an empty Vault holds `[]`.
  - Five unreadable records each give `null`, beside a good one that lists: missing, unknown schema, malformed,
    an entry with no id, and altered.
- **Client.**
  - The disclosure is a closed `pj-more` with the row text as sealed.
  - Open calls `GET …/documents/:id/download` and hands the file over with the viewer's note.
  - The zero-documents line.
  - Three unreadable forms (`null`, missing, malformed) each say "could not be read". None reads as empty, and the
    seal list is not failed.

ESLint (`npx eslint --max-warnings 0`) on the two source files and the two test files: no errors or warnings before
or after. `complexity` (15) and `max-lines-per-function` (100) apply to both source files.

## The running app and real PostgreSQL (the lead session, after the hand-off)

- **`04-db-green.txt`.** `tests/db/vault-data-room-seal.dbtest.ts` on PostgreSQL 16 as `app_service`, with one
  assertion added to its listing case: the listed seal holds its 3 documents, each with a 12-character hash. So the
  list's manifest, read back from `jsonb`, still hashes to its recorded value. 19 of 19.
- **`running-app-holds.png`, `running-app-open.png`.** The dev server, on the biotech demo project. One seal was made
  through `POST …/seals` with the e-signature ceremony. The dev account's password hash was set for that one call, and
  its original hash was put back and checked after.
  - Seals & fixity lists the seal. "What it holds · 6 documents" opens to the six sealed versions, each with its index
    number, version, stage and short hash.
  - Open frames the sealed PDF through the audited download, with "SHA-256 9f2e02c4e112… verified against the vault
    record before it was served".
  - The console was clean, and there were no failed requests.
- **Not seen live:** a non-PDF sealed file, and a seal whose record could not be read. The demo data holds neither.
  Both are covered in jsdom.

## Not done here

- **"No longer the current version"** needs a live read; see "What changed". If wanted, the one place that already
  reads the sealed versions live is `verifySeal`. Whether it should also report supersession is a decision for the
  lead.
