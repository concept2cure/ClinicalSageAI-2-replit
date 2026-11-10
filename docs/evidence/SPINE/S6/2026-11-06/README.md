# S6, 2026-11-06: the Vault's folders and binders, like Veeva's

The founder, 2026-11-06: *"I explicitly need to see a Vault user interface, files, folders, in accordance, just like
Veeva … templates and folders for the full IND pyramid of potential filing types across all the therapeutic areas and
regions … Anna needs to have autonomous control over all of this, agentically."*

Session `session_01QoxbLZMScz1c2iFESBLn9J`, started by the lead (`011Dpx…`). Run on a local Codespace-shaped database
(`.devcontainer/post-start.sh` with `C2C_DB_NAME=c2c_cs`: every demo pack seeded, the CDISC CSR study prepared), signed
in through `/api/auth/dev-login` as Ana Author, signed out at the end of each walk.

## What already exists (searched before building; RULE 3)

| Piece | Path | What it did | What it did not |
|---|---|---|---|
| The Vault surface | `client/src/concept2cure/v2/surfaces/Vault.tsx` | Five views, a recursive tree (`VaultTree`), "Move to…", upload staging | Make a folder. Its header's "Add a folder" uploaded a folder of files |
| The tree read | `server/routes/c2c/project-vault.ts` GET `/:id` | Authored documents as their rule-pack sections; governed artifacts; the filing cabinet (`filingCabinet`) | The cabinet was one fixed preset per view, at module level: an IND, an NDA and an MAA got the same five module folders |
| Folder presets | `shared/constants/domain/vault-taxonomy.ts` | CTD, device and TMF presets | Anything below module level, or per filing type or region |
| Filing a document | `server/services/vault/vault-placement.service.ts` (POST `/:id/file`, AnA's `place_project_document`) | One governed write with a chained audit row | File to anything but a preset folder |
| Folders as a store | `public.document_folders` (`migrations/0000_sweet_joseph.sql`, `shared/schema.ts`), legacy `server/routes/folder-management.js` (`/api/folders`) | Organisation-level folders | A project; any client caller |
| Filing-type outlines | `c2c_rule_packs` (IND, NDA, BLA, ANDA × FDA; MAA, CTA × EMA; J-NDA × PMDA; 510(k), De Novo eSTAR, PMA × FDA; EU MDR and IVDR Annex II; Health Canada MDL, PMDA IVD…), resolved by `server/services/c2c/document-class.ts` + `rule-pack-lookup.ts` | Each filing's outline, with the region's Module 1 (US, EU, JP) and CTD to section, or the device sections | Reach the Vault's cabinet: only authored documents read them |
| Regional Module 1 | `shared/regulatory/regional-module1.ts` | US, EU, JP trees | Any other region (none yet) |
| The pyramid | `services/regulatory/SubmissionPyramidEngine.ts`, `pyramids/*.ts`, `server/routes/pyramid.routes.ts` | Tasks with `documentBindings.ctdSection` | Any link to Vault (step 3) |

## Step 1: folders a person makes

- `migrations/20261106_document_folders_project_scope.sql` (in `C2C_MIGRATION_FILES` before the sweep pair):
  `document_folders` gains `program_id` and `parent_key`, and one name per sibling. Additive, guarded; applied twice
  on the local database without change; provisioned by `db:provision` on restart.
- `server/services/vault/vault-folders.ts`: the project's folder index (its binder, the presets the binder does not
  replace, the folders people made), and the two governed writers, `createProgramFolder` and `renameProgramFolder`:
  role gate, program write authority, a chained audit row naming who, when and the reason, in one transaction.
  A binder folder keeps the regulation's name; only a person's folder renames.
- `server/routes/c2c/project-vault.ts`: POST `/:id/folders`, POST `/:id/folders/:folderId/rename`; the cabinet draws
  the folders people made under the folder each was made in.
- Placement, upload-into-a-folder and folder export accept any folder of the project's index
  (`vault-placement.service.ts`, `vault-ingest.service.ts`, `vault-folder-export.ts`).
- `Vault.tsx`, `VaultFolderEdit.tsx`, `vaultFolders.ts`: "New folder" (made in the folder open in the tree) beside
  "Upload a folder" (the old "Add a folder", named for what it does); Rename on a person's folder; "Move to…" lists
  every folder at its depth.

Walk (`walk-folders.cjs`, log `walk-folders.json`), in the CSR study's Vault:

| | Before (`walk-before.cjs`, trunk `f5891e9d`) | After |
|---|---|---|
| Header | Inspection readiness · **Add a folder** · Add files | Inspection readiness · **New folder** · **Upload a folder** · Add files |
| Cabinet | "Source files · filing cabinet": Unfiled, Module 1–5, sequences, correspondence, templates | "Filing binder · IND × FDA …": FDA Module 1 and CTD to section, then sequences, correspondence, templates |

1. New folder, opened on 5.3 Clinical study reports, is made there (`after-1-new-folder-form.png`, `after-2-folder-made.png`).
2. Renamed, with a reason.
3. `adsl.xpt` moved into it through "Move to…", where it is listed indented under 5.3 (`after-3-move-to.png`,
   `after-4-document-in-folder.png`).
4. The audit trail (`audit-step1.txt`): `vault.folder.create`, `vault.folder.rename` and `vault.document.file`, each
   with the person, the time and the reason given.
5. At 390 (`after-5-phone-header.png`).

Checks run: `vault-folders.test.ts`, `vaultFolders.test.ts` (new); the cabinet, placement, export, ingest and AnA
placement suites; all 73 Vault client suites; `ci:one-product`, `ci:undefined-css-classes`,
`ci:check-shell-css-collisions`, `ci:migration-drop-safety`, `ci:migration-set-order`. `ci:check-css-selector-shadowing`
fails identically on trunk (`journey-v2.css`, `protocol-dev-editing.css`), not from this change.

## 2026-11-10: steps 2–4, and the multi-tenant repair

The founder: "the UI doesn't reflect all the Vault features yet … this is a multi tenant environment".

- **Survey** (every Vault route checked for a client caller): every `/api/c2c/project-vault`, `/api/vault/ingest` and
  legal-hold route is reached. What the person could not see was the binder: it sat below every authored document's
  draft outline, never said which outline it came from, and on an EU file listed empty US submission folders.
- **Step 2** (`walk-binders.cjs`, `walk-binders.json`, `screenshots/binder-*.png`): IND, NDA, MAA, 510(k), EU MDR and EU
  IVDR each open on their own binder, first in the tree, with "Binder from the filing's outline: … · version …".
- **Step 3** (`screenshots/plan-*.png`): Module 3 of the IND lists its four plan tasks (3.2.S, 3.2.P, manufacturing,
  stability); in the Plan, the drug substance task's folder button opens 3.2.S in the Vault.
- **Step 4** (`ana-folder-live.mts`, `ana-step4-live.txt`): AnA's folder made under RLS with `agent:ana` and her reason
  in the audit row; her listing holds the project's 100 folders; another organization is refused as "Project not found".
  The tool's handling is pinned by `document-placement-tools.test.ts` (four new cases red on the old handler).
- **Multi-tenant** (`tenant-isolation-folders.contract.test.ts`, two new cases, red on the old route): the
  organization-wide `/api/folders` route no longer lists, renames, deletes or parents a project's folders, which would
  have crossed project and sponsor lines inside one organization (a CRO's sponsors). Project folders are written only
  through the project's Vault route, under `requireCurrentVaultProgramWrite` (that project's access and role), and read
  bound to program and organization; every write carries a chained audit row.

Checks run: the cabinet, folder, export, placement and AnA document-tool suites; all 73 Vault client suites; the plan
and pyramid suites. `project-settings.pglite.test.ts` (6 cases) and `ci:check-css-selector-shadowing` fail identically
on trunk.

## Where this stops, for the next session

Open items are listed in `docs/design/ONE_DESIGN_PLAN.md` §3a, "S6 — The Vault's folders and filing binders"
("What the survey found"): multi-value search filters, moving or removing a project folder, AnA walked in a
conversation once a model key is present, and J-NDA/Health Canada intake. Stop the app before `git push`.
