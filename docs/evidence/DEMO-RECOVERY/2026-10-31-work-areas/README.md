# The demo's work areas, 2026-10-31: Lumen, CMC, Biostatistics, Tasks and Projects

The founder, after the client demo of 2026-10-31 (the first half is in `../2026-10-31/`):

> "My cmc, biostatistics, taking, projects is all gone or utter trash now."

Each area was reproduced on a running stack and driven in Chromium. A running-app audit then reviewed every rail
destination, one agent per area, against the seeded projects. Its findings are fixed, each blocker by a test shown
failing without its fix. The last proof is the founder's own path on a database installed from nothing.

## What already exists (searched first, RULE 3)

| Capability | Where it was | What it lacked |
|---|---|---|
| Lumen demo | `data/seeds/lumen-demo/`: public pipeline facts, a synthetic LMN-201 CSR source, a runbook | Never wired into `npm run demo:seed` |
| CMC registers | `CmcModule.tsx` tabs. Writes to `/api/cmc/specifications`, `/stability-studies` and `/batch-records` | No demo data. Stability listed every project's studies. Overview read "1 submissions — RPI — average" |
| Biostatistics | `Biostatistics.tsx` (study designs, the engine, governed documents) and `BiostatWorkbench.tsx` (29 calculators) | Not on the rail or in the catalog. Opened on an oncology preset and called it "your design". No page margin |
| Study designs | `/api/study-design/persist` and the protocol's `…/study-design` bind | No pack recorded one |
| Tasks | `TaskBoard.tsx`, `CollabLauncher.tsx` (header Task), `/api/tasks/tasks` | Empty in the demo. Issues listed in the Tasks row below |
| Plan | `IndDocumentLibrary.tsx` starts deliverables from the IND catalog | Seeded documents matched no template, so Plan read "0 started" |

Nothing was rebuilt. Each item above was completed, reached or fixed in place.

## What changed

| Area | Change |
|---|---|
| Lumen | `--pack lumen` (`scripts/demo/launch-demo/packs/lumen.mjs`, `lumen-content.mjs`). See the Lumen pack section below. |
| Demo data | `packs/work-areas.mjs`, used by every pack. Writes tasks, CMC registers and study designs through the routes the screens use, and starts Plan deliverables from their templates. |
| Plan | `ensureDemoPlan` (`lib.mjs`): see the plan section below. |
| Biostatistics | The ninth launch app (P-77, surfaces only) and on the rail's work areas. Loads the open project's design. A preset is labelled a worked example. Has its margin. Links to the calculators. |
| CMC | Stability reads the open project's register. The overview subtitle is plain words. |
| Tasks | See the Tasks section below. |
| Clients | A project of a second client was "not found" to project routes, which looked in the organisation's first workspace. A named project is now admitted in its own workspace (`project-access.ts admissionWorkspaceId`). The current client follows the open project (`clientFollowsProject.ts`). |
| Connections | See the connection-leak section below. |

**Lumen pack.** The client workspace is marked "Lumen Bioscience (demo — not affiliated)". It contains:
- projects LMN-201, 801, 301 and 401, each with a program overview in the Vault and tasks;
- on LMN-201: the synthetic CSR source retained in the Vault, the RePreve design, and CMC specifications, stability
  and batches.

Every specification, result, batch, assumption and task is labelled illustrative.

**Demo plan.** Before seeding, the seed reads which demo areas the organisation's plan leaves locked and says so.
With `--plan enterprise`, the platform owner opens them through Master licensing, with a reason on the audit trail.
Anyone else is refused before anything is seeded.

**Tasks.** Fixed:
- the header form now files the task under the open project (it used the program uuid as a board id);
- the board opens on the open project;
- Start workflow stays on the board;
- two CSS class collisions;
- New task no longer offers a status the server refuses;
- table names and ids are gone from the screen;
- the five columns fit at 1440 px.

**Connection leak.** A request whose caller left during authentication held a database connection forever. 17 of 20
abandoned badge polls did, until the pool was empty and every request answered 503. `requestDbLease.ts` now releases
on the socket's own close. Another session fixed the same leak independently on trunk (11feb8d934); the merge keeps
one combined fix.

## The founder's path on a fresh install

On a new database (`c2c_fresh`), with its own runtime role:

1. `node scripts/db/install-fresh.mjs` as owner, then `node scripts/db/deploy-migrate.mjs` with
   `DATABASE_OWNER_URL`, `DATABASE_URL` (runtime) and `RUNTIME_DB_ROLE`. All 459 files applied, and the grant audit
   passed for all 1327 relations (`fresh-install-deploy-migrate-tail.txt`).
2. A self-service signup ("Concept2Cure Therapeutics", biotech), then dev sign-in.
3. `npm run demo:seed -- --pack all --email <login> --base-url <app>`: exit 0. Biotech created 197 records, MDX all
   steps, Lumen 37 (`fresh-install-seed-run.txt`). On the free plan, the seed named the four locked areas.
4. Platform owner (allowlisted e-mail and a super_admin grant), `--plan enterprise`: the organisation is on
   enterprise and every demo area is open.
5. The demo walked in Chromium, 28 screens (`fresh-install-demo-walk.json`):
   - every rail entry;
   - LMN-201 with CMC, Biostatistics, Tasks, Vault and Submission Center;
   - C2C-101 with CMC, Biostatistics, Tasks and Communication;
   - NeuroPanel-Dx with Tasks, Vault, Submission Center and Quality;
   - the New project wizard.

   **No failed request, no script error, no error text on any of them.**

## Operator notes

- **Deploy.** Run with `RUNTIME_DB_ROLE` set to the app's role (P-72).
- **Seed the demo.** As the platform owner on a dev-auth server:
  `npm run demo:seed -- --pack all --plan enterprise --email <your login> --base-url <app URL>`.

  This adds Lumen to the Biotech and MDX packs. Without `--plan`, the seed names any demo area the organisation's
  plan leaves locked.
- **Second signer.** Set `OQ_SIGNER_EMAIL` and `OQ_SIGNER_PASSWORD` to a second person to run reviews, approvals and
  signatures. Without one, readiness figures stay at 0 % because nothing is approved.
- **Local only, not a product defect.** A runtime role that once ran migrations holds the purger roles they grant
  to `current_user`. The deploy's grant audit then refuses it. Migrate as the owner, as production does.

## Screens

`screens/`:
- LMN-201 home, with its work areas;
- LMN-201 Biostatistics, on the project's RePreve design;
- LMN-201 Tasks, filtered to the project;
- C2C-101 CMC overview;
- the LMN-201 Stability register, scoped to the project;
- the free-plan lock panel that a lower-plan organisation met.
