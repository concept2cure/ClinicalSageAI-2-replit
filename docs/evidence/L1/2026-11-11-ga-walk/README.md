# L1 — this session's changes, walked in the running product (2026-11-11)

The security fixes of 2026-11-06 to 2026-11-10 (the zod 4 move, the Vault folder reason, the audit labels, the
role gates, the program id check) had been proven by tests only. This is the walk in the running app, what it
found, and what was fixed.

## What was run

- **Database:** local PostgreSQL 16, a new empty database provisioned the supported way:
  `scripts/db/install-fresh.mjs` (1,330 tables, every integer tenant-keyed table policied), then
  `scripts/db/deploy-migrate.mjs` (470 of 470 files), then `scripts/seed-ga-demo.mjs`. The `vector` extension was
  installed from the system package and created by the superuser first.
  A first attempt on the container's pre-existing database (bootstrapped without the Drizzle push) answered 500 on
  `/api/client-branding/company-documents/legacy-adoption` because `project_memory_entries` did not exist there;
  on the properly provisioned database that read is clean. It was the environment, not the product.
- **Server:** `tsx server/index.ts`, `NODE_ENV=development`, `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, port 5100.
  `/readyz`: database, schema and storage ok; AnA down (no model key in this container).
- **Browser:** Playwright with the preinstalled Chromium, 1440×900, signed in through the product's sign-in page as
  the demo administrator (`jm.smith@…`), and as a team member whose organization role was set to `viewer` for the
  walk.

## What already exists

Everything walked is an existing screen: Home, a project's page (`ProjectHome`), the Vault (`Vault.tsx`,
`VaultFolderEdit.tsx`, `vaultFolders.ts`), the audit trail (`AdminSurfaces.tsx` over
`audit-trail-ledger.routes.ts`), New project, Admin console → Settings (`CompanyLetterheadPreview.tsx`). No screen,
route, service or table was added.

## Walked and working

| What | Result in the running app |
|---|---|
| A demo program's project page (`BX-204`, id `11111111-2222-3333-4444-000000000204`) | `GET /api/project-hierarchy/14/children?programId=…` answers 200 (400 before `2dd59705dd`) and the page renders |
| A folder change with a short reason, sent straight to the API with the app's token | 400 `REASON_REQUIRED`, "A reason for change of at least 8 characters is required. Nothing was saved." for `"x"` and for `""` |
| Make, rename and remove a folder through the Vault's form | 200 each; the form's save stays disabled under 8 characters |
| The audit trail | The three changes are listed under Vault; opening a row shows "Reason for change" with the sentence the person typed |
| A viewer in the Vault | No New folder, Upload or Add files control; a direct folder POST answers 403 "Your current project permissions do not permit this change. Nothing was changed." |
| New project (IND, biologic) | Continue is disabled until the required fields are filled; `POST /api/c2c/projects` 201; the project opens on its plan |
| Upload a PDF to the new project's Vault, then confirm its suggested filing | `POST /api/vault/ingest` 201, auto-filed to Module 4 as suggested; Confirm filing 200, `placementStatus: confirmed` |

The eleven role-gated research routers (`901a91ccfe`) have no screen in the launch product: under
`LAUNCH_SCOPE_ENFORCE=on` they are API-only, refused as out of scope, or have no client caller, so that refusal is
not shown anywhere a GA customer can reach.

## Found on the walk, and fixed (each red first)

1. **New folder did nothing in a new project's Vault.** With no documents the Vault rendered only its empty state;
   the folder form and the folder tree live in the cabinet, which was not rendered, so the button changed nothing
   on screen and a folder made before any document was never shown. `vaultShowsCabinet` (`vaultFolders.ts`) now
   shows the cabinet once the form is open or a person has made a folder.
   Screenshot: `vault-new-folder-in-empty-vault.png`. Test: `vaultFolders.test.ts`.
2. **The audit trail did not say which folder.** A row read "Folder renamed" against the target
   `vault_folder:uf:1`. `vault-folders.ts` now writes a sentence from the facts the row already carries:
   "Folder renamed: Pivotal clinical study -> Pivotal study BX-204-301", "Folder made: …, at the top of the
   cabinet". Screenshot: `audit-trail-folder-row-with-reason.png`. Test: `vault-folders.test.ts`.
3. **A missing value read "Invalid input: expected string, received undefined".** zod 3 said "Required"; about
   twenty routes hand zod's first message to the screen (organisation profile, setup, legal holds, company
   documents). Walked: `PATCH /api/organizations/2/profile {}` answered the zod 4 sentence. `shared/zod-messages.ts`
   sets the wording once through zod's global configuration, loaded by the server, the browser and the test setup;
   a message a schema states itself still wins, and a wrong type keeps zod's sentence. After: `"error":"Required"`.
   Test: `shared/__tests__/zod-messages.test.ts`.
4. **A viewer's empty Vault told them to "Add files".** They have no such control. The empty state now says
   "Your access to this project is view only." Screenshot: `vault-viewer-empty-state.png`.
5. **Two `main` landmarks on Admin console → Settings.** The letterhead preview drew its page body as `<main>`
   inside the Shell's own. It is a `div` now (`CompanyLetterheadPreview.tsx`, `company-documents.css`).
   Test: `companyDocumentReviewTools.test.tsx`.

## Not walked, and why

- **AnA's reason-tier confirmation for making a folder, and `commit_document_revision`'s refusals:** no model key
  here, so AnA cannot be driven to propose a call. The card reads the tier from the server's proposal
  (`useGovernedAction.ts`, `GovernedActionSignoff.tsx`), with no tool list of its own, and the server side is
  covered by `governed-tool-gate.test.ts` and `document-placement-tools.test.ts`.
- **Filing one document still takes no required reason** (confirm sent `{"confirm":true}` and the server recorded
  "Suggested filing confirmed (…)"). That is decision 1 in `../2026-11-10-security-review/README.md`, the
  founder's; it was not changed.
- **390 px and dark theme** were not captured on this pass.
