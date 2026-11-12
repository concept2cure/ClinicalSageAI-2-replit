# P-122: the defects the restorations surfaced, fixed

Founder decision P-122 (2026-11-10). Found by the project page's and CMC's restorations
(`../project-page/README.md`, "Found, not fixed"; `../cmc/`), and fixed red first. Instance for every screenshot and
the seed: `c2c_rr5_phone_instance`, organisation 5, port 5266, signed in through the form as the rr5 author. DB tests:
a deploy-shaped database provisioned from empty (`C2C_TESTDB=c2c_p122_defects bash scripts/db/provision-test-db.sh`,
then `node scripts/db/deploy-migrate.mjs`), as `app_service` with `RLS_ENFORCE=on` (each test asserts the posture).

## What already exists (RULE 3)

| Item | What existed, by path | What it did not do |
|---|---|---|
| 1 | `server/routes/project-sections.ts` milestone routes; `db/migrations/20260220_ind_section_tracking.sql` (the table's creator in the set, `REFERENCES projects(id) ON DELETE CASCADE`); `20260730_project_milestones_reconciliation.sql` (the union of the two shapes); `shared/schema.ts` `projectMilestones` (push's shape) | Record a milestone: push's key named `cer_projects` (23503), and the route wrote `linked_sections` as a JSON string into the `text[]` column (malformed array literal) |
| 2 | `server/services/project-rollup-service.ts` `getTree`, behind `server/routes/project-hierarchy.ts` `/:id/rollup` and `/:id/tree` | Stay a read: it wrote every node's roll-up into `projects.metadata` and moved `updated_at`; said "medium" for a risk nobody recorded, and `shared/schema.ts` gave every new project `risk_level` 'medium' by default |
| 3 | `missingInputs` from the composer (`server/services/module3Composer.ts` `MODULE3_SECTION_RULES`, `module3-extensions.ts`); the server's own words for three fields (`shared/cmc/characterization-type.ts`) and for source types (`SOURCE_TYPE_LABELS` in `server/services/cmc-write-through.ts`) | Say the other 48 fields in words: CMC printed `formulationCompositionComplete` etc. in the Section approvals table, its withheld-approval reason, the sign dialog, provenance, the build board, and the approve route's 409 |
| 4 | `scripts/demo/launch-demo/seed.mjs` and its packs; the generator `POST /api/concept2cure/projects/:id/tasks/bulk`; `/api/project-sections` initialize/assign/deadline/status/milestones; work projects `POST /api/c2c/projects` (`parentProjectId`, `workKind`); review tasks `POST …/artifacts/:id/review-tasks` | Write any of it: every project-management engine but Sentinel was empty on the demo |
| 5 (found here) | `client/src/concept2cure/v2/styles/project-home-v2.css` `.pj-tracking-module`; `app-v2.css` `.pj-act` (and `.pj-side .pj-act`'s wrap) | Wrap a Schedule row: a long section title squeezed its owner, status and date to nothing at 390 px |

Searches run: `project_milestones` in `migrations/`, `db/migrations/`, `shared/`, `server/`, `scripts/`; `persistRollups`,
`metadata->'rollup'`, `worstRiskLevel`, `risk_level` writers (`rules-engine` sets 'critical', `project-rules` 'high',
AnA's update-project command any level); `formulationCompositionComplete`, `missingInputs.join`, `Missing required
inputs`, label maps in `server/services/cmc*`, `shared/cmc/`, `client/src/concept2cure/v2/surfaces/*Words*`; every writer
of `c2c_blockers` and `c2c_project_work_items`; every read returning `concept2cure_artifacts.id`.

## 1. A milestone can be recorded on a project (`1-milestones/`)

- **Fix.** `server/routes/project-sections.ts` passes `linked_sections` as an array of section codes (and refuses
  anything else, 400). `db/migrations/20260220_ind_section_tracking.sql`, the creator, is amended in place with a dated
  note: after its `CREATE TABLE`, a conditional block removes a key on `project_id` into `cer_projects`, adds
  `project_milestones_project_id_projects_id_fk` (push's name) only when the column has no key into `projects`, `NOT
  VALID`, and validates it only once every row names a project. `shared/schema.ts` names `projects` (and drops
  `cerProjectsRelations.milestones`, a relation nothing queried).
- **First placement refused by a gate.** The block first went into the reconciliation file (ordered before the
  creator); `ci:migration-guard-order` refused it (`guard-order-red-first-placement.txt`), rightly: on a database the set
  builds, the guard would arrive a deploy late. Withdrawn, and moved into the creator.
- **Red.** `red.txt`: on HEAD, the key names `cer_projects` and the create answers 500 (malformed array literal).
  `red-2-route-fixed-key-not.txt`: with only the route fixed, 23503 on `project_milestones_project_id_cer_projects_id_fk`.
- **Green.** `green.txt`: `tests/db/p122-project-milestones.dbtest.ts` 3/3 (the key names `projects`; a member records a
  milestone on a regulatory project and the Schedule's timeline lists it; another organisation's project is refused 404
  `PROJECT_NOT_FOUND` both ways, nothing written) with `p122-project-management-reads.dbtest.ts` 15/15.
- **Replay.** `conditional-replay.txt`, on the provisioned database: push alone gives the right key; a baseline key and a
  stray row are repaired to `NOT VALID` without failing; a second apply changes nothing; new rows are checked; resolving
  the row validates the key on the next apply; `deploy-migrate` green. `ci-migration-drop-safety.txt`: drop-safety, its
  selftest (12/12), guard-order and set-order, OK.
- **Instance.** `../deploy-migrate-instance.txt`. The Schedule lists the milestones (screenshots below).
- **Not changed.** Production's launch scope still refuses milestone writes: `/api/project-sections/milestones` is not
  claimed by a launch surface (`p122-project-management-reads.dbtest.ts` asserts it). Admitting it is an R1 decision.
  The Schedule has no control to record a milestone; the seed writes them.

## 2. The roll-up is a read, and says only a recorded risk (`2-rollup/`)

- **Fix.** `server/services/project-rollup-service.ts`: `persistRollups` is gone (nothing read the copy it wrote); a
  node's `riskLevel` is what is stored or null; `worstRiskLevel` is the worst of the recorded levels, null when none.
  `shared/schema.ts` `projects.riskLevel` has no default, and `migrations/20261110_projects_risk_level_not_defaulted.sql`
  (in the set, before the sweeps) drops it on deployed databases, conditionally, changing no row.
- **Red.** `red.txt` 4/4 on HEAD: reading `/rollup` and `/tree` wrote `metadata.rollup` and moved `updated_at` on the
  project and its work project; an unrecorded risk read "medium"; a project created without one was stored 'medium'.
- **Green.** `green.txt`: `tests/db/p122-rollup-read.dbtest.ts` 4/4 with the reads suite 15/15.
  `conditional-replay.txt`: the default goes, stored values stay, a new project has none, a second apply does nothing.
  `ci-sql-interpolation.txt`: the removed UPDATE was the file's two baselined interpolations; the baseline is lowered.
- **Not changed, for a decision.** Every existing project still stores 'medium' (all eight on the demo database), and
  the roll-up reports it, because a stored 'medium' cannot be told from a recorded one: AnA's update-project command
  can record 'medium'. Clearing them is a data decision for a person, not a replayed migration (it would also clear a
  'medium' recorded later). The Schedule shows no risk figure, as before.

## 3. CMC says what a section still needs in words (`3-cmc-words/`)

- **Fix.** `shared/cmc/module3-input-words.ts`: the one vocabulary for every input the composer can report missing (48
  fields worded; the three characterisation fields from `characterization-type.ts`; source types from the write-through's
  labels, moved here so `cmc-write-through.ts` and the screens share one copy). An unknown key is said as words, never
  as the key. Used by `CmcModule.tsx` (Section approvals table, withheld-approval reason, the sign dialog, provenance),
  `CmcModule3Build.tsx` (the build board) and `server/api/cmc/module3OperatingSystemRoutes.ts` (the approve route's 409).
- **Red.** `red.txt` 2/2 on HEAD: the table rendered "missing: formulationCompositionComplete", the reason
  "Missing required inputs: formulationCompositionComplete", the board "acceptanceCriteria, drugSubstanceBatchAnalyses,
  impurity_profile". (Run on the test's first version; one assertion was then changed to read text node by text node,
  after the first assertion, which is the one that failed.)
- **Green.** `green.txt`: 318/318 across `cmcMissingInputWords`, `module3-input-words`, `cmcOverviewCompleteness`,
  `cmcSuiteWrites`, `cmcRefusalNotFailedRead`, `cmcWriteThroughMappers` and the retired-name ratchet. The two older CMC
  suites had asserted the raw keys; they now assert the words. `guard-red.txt`: the vocabulary guard fails when one
  field's words are removed.
- **Not changed, found.** AnA's Module 3 command handlers (`server/services/ana-ri/module3-command-handlers.ts`), the M2
  summary builder and the composer's own fallback narrative ("Missing inputs: …" in a section with no generator,
  `module3Composer.ts:3330`) still print keys. The narrative one is composed content; changing it re-hashes sections and
  is the S7 lane's.

## 4. Project-management demo data (`4-demo-data/`)

- **Fix.** `scripts/demo/launch-demo/packs/project-management.mjs`, run as `--pack project-management` (registered in
  `seed.mjs` after `lumen`, so `--pack all` runs it last). On C2C-101 and LMN-201, through the product's routes: CTD
  section tracking (107 sections each), owners, deadlines and status on the sections in work (one overdue each); three
  milestones each; the twelve IND milestone tasks by the generator, due to the recorded target submission date, with
  progress (C2C-101 1 done, 1 in progress; LMN-201 3 done, 1 in progress, 1 blocked); two work projects each with a
  task on three; on LMN-201 two review tasks on the documents in review, one due in 3 days, one 2 days overdue.
- **Red.** `red-engines-before-seed.json`: every engine empty on both projects; no blockers, nothing due.
- **Green.** `seed-run-1.txt`; `seed-run-2-rerun.txt` creates nothing (idempotent); `green-engines-after-seed.json`.
  `engines.mjs` is the read used for both.
- **Not done: blockers.** `c2c_blockers` has two writers. The submission operations sweep derives blockers from
  documents mapped into a package section, and `POST /api/submission-ops/artifact-section-map` takes the document's
  integer id, which no read returns (every document list returns its string id); no client calls the route. The
  correspondence pipeline is behind `REG_CORRESPONDENCE_ENABLED` and a parser configuration the instance does not have.
  So "Blockers" says "No blockers recorded." The manifest notes it. Exposing the id, or calling the mapping from a screen,
  is a product change, not seed data.
- The seed rewrote `docs/evidence/DEMO/project-management/manifest.json` with local ids; it was removed, not committed.
  `biotech.mjs`, `biotech-authoring.mjs` and `lib.mjs` were being edited in the tree by another session when this
  started; none of them was touched, which is why the data is its own pack.

## 5. A Schedule row keeps its detail at 390 px (`5-schedule-rows/`, found by the seeded data)

- **Fix.** `project-home-v2.css`: within `.pj-tracking-module`, `.pj-act` wraps and its title may shrink, as Project
  knowledge's rows already do.
- **Red / green.** Measured in each shot (`shots.cjs`, `squeezed`: a row whose detail or date is under 4 px wide or past
  the section's edge). `red.txt`: at 390, "m1.20: Introductory Statement and General Investigational Plan" on both
  projects. `green.txt`: none, at 390 and 1440, light and dark; no sideways overflow.

## Screenshots (`screenshots/`)

Element shots of the whole section, at 1440×900 and 390×844, light and dark (`shots.cjs`; what each section said is in
`shots-before.json` and `shots-after.json`). The window grows to the section's height for the shot, at the same width.

- `before-*` (HEAD, before any change): `schedule-c2c101`, `schedule-lmn201` (every engine says it is empty),
  `cmc-approvals` (C2C-201: the field names), `projects-at-risk` (Sentinel's findings; "No blockers recorded"; nothing due).
  The before set was taken before the window-growing change, so the tallest sections are cut at the window's foot; the
  text logs are complete.
- `after-*`: the Schedule with owners, deadlines, milestones and the milestone tasks, and the roll-up's work projects and
  tasks; the Section approvals table in words; the at-risk answer listing the two review tasks due.
- `rows-red-*`: the Schedule before the row fix (item 5).

The PNGs are reduced to 96-colour palettes to stay under 100,000 bytes each. One run saw `GET
/api/c2c/projects/:id/intelligence` answer 409 `PROJECT_WORKSPACE_MISMATCH` once on C2C-101's page; other runs did not.
Not this work's; noted.

## Commits

| Commit | Plan | Item |
|---|---|---|
| `8846faf52` | F1 | 1. A milestone can be recorded on a project |
| `43920b3e7` | F1 | 2. The roll-up is a read, and says only a recorded risk |
| `307d82d2a` | F1 | 3. CMC says missing inputs in words |
| `d053ba0d5` | F1 | 5. A Schedule row keeps its detail at 390 px |
| `5bbb56e3a` | DATA | 4. Project-management demo data |

Each is pathspec-limited (`git commit -- <paths>`): the index is shared with other sessions.

## Typecheck

The full `npx tsc --noEmit -p tsconfig.json --incremental …` was started twice, each time with no other `tsc` or
`vitest` running, and was killed by the out-of-memory killer both times (exit 137, no output). `typecheck-focused.txt`:
the repository's tsconfig, extended, over the 16 changed TypeScript files. Its 16 errors are ambient declarations
(`*.module.css`, `import.meta.env`, `.d.ts` for `jsonwebtoken`, `pdfkit`, `qrcode`, `server/metrics.js`) in files this
work does not touch; none is in a changed file.

## A mistake during the work

To compare a gate against `HEAD`, this session ran `git stash` and `git stash pop` once (~14:38Z), in the working tree
other sessions share. For a minute or two their uncommitted files read as at `HEAD`. Nothing was lost: the stash's index
equalled `HEAD` (nothing was staged), and the tree after the pop was byte-identical to the stash (`git diff <stash> --`
empty). Every later comparison used `git show HEAD:<file>`.
