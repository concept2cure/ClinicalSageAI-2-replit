# Demo pack `portfolio`: each fictional sponsor in its own client workspace

**Package:** DATA. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Status: NOT committed.** It follows 4d935f8ea
(the pack, committed and not pushed). **Date:** 2026-11-09.

**This README supersedes two parts of the parent `docs/evidence/DEMO/portfolio/README.md`: its "What it seeds" section
and its Corvane Oncology / CRV-310 rows.** That README says each company is a sponsor inside the organisation's own
workspace, that no client workspace is created, and that biotech's program creation therefore cannot become
`AMBIGUOUS_CLIENT_WORKSPACE` because of this pack. After this change all three statements are false (see "Order on a fresh
database"). The parent README is outside the files this change may edit. **The coordinator needs to decide** whether to
allow an edit to it in the same commit, or to annotate it themselves.

## What already exists (RULE 3)

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Client-workspace API | `POST /api/clients` and `GET /api/clients`, `server/routes/clients-routes.ts` (`router.post('/')`), mounted in `server/bootstrap/register-tenant-routes.ts` | Creates and lists an organisation's client workspaces | It does not mark a default workspace. This change does not call any default-workspace route. |
| Workspace pattern in the packs | `scripts/demo/launch-demo/packs/lumen.mjs` `ensureClient`, `mdx.mjs` (`MDX_CLIENT`, `POST /api/clients {name, slug}`), `faux.mjs` `ensureClient` | Each finds its workspace by name in `GET /api/clients` or creates it with `{name, slug}` | This change reuses that endpoint and body shape. It does not add a new helper to `lib.mjs`. |
| Canonical project intake | `POST /api/c2c/projects` with `clientWorkspaceId` | Creates a project in the workspace it is given. If several workspaces exist, none is marked default and the body names none, it refuses with `AMBIGUOUS_CLIENT_WORKSPACE` (`server/services/c2c/program-project-anchor.ts`). | It does not move a project between workspaces, and this pack never asks it to. |
| Project archive | `POST /api/c2c/projects/:id/archive {reason}`, `server/routes/c2c/projects.ts`. The UI calls it through `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts` `requestProjectArchive` (Project settings). | Archives a project with an audited reason. The project can be reopened with `/unarchive`. | It deletes nothing. It was used once, on this local database only (`local-archive.log`). |
| Submission per project | `canonicalSubmissionFor`, `scripts/demo/launch-demo/packs/biotech-submission.mjs` | Takes the submission anchored to the program's id, never another program's submission with the same name | Unchanged. Stages g and h now use it. |
| The pack | `scripts/demo/launch-demo/packs/portfolio.mjs`, `portfolio-content.mjs`, `scripts/demo/launch-demo/portfolio-demo.test.mjs` (4d935f8ea) | Eight CSR projects at stages a–h for four fictional companies | Before this change it created no workspace. All eight projects went into workspace 2, "Concept2Cure Therapeutics". |

No product code, no other pack, and neither `seed.mjs` nor `lib.mjs` changed.

## What changed (3 files)

- **`portfolio-content.mjs`**
  - "Corvane Oncology" is now **"Varnhollow Oncology (fictional)"**. The Lumen pack has a fictional supplier called
    "Corvane Biologics", and a web search found no real company named Varnhollow.
  - Its product code CRV-310 became VNH-310, so the protocols are now VNH-310-301 and VNH-310-201.
  - New `SPONSOR_WORKSPACES` (one per company, each named "(fictional demo)") and `workspaceOf`.
  - New pure placement rules: `existingProjectFor`, `matchSponsorWorkspace` and `designOwnedElsewhere`.
  - New `KNOWN_PRODUCT_BEHAVIOUR`, the record described under "What the own workspaces do not do".
- **`portfolio.mjs`**
  - Each workspace is found by exact name, or created with `POST /api/clients {name, slug}`.
  - Every project is created with its sponsor's `clientWorkspaceId`. `projectIntakeBody` throws if no workspace is given.
  - When a project with the pack's title is found in another workspace, it is refused (see below).
  - Stages g and h use `canonicalSubmissionFor`.
  - The header and the manifest's `knownProductBehaviour` now describe the Quality capture correctly (review round 2).
- **`portfolio-demo.test.mjs`**: 7 new cases.
  - The six round-1 cases cover: one workspace per sponsor, marked fictional; every project spec carrying its workspace,
    which the intake body names explicitly; no sponsor named like a Lumen supplier; the refusal outside the sponsor's
    workspace; exact-name workspace matching; and a study design left where it is.
  - The round-2 case checks that the known product behaviour, and the header, name the first data-room read of any
    project as the trigger. It also checks that neither says the letter upload causes it, or that the own workspace
    stops it.
  - Red before each change (`tests-red.log`, both rounds). Green after: 151 of 151 (`tests.log`).

No workspace is marked the organisation's default, and no organisation setting changed.

## Workspaces and projects (local database, organisation 2)

| Workspace | Name | Projects (stage, id) |
|---|---|---|
| 53496 | Varnhollow Oncology (fictional demo) | a VNH-310-301 `7a266309-5fc1-4c18-8438-8619b1b5e805` · e VNH-310-201 `8835514e-ff8c-4b1c-9a23-c0049189780f` |
| 53497 | Petrelline Rare Therapeutics (fictional demo) | b PTR-022-301 `62f11671-1d20-49d6-b745-1ad081e2a4b6` · f PTR-022-102 `92907d1f-3b68-418f-873c-9065a8186c2b` |
| 53498 | Quillmont Immunology (fictional demo) | c QLM-118-202 `61dc7ed7-279a-4de8-942d-4e44e34ee342` · g QLM-118-101 (IND) `452c2405-5393-4c8a-81aa-15c1530a81b5` |
| 53499 | Halcyra Vaccines (fictional demo) | d HLY-09-201 `d67b4cc4-6484-4a91-ac01-1d8717e66cf1` · h HLY-09-101 (IND) `66b59a65-359b-4858-9e6a-80d3eb084653` |

Workspace 53495, "Concept2Cure Diagnostics (fictional demo)", is the MDX pack's (2b5664eff), not this pack's. The
verifier opened all eight projects in the running app, and each showed its sponsor as Client (`verify-ui.log`).

## Never moved, never reused: the refusal and the local archive

- **Refusal.** `portfolio-run0-refusal.log` was run before the archive, while the six round-1 projects with unchanged
  titles were still in workspace 2. The run created the four workspaces and the two (renamed) Varnhollow projects. It
  refused the other six by name ("not moved and not reused; nothing was attached"), recorded them in the manifest's
  `refused` list, and exited 1.
- **Local archive.** The eight round-1 projects in workspace 2 were archived through `POST /api/c2c/projects/:id/archive`
  (`local-archive.log`): a dry run, then 8 × HTTP 200, each confirmed `archived` afterwards. This was done on this local
  database only. A fresh database (the founder's) has none of these projects.
- **Creation.** `round1-portfolio-run1.log` then created the eight projects in their sponsors' workspaces: created 89,
  found 33, exit 0.

## Seed runs

| Log | Code | Exit | Result |
|---|---|---|---|
| `portfolio-run0-refusal.log` | round 1 | 1 | created 34, found 0, not executed 3, refused 6 (by design, see above) |
| `round1-portfolio-run1.log` | round 1 | 0 | created 89, found 33, not executed 20, refused 1 |
| `portfolio-run1.log` | round 2 (final) | **0** | created 0, found 119, not executed 20, refused 1 |
| `portfolio-run2.log` | round 2 (final) | **0** | created 0, found 119, not executed 20, refused 1 |
| `all-run1.log` | round 2 (final) | **1** | biotech stops at "Tasks: 6 tasks on C2C-101" (duplicate titles, see below). mdx and lumen seed; nothing is created. |
| `all-run2.log` | round 2 (final) | **1** | same as run 1 |

The round-1 manifests (`portfolio-run0-refusal.manifest.json`, `round1-portfolio-run1.manifest.json`) still carry the
superseded round-1 wording of `knownProductBehaviour`. The round-2 manifests carry the corrected record.
`verify-*.log` and `verify-portfolio.manifest.json` are the independent verifier's round-1 runs.

**`--pack all` is not green (blocked, not done).** Biotech's existing duplicate-title guard (`work-areas.mjs`
`ensureTasks`) refuses because C2C-101's board holds each of five blueprint task titles twice.
`all-run-biotech-diagnosis.log` shows, read-only, where the second copies came from:

- They were raised at 19:10:09 by the study design `sd_403db359…` "Sweep SP C2C-101-203 design", which the other
  workflow's test sweep created through the UI.
- No seed pack creates that design.
- It was still present at 19:51Z.

This change does not touch C2C-101. The remedy is to re-run `--pack all` twice once the sweep's owner has removed that
design's duplicate tasks, or after the sweep's freeze ends (23:00 UTC). The sweep's data was not touched. mdx and lumen
were green in both runs.

## What the own workspaces do not do: organisation-wide Quality records still reach every project

The change was meant to stop each sponsor's projects showing Concept2Cure's organisation-wide Quality evidence. **It
does not stop that.** The cause is in the server, outside this package's files:

- **What triggers it.** The first read of any project's data room runs the capture, in any workspace. That read is
  `GET /api/c2c/projects/:id/sources` at offset 0. It happens when someone opens Records > Data Room sources, when the
  editor's sources rail loads, or when a seed pack reads the data room.
- **The code path.** `server/services/clinical-regulatory-evidence/data-room-search.ts` `prepareSourceScope` calls
  `record-source.ts` `syncQualityProjectSources`. That function writes snapshots of what
  `server/services/qms/project-evidence-queries.ts` returns. Those queries admit:
  - suppliers, internal audits and management reviews for the whole organisation;
  - change controls with no program;
  - GMP deviations and quality plans with no client workspace;
  - and the record relationships of those records.
- **What the local database shows** (`quality-capture-readonly.log`, read-only SQL): every one of the eight projects in
  its sponsor's workspace holds the same 21 records as the archived projects in workspace 2. The 21 are 5 Lumen
  suppliers, 4 internal audits, 2 management reviews, 4 Lumen GMP deviations with no workspace, the C2C-101 and MDX
  NP-100 change controls with no program, and 4 record relationships. The key sets of VNH-310-301 and the archived
  CRV-310-301 do not differ.
- **When each project was captured.** Stage h was captured at 19:14:33 by the pack's own agency-letter step. The other
  seven were captured at 19:31:40–19:31:58, by the verifier's `GET /sources` reads (`verify-ui.log`). The letter upload
  is not the cause.
- **On a fresh database** (expected from the queries, not run here): 5f8eabad1 creates the C2C-101 and NP-100 change
  controls on their programs, so those would no longer be admitted. The suppliers, audits, management reviews and the
  Lumen deviations would still be admitted, because the Lumen pack records its deviations with no workspace.

The pack does nothing to mask this. Its header and its `KNOWN_PRODUCT_BEHAVIOUR` record state the behaviour above. The
manifest's `knownProductBehaviour` carries that record plus each run's own read of stage h's data room (22 sources: the
letter and the 21). **Ruling needed:** the coordinator or product owner decides the capture's scope in
`project-evidence-queries.ts`. Until then, the claim that sponsor workspaces keep org-wide Quality evidence out is
withdrawn.

## Refused (1) and not executed (20), every run

- **Refused, stage b study design.** "[Demo · Portfolio] PTR-022-301 — Phase 3 study design (fictional)" is still bound
  to the archived project `3a0d3318…`. The product will not move a design between projects (`PROGRAM_MISMATCH`), and the
  pack does not ask it to. So the new PTR-022-301 has no design in Biostatistics on this local database. A fresh
  database has no such conflict.
- **Not executed (20), each recorded with the product's or the environment's reason, never faked:**
  - study-source approval and freeze: 6
  - build from the study's data and AnA drafting: 6
  - CSR placement at m5.3.5.1 on g and h: 2, refused `CSR_SCIENTIFIC_REVIEW_REQUIRED`
  - eCTD compile and dispatch: 2
  - formal review request on e: 1
  - CSR freeze and e-signature on f: 1, no signer credential
  - approval of the information-request response on h: 1, no signer credential
  - enrolment register on b: 1

## Order on a fresh database

Run `--pack all` before `--pack portfolio`. Once this pack's four workspaces exist next to the organisation's own and
none is marked default, intake refuses a new project that names no workspace (`AMBIGUOUS_CLIENT_WORKSPACE`). Biotech's
C2C-101 and MDX's program would then not be created. Projects that already exist are found by title and are unaffected.
This follows from the intake rule; it was not run on a fresh database here.

## Files

- `README.md` (this file)
- `tests-red.log` (rounds 1 and 2) and `tests.log`
- `eslint.log`
- `local-archive.log`
- `portfolio-run0-refusal.log` and `round1-portfolio-run1.log` (round 1), each with its manifest
- `portfolio-run1.log` and `portfolio-run2.log`, each with its manifest
- `all-run1.log`, `all-run2.log`, `all-run2.{biotech,mdx,lumen}.manifest.json` and `all-run-biotech-diagnosis.log`
- `quality-capture-readonly.log`
- `verify-*` (the verifier's)

All manifests were written to the scratchpad (`DEMO_MANIFEST_ROOT`) and copied here. The committed manifests under
`docs/evidence/DEMO/{biotech,lumen,mdx}/` are unmodified.
