# Vault folders and binders: readiness for GA, 2026-11-10

The founder, 2026-11-10: "Fix all and then prepare for GA." This note says what is ready in this lane (S6, the Vault's
folders and filing binders), what was fixed on the way, and what stands between the product and GA that this lane
cannot close. GA is rows D1–D10 of `docs/LAUNCH_DEFINITION_OF_DONE.md`; nothing here claims a row.

## Ready, with its proof

| What | Proof |
|---|---|
| Folders a person makes, renames, moves and removes; documents moved into them | `walk-folders.cjs`, `walk-folder-moves.cjs` in the running app; audit rows in `audit-step1.txt`, `folder-remove-fail-closed.txt` |
| Each filing's binder, first in the tree, from its own outline | `walk-binders.cjs`: IND, NDA, MAA, 510(k), EU MDR, EU IVDR |
| The plan in the Vault, both ways | `walk-binders.cjs` steps 3a, 3b |
| AnA lists, makes and files into folders; a person confirms the filing | `ana-step4-live.txt` (database, RLS on); `document-placement-tools.test.ts` |
| Every folder change is audited: who, when, why | chained `vault.folder.create / rename / move / remove` rows, in the same transaction as the change |
| Multi-tenant: no folder crosses an organization or a project | `folders-rls-two-tenant.txt`: as `app_service` with RLS enforcing, another organization sees 0 project folders, changes 0, and its insert is refused. The writers answer another organization "Project not found". `/api/folders` never reaches a project's folders (`tenant-isolation-folders.contract.test.ts`) |
| A removal never orphans a file | refused for a folder holding a document or a folder; refused when the session cannot be shown to see the project's documents (`folder-remove-fail-closed.txt`, found live) |
| Migration | `migrations/20261106_document_folders_project_scope.sql`: additive, re-applied without change by `db:provision` on every restart here |
| Suites | 154 files, 2,683 tests: `server/services/vault`, `server/routes/c2c/__tests__`, the folders contract, AnA placement. 76 Vault client files, 850 tests |
| Gates | every pre-push gate passed on each push (the plan, one-product, CSS, migration safety and order, typecheck, lint ratchet) |

## Fixed on the way (red on trunk before)

- `ci:check-css-selector-shadowing`: `.qms-rowacts` was declared twice in Quality's sheet.
- `project-settings.pglite.test.ts`: six cases had stopped exercising anything after the settings transaction moved to
  the request's connection; they inject their failures there now, 38 of 38.

## Not ready, in this lane

- **AnA over folders has not been walked in a conversation.** This environment has no model key. The tool and the
  writer are proven separately; the turn is not.
- **A J-NDA or Health Canada NDS binder cannot be shown in a project**: the app refuses those projects at intake
  (PMDA requires eCTD 4.0; Health Canada has no outline). The J-NDA outline exists.
- **Search selects send one value per filter**; several arrive only through a saved view. Left as designed.
- **Organization-level folders** (`/api/folders`, no project) have no screen and no caller. Keeping or retiring them is
  a founder decision.
- **No therapeutic-area dimension** exists anywhere in the outlines; a binder follows filing type and region only.

## Between the product and GA, outside this lane

`node scripts/ops/ga-readiness-report.mjs`, 2026-11-10, this machine: **8 of 42 ready, 18 blockers, 16 advisories**.
The probe reads disk and environment only. The blockers, by who can close them:

- **Operations and security (deploy environment and secrets):** `RLS_ENFORCE=on`, `AUDIT_HMAC_KEY`,
  `MFA_ENCRYPTION_KEY`, SMTP for the login code, FDA ESG (AS2), the enforcement switches (eSTAR template, eCTD DTD,
  agency validator, PDF/A), a database restore rehearsal on a production-shaped target.
- **Licences and regulator files:** LORENZ eValidator, MedDRA, WHODrug, the eCTD 3.2.2 supportive files with their
  checksum manifest, the eCTD 4.0 RPS schema.
- **Engineering with the system owner:** the performance qualification of the models approved for high-risk drafting
  (0 of 5 passed; the protocol is still a draft), PreSTAR filing qualification.
- **Founder only (launch rows):** D1 the hosted production account, D9 the lawyer's review and pricing, D10 a signed
  customer.
