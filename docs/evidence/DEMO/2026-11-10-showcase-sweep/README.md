# Showcase sweep at trunk head, 2026-11-10

The founder, 2026-11-10: *"Keep working to get everything ready for a sales showcase of the entire platform."*

The dress rehearsal of 2026-11-09 (`../2026-11-09-rehearsal/`) and its deep walk were on trunk `b4284d08ce`. Trunk has
moved by thousands of commits since. This is the state at head `0c07fb5b6e`: every screen a presenter reaches from a
project or the rail, opened in a browser, with what the server and the page said.

## What already exists (RULE 3)

| Path | What it is |
|---|---|
| `docs/demo/biotech-walkthrough.md`, `mdx-walkthrough.md`, `IVD_510K_WALKTHROUGH.md`, `README.md` | The presenter's scripts |
| `scripts/demo/launch-demo/` (`npm run demo:seed`) | The demo packs, seeded through the product's own API |
| `../2026-11-09-rehearsal/README.md` and `deep-walk/` | The last rehearsal: environment requirements, 36 findings, each fixed or handed on |
| `../2026-11-09-platform-tour/tour-b.cjs` | A tour script for one machine's paths; this sweep is the same idea, for any database |

## The sweep (`sweep.cjs`, `sweep.json`, `screens/`)

Codespace-shaped app (`post-create.sh`'s database, all demo packs seeded, the CDISC pilot CSR study prepared), migrated
to head. One dev-login as the presenter (Ana Author), 1440×900. For each of the 7 projects: the project page, its six
journey stages (Plan, Evidence, Author, Review, Submit, Respond), and each of the 10 rail destinations opened from the
rail with that project open. 121 stops. At each: API responses ≥ 400, console and page errors, visible error wording,
sideways scroll, a screenshot (`screens/` keeps the flagged stops and one clean set per project).

**Result: 0 server errors (5xx), 0 pages scrolling sideways, 0 stops that failed to open.** 13 stops flagged:

| Seen | Where | What it is | Done |
|---|---|---|---|
| A red "No document — the design was not sized" on opening Biostatistics | the device project (NeuroPanel-Dx 510(k)); any device or diagnostics project | **A product defect.** The page opens such a project on its diagnostic-accuracy worked example. Since 2026-10-05 the engine sizes no accuracy design without the margin to its performance goal, and the example gave none; no control on the form could give one either | **Fixed** (below) |
| `409` on `GET …/intelligence`, console only, nothing on the page | 11 stops on the Lumen projects | The sweep moving between two sponsors' projects faster than a person does: a read for the project just left is refused as stale. Not reproduced at a person's pace (three projects opened in turn: none) | Nothing to fix; no words reach the screen |
| `429`, "Couldn't load the reporting canvas" | one stop, the 36th, two and a half minutes in | The request rate limit: 600 API requests a minute for one signed-in person (`server/config/platform-limits.ts`). A project page load makes about 40, so it takes more than about a dozen full page loads inside one minute. It cleared on the next stop | **Presenter advice** (below). The limit is a security control and is unchanged |

## Inside the screens (`DEPTH=tabs`, `sweep-tabs.json`)

For one project of each kind (C2C-101, LMN-801, NeuroPanel-Dx, the CDISC pilot CSR): every tab of every rail
destination, clicked in turn, and every document the Author stage lists, opened in the editor. 180 stops.
**0 server errors, no error wording on any page.** 7 flagged, all one thing:

| Seen | Where | What it is |
|---|---|---|
| `409 CMC_PRODUCT_CLASS_OUT_OF_SCOPE`; the page says "Module 3 is not composed here for this project" | CMC / Module 3 → Quality by design and Module 3 build, on every one of these four projects | The composition boundary (P-28): Module 3 is composed for a small-molecule drug only, and these are biologics and a device. The page says so in the server's own words (`screens/*cmc-module-3-tab-*.png`). **For a showcase, show CMC / Module 3 on C2C-201**, the small-molecule project the biotech pack has seeded since 2026-11-09 for this purpose |

## Fixed: Biostatistics opens a device or diagnostics project on a sized design

`docs/evidence/DEMO/2026-11-10-showcase-sweep/screens/demo-mdx-neuropanel-dx-510-rail-biostatistics.png` (before) and
`after-mdx-biostatistics.png` (after).

- **The diagnostic-accuracy example** now carries its margin (0.05: sensitivity 0.90 against a goal of 0.85,
  specificity 0.92 against 0.87). The engine sizes it: 1,570 subjects, 1,745 with attrition, by co-primary one-sample
  binomial tests.
- **The form has "Margin to goal"** for an accuracy design, so a diagnostics client can size their own design; before,
  the engine asked for an input nothing on the page could give.
- **The guard found a second broken example.** `biostatWorkedExamplesSize.test.ts` sizes every example on the real
  engine. "ROC / AUC" was refused too, for a missing sensitivity: on the diagnostics track the engine sent every
  diagnostic-accuracy study to the sensitivity/specificity method, though its own comment says an ROC design is sized
  on its AUC on every track. Fixed in `computation-engine.ts`: an `auc_roc` endpoint reaches the AUC method on that
  track too (24 subjects by Hanley & McNeil for the example).
- The examples moved to `surfaces/biostatWorkedExamples.ts` so the test can read them (the screen's module exports
  only the screen, pinned by `biostatServerEngine.test.tsx`).
- Checks: the 12 Biostatistics client suites, 196 cases, and the engine's 6 suites, 76 cases, pass; no new lint
  warning; the project typechecks.

## Fixed: the demo seed stopped before the one project whose Module 3 composes

Re-running the seed at head on this database, as a Codespace does on its next start (`npm run demo:seed -- --pack all`):
**the biotech pack failed at "Projects: program C2C-201"**, 409 `AMBIGUOUS_CLIENT_WORKSPACE`, "Choose a client
workspace before creating this project. Nothing was saved." Everything after it in the pack was skipped.

- C2C-201 is the pack's small-molecule programme, added on 2026-11-09 so a demo can show Module 3 composing. It was
  created with no client named. That is accepted while the organisation has one sponsor, and refused once it has two,
  which it does as soon as the Lumen pack has run. So every Codespace seeded before 2026-11-09, and any `--pack all`
  run after Lumen, never got C2C-201.
- **The fix** (`scripts/demo/launch-demo/packs/biotech.mjs`, `sameSponsor`): C2C-201 is created under C2C-101's own
  client workspace, the same fictional sponsor. A run that names a workspace keeps it. No server change.
- After it: the biotech pack exits 0, "created 28, found 207"; C2C-201 created, its registers recorded, "21
  section(s) composed, 13 with recorded data". In the browser (`sweep-tabs-c2c-201.json`, 41 stops, none flagged):
  CMC / Module 3 → Module 3 build shows the 21 sections and the export gate
  (`screens/demo-biotech-c2c-201-o-cmc-module-3-tab-module-3.png`).
- Pack tests: `node --test scripts/demo/launch-demo/*.test.mjs`, 127/127, two new for this.
- The script gained stop 6b, CMC / Module 3 on C2C-201 (`docs/demo/biotech-walkthrough.md`).

Still as the 2026-11-09 rehearsal found: with no second signer configured (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`),
the packs record their two-person steps (method validation, QMS approval) as not executed, and say so in the seed log.

## For the presenter

- **Run the migration step before the app restarts** on any environment that pulls trunk (`npm run db:provision` or
  the deployment's migrate step). Unchanged from 2026-11-09, and still the most likely way to break a demo.
- **AnA needs a model key.** Without one every screen works and AnA says it has no provider. With one, also try the
  new data-catalog questions (`docs/evidence/SPINE/S2/2026-11-06/README.md`, step 4).
- **New since the last rehearsal, worth showing:** Vault → **Data catalog** (every captured file across the sponsor's
  projects, organized and graded, "Use in this project"); the CSR document's study-data chooser marking data the project
  uses.
- **Do not click through more than about a dozen pages inside one minute.** Past 600 requests a minute the server
  answers "too many requests" for the rest of that minute and a page says it could not load; it recovers by itself.
  Flipping between two sponsors' projects that fast is also where the only stale-read refusals came from (harmless,
  nothing on screen).

## Not covered here

- AnA answering or drafting (no model key in this container), and anything behind an e-signature.
- Phone width. The S2 walks cover the Data room, Vault's Data catalog and the CSR chooser at 390; the wider phone pass
  is the J-series human tests (`docs/evidence/HUMAN-TEST/`).

## A brand-new Codespace at head (`fresh-codespace/`)

Today's `.devcontainer/post-start.sh`, unmodified, on an empty database: provision, start, both organisations'
accounts, both seeds, the CSR study, then the three sweeps above again.

| Step | Result |
|---|---|
| Database provisioned, app serving | Yes. `/readyz` not ready only for AnA (no model key here) |
| Lumen organisation's seed | 135 steps ok, 0 failed, 2 not executed (both need a model) |
| Main organisation's seed (`--pack all`) | 232 ok, 0 failed, **30 not executed** → fixed below → 4 |
| CSR study (CDISC pilot): Vault uploads, three-person approval, CSR document, frozen study data | Ready, every step passed |
| Sweep, 8 projects, 138 stops | 0 server errors, 0 sideways, 0 failed to open. 8 flagged: the stale `409 …/intelligence` read between two sponsors, console only |
| Inside the screens, 180 stops | 0 server errors. 7 flagged: the Module 3 composition boundary, as above |
| C2C-201, 41 stops | None flagged; Module 3 composes |

**Fixed: the Codespace's main seed had no third person.** `post-start.sh` gave the seed a second signer only. The
Vault's review route refuses one person in two roles, so 25 review and approval steps of the Lumen packs said
"review and approval need two people other than the uploader". The reviewer account now signs in as the third
person (`OQ_APPROVER_*`), as the Lumen organisation's own seed already did. Re-run on the same database: exit 0,
**4 not executed**: two Shadow Reviews (need a model) and two orchestration runs (that engine reads the integer
project spine and is not in the launch catalog). `scripts/ops/codespaces-startup.test.mjs` 14/14.

A Codespace created before this change picks it up when `scripts/demo` next changes on the branch (the seed re-runs
then), or by deleting `demo-seed.done` in the Codespace's state folder and restarting.
