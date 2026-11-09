# P-108 3(b), item 5: the onboarding upload route is removed (row D7, 2026-11-09)

## The decision and the ruling, verbatim

- **P-108 item 3(b)** (founder, 2026-11-08): "Retire ctd_onboarding_documents as a source of placeable leaves; it has
  no upload caller in any history and no deploy applier. Its replacement is VaultPlaceIntoSubmission.tsx."
- **The coordinating session, 2026-11-09:**
  > Item 5: the upload route can go too, as its own commit after 3(b). It has no client caller in any history, and its
  > capability is reachable elsewhere (Vault upload, then approve, then place). That meets P-107's retirement rule,
  > and RIM is its owning lane. … The table stays. No DROP (RULE 1): existing rows are history and still resolve.
  >
  > **Item 5: (a).** Remove only the upload handler from `server/routes/ctd-onboarding.ts`, with no exclusion entry,
  > plus a route test that POST `/api/ctd/projects/:id/upload` answers 404. … The rest of `/api/ctd` (list, get,
  > validate, detect-section) gets its own uncalled-route retirement through R1's rule, judged on its own history.

Option (a), because `LAUNCH_EXCLUDED_API` matches static path prefixes and cannot name `/projects/:id/upload` alone.
Unmounting the whole `/api/ctd` router would have retired four reads that were not approved.

## What already exists (RULE 3)

- **`POST /api/ctd/projects/:id/upload`** (`server/routes/ctd-onboarding.ts`, mounted at `/api/ctd` by
  `server/bootstrap/register-document-routes.ts`):
  - It took a multipart file into `uploads/ctd/` through its own multer configuration, with the shared magic-byte and
    antivirus check (`assertUploadSafe`).
  - It then wrote a `ctd_onboarding_documents` row through `uploadCTDDocument` (`server/services/ctd-ingestion-service.ts`),
    marked matching compliance gaps resolved, and recalculated the project's completion.
  - That row is the "upload" P-108 3(b) retired as a placeable source (`b14086c7d`).
- **No caller.** No client commit in this clone's history ever named `/api/ctd` (`history-searches.txt`). Today the
  only references are the mount and the D2 retirement tests. `uploadCTDDocument` had one caller, this handler.
- **The replacement** is `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx`, mounted by `Vault.tsx`
  (line 3284). A file is uploaded to the project's Vault, approved there by the Vault's existing act, and that version
  is placed. Its reach tests (`vaultPlaceIntoSubmission*.test.tsx`, `vaultPlaceFromVault`, `vaultPlaceOccupancy`,
  `authoringVaultPlacementFlow`) ran green with 3(b) (`docs/evidence/D7-UPLOAD-PLACEMENT-RETIRED/2026-11-09/green.txt`).
- **The precedent** is `fb73f05f8` (D2, 2026-10-26). It removed `POST /api/ctd/projects` the same way: the handler
  went, the router and its reads stayed, and `ctd-project-creator-retired.test.ts` proves the retired route answers
  404.

## The change

- **`server/routes/ctd-onboarding.ts`:**
  - the upload handler is removed;
  - so is everything only it used: the multer configuration (which also created `uploads/ctd/` at import), `path`,
    `fs`, `assertUploadSafe` and the `uploadCTDDocument` import;
  - the header says what was removed, why, and the replacement by path.
- **`server/services/ctd-ingestion-service.ts`:** `uploadCTDDocument` and its input type `CTDDocumentUpload` are
  removed. They had no other caller, and leaving them would leave an unreachable writer.
  - `recalculateCompletion` stays; validation still calls it.
- **`server/bootstrap/register-document-routes.ts`:** the mount's log line no longer lists "upload".
- **Two D2 retirement tests** (`ctd-project-creator-retired.test.ts`, `legacy-secondary-project-creators-retired.test.ts`)
  drop the `uploadCTDDocument` key from their service mocks, because the function no longer exists. No assertion
  changed.
- **Unchanged:**
  - the table and its rows, which are history; they still resolve, readiness judges them under P-94, and a filed
    upload can still be withdrawn (3(b));
  - the router's four reads (list, get, validate, detect-section);
  - `LAUNCH_EXCLUDED_API`. No migration, no screen, no client change.

## Proof

| File | What it shows |
|---|---|
| `red.txt` | at `774cf5790`: a complete upload to `POST /api/ctd/projects/31/upload` is accepted (201) |
| `green.txt` | every test that imports or mocks the router or the ingestion service (30 pass), and the tests of the service's other importers (273 pass). The one failing file there fails the same 32 cases on the unchanged tree: the authoring signing gate refuses them `INDEPENDENT_CHECK_REQUIRED`, and the file does not touch this route |
| `mutation-1-upload-route-put-back` | a handler answering the route again: the 404 case fails |
| `history-searches.txt` | client history for `/api/ctd`, every commit naming `uploadCTDDocument`, today's callers, and the replacement's mount |

The test is `server/routes/__tests__/ctd-upload-route-retired.test.ts`:
- a complete multipart upload answers 404 and reaches no writer;
- the project read beside it still answers.

The red run wrote one file into the git-ignored `uploads/ctd/`. It was removed after the run.

## Not done here

- **The rest of `/api/ctd`** (`GET /projects`, `GET /projects/:id`, `POST /projects/:id/validate`,
  `POST /projects/:id/detect-section`) has no client caller in this tree either. Its retirement is an R1 candidate,
  judged on its own history. It is noted under RIM's row in `.design/claude-convergence/COORDINATION.md`.

## Plan

`Plan: F1`, `Completes: server/routes/ctd-onboarding.ts`, `Completes: server/services/ctd-ingestion-service.ts`.
