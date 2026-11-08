# D3-4, the project page's step bodies, and D3's acceptance walked whole

**Package:** D3 (`.design/claude-convergence/D3.md` §4.6 item 4, §4.7, §4.10, §4.11, §4.12, §6). **Plan:** D3.
**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`, 2026-11-08, started by the coordinating session under P-107 item 7.
**Hand-off it continues:** `docs/evidence/DESIGN/D3/README.md`, "What is left: D3-4", items 1–6.

## What already exists (RULE 3)

Nothing was built. Each item finishes or converges an existing path.

| Item | What existed, by path | What it did | What it did not do |
|---|---|---|---|
| 1. Tasks on Plan | `ProjectWorkPanel` in `surfaces/ProjectHome.tsx`, over the page's one `useProjectWork` read (D3-2b) | Rendered twice: "Tasks" on Plan, "Tasks and approvals" on Review. The Tasks handoff (`consumeNavParams('project-home')`) opened Review. | It did not sort by due date. Status was a chip, the source a badge, and "blocking" a separate warning. A handoff that carried `stage: 'review'` (what `TaskBoard.tsx` sends) could never reach the list on Plan. |
| 2. Protocol on Evidence | `ProjectRecords.tsx` read `/api/c2c/projects/:id/records` itself; its `studyDesigns` section was shown only on the Records card | The Records card (D3-2a) | Evidence had no protocol, and the records read had a single reader. |
| 3. Author | `DossierReadinessCard`, `ModuleCompletion` (`ProjectDossier.tsx`); `ArtifactSectionStatus` (`ProjectArtifactReadiness.tsx`); `SectionTracking` (`ProjectSectionTracking.tsx`) | A card with a drawn ring (`.pj-map-ring`), then Module completion, then two boxed sections | The figure line did not lead Module completion. What the figure means was always open. |
| 4. Submit | `ProjectMarkets.tsx`, `MarketBlockers.tsx` | "Add a market" was `btn primary` (orange), last in the header; doors and acts were `btn ghost pj-mkt-btn` | It did not follow D0's small transparent door, and orange appeared on the page outside send. |
| 5. Respond | `CommitmentRowView` (`CommitmentRow.tsx`), `CommitmentFulfilDialog` (`CommitmentFulfilment.tsx`), both rendered by Communication; the page's one commitments read (`ProjectHome.tsx`, D3-2b) | The Filing card's "Commitments" line | Respond did not list commitments, so "Record fulfilment" was reachable only from Communication. |
| 6. Small converges | `ProjectDiscoveryHandoff.tsx` trigger `.sp-ask`; inline `style={{ fontSize: 12, padding: '4px 12px' }}` on eleven step doors | — | The step doors did not follow D0's type and button scale. |

## What changed

| Item | Change |
|---|---|
| 1 | One `ProjectWorkPanel` on Plan, titled "Tasks and approvals: On this project, by due date". It sits before the filing lifecycle reference. Open work is sorted by `dueAt` (undated last), and the requested row stays first. Each row has the title with the status in words at its right ("Blocked · blocking the filing", in the warning tone with its icon when blocked), then "source · owner or Unassigned · priority · Due date" (overdue marked). "See all tasks in Tasks" is `btn small`. Review's copy is deleted. A handoff that carries a `workId` opens **Plan**, whatever step it names. |
| 1 (found walking) | The handed-over task was dropped under the dev server's `React.StrictMode`: the effect that cleared it on mount ran again after the handoff was consumed. The target is now kept with its project (`handedTask`), and no reset effect remains. |
| 2 | `useProjectRecords(pid, epoch)` is read once by `ProjectWorkspace`. `ProjectRecords({ state, activity })` and the new section `ProjectProtocol` (both in `ProjectRecords.tsx`) render it. Evidence now reads, in spine order: Data room ("Refresh sources" in `.pj-sec-acts`), Protocol, then Project files (doors in `.pj-sec-acts`). Protocol has two doors, "Open in Study & Protocol Design" (`APP_REGISTRY.study_protocol_design`) and "Open Biostatistics". It has honest states: reading, failed (never "none"), the store's own reason, and empty with the design door. A device filing has no Protocol section. |
| 3 | `DossierReadinessCard` is Module completion's lead (`lead` prop). It leads with "0 of 72 sections approved or locked.", followed by the home copy and the markets, and has no ring. The figure's meaning and its as-of time are a closed "How this is measured". Artifact section status and Section tracking are closed disclosures under the modules. The `.pj-map*` rules are deleted. |
| 4 | "Add a market" is `btn ghost small`, first in the header. Every other door, retry and to-do act is `btn small`. |
| 5 | Respond lists "Commitments to the agency" from the page's one read. Each row is `CommitmentRowView`, and its "Record fulfilment" opens `CommitmentFulfilDialog` with `door="project"` and the verified integer id. A recorded fulfilment reads the list again. The states are: none, failed with Retry, reading, and the project's id not verified (said in words). The step's `h2` is `sr-only`. |
| 6 | The discovery trigger is `btn ghost small`. Every inline door style in `ProjectHome.tsx` is gone. |
| CSS | `app-v2.css`, `.pj` block (the coordination turn): hairline step rows, the dossier lead, and module rows that say their name and count in full. Before, a 104px ellipsis cut "Module 1 · Administrative · 0 of 13 …" to "Module 1 · Admin…". At 640px, doors wrap and start left, the byline's indication wraps, and record titles wrap. `project-home-v2.css`: the work status, overdue, a 32px gap between sections, and the Respond step heading at the section size. The phase door keeps D0's 44px touch target. |

Capability kept: nothing was removed without its place named. The Review tasks list is now on Plan. The ring is
replaced by the Filing card's figure and the lead line. The boxes are now disclosures with the same text and data.

## Tests: red first, then green

- `red-first.log`: the 10 changed suites run against trunk's source with these tests. **36 failed**. With this
  change all pass.
- `red-strictmode.log`: the StrictMode handoff case fails with the old reset effect put back, and passes without it.
- New or rewritten cases are in:
  - `projectHomeReviewWork` (Plan's panel, sort, status words, overdue, Review without tasks, the handoff with stage
    'review', StrictMode);
  - `projectHomeStepReturn` (a workId opens Plan for an invalid, 'review' or missing stage);
  - `projectRecords` (the lifted read, and Protocol's four states with one read for both readers);
  - `projectHomeReadiness` (the lead, no ring, closed disclosures);
  - `projectMarkets` (ghost first, small doors and acts);
  - `projectRespondStage` (commitments, the Fulfil dialog on the project's door, the states, the sr-only heading);
  - `projectHomeTeamSetup` (Respond lists the Filing card's commitments with one read);
  - `projectHomeReviewStage`, `projectHomeMyWorkLine`, `projectHomeConversations`, `ProjectRecordedContext`
    (moved with the behaviour).
- Fixed in passing, both in D3's test files and both red on trunk:
  - `projectCreationDoors.contract` and `projectDestination` follow the founder's 2026-11-06 decision that Vault is
    reachable from the rail with no project open (`5144702d21`). Vault lists the projects whose Vaults the person can
    open, in place of a Projects door. The new case fails when that list is removed.
  - `projectBiotechPlan`'s fixture now carries `project_id`, which the filing read verifies since `3d9879dfc`.
- `suites.log`: 82 project suites, **918 of 919 pass**. The one failure is `projectHomeStageCss` "defines no class
  another v2 stylesheet already defines", as on trunk (`.btn`, `.pj`, `.pj-sec-h`, `.rpk-tabs`). This step added
  none.

## Gates (`gates.log`)

These pass: `ci:undefined-css-classes`, `ci:surface-text-ramp` (regenerated), `ci:check-phantom-tokens`,
`ci:one-product`, `ci:check-shell-css-collisions`, `ci:fixture-fallback` and `ci:token-contrast` (131 pairs).
`ci:check-css-selector-shadowing` fails on `submission-v2.css` `.sc-subrow` only, as on trunk. That is not a D3
sheet. The ESLint warning count of every changed file is at or below trunk's.

## In the running app

The app ran from local Postgres 16 with the full migration set and was seeded with `demo:seed --pack all`. Sign-in
was dev-login as `jm.smith@concept2cure.pro`.

- **`walk.cjs`** (`walk.json`, `walk.log`, `screenshots/p{1,2}-{1440,390}-{light,dark}-*.png`) covers C2C-101
  (`p1`) and "[Demo · MDX] NeuroPanel-Dx 510(k)" (`p2`). Each was walked at 1440 and 390 (390 with touch), in light
  and dark. Every one of the six steps was opened, captured, and its D3-4 section captured on its own
  (`*-section.png`). All eight runs pass, with no failed request and no page error. It asserts:
  - D3 §6 item 1: the order header → composer → conversations → steps → blurb, and Project knowledge's About,
    Filing and Team.
  - Item 2: the main column is the same width on all six steps (764px at 1440).
  - Item 3: no band, no ring, nothing uppercase, and no primary (orange) button in a step body.
  - Item 4: Lora 26px weight 500, and 22px at 390.
  - Items 8–11: tasks only on Plan; Author led by "0 of 72 / 0 of 31 sections approved or locked." with "How this is
    measured" closed; Submit's doors and acts small and "Add a market" ghost; Respond's Commitments.
  - Item 14: at 390, no horizontal scroll and every button at least 44px tall.
- **`interact.cjs`** (`interact.json`, `interact.log`, `screenshots/interact-*.png`) covers C2C-101 at 1440:
  - Protocol's two doors open Study & Protocol Design and Biostatistics on the project.
  - A Tasks handoff carries stage 'review' and a workId from the project's own work read. The page is left for
    Tasks, the handoff is stashed as `TaskBoard.tsx` stashes it, and the top bar's crumb brings the page back. It
    opens Plan with that row first and focused.
  - A commitment is recorded against the project's open letter through the project's route (201, governed, local
    data). It is listed under "Commitments to the agency", and "Record fulfilment" opens the existing fulfilment
    dialog (`/api/concept2cure/projects/1/commitments/1/fulfilment-options`). The dialog is closed without
    recording anything.

**Fixed because the walk found them:** the StrictMode handoff (above), and the module rows' truncated counts. Three
things were too wide at 390: the byline's long indication on the 510(k) (146px of page scroll), a device
workstream door, and record titles. The phase doors were 40px tall to the touch. On the Filing card, "Commitments"
broke mid-word beside a long value, and the market line's chevron fell to a line of its own. The label now stays
whole and the chevron stays on the first line (`screenshots/filing-card-commitments-{1440,390}.png`).

## Found, not D3's (reported to the coordinating session)

- **Install-fresh refuses the migration set.** `scripts/db/install-fresh.mjs` stops with "`public.ctd_cross_references`
  carries no RLS policy" (a child of `ctd_documents` and `ctd_module_sections`, row security off). Deploy-migrate
  completes. This environment also needed `postgresql-16-pgvector` installed and `CREATE EXTENSION vector` run as
  superuser before the migration set would apply.
- **The demo seed's Lumen pack writes into other projects.** "[Demo · Lumen] … GMP deviation" sources are recorded
  on NeuroPanel-Dx (11) and C2C-101 (11) (`cre_evidence_sources.client_program_id`). The Records card reports them
  truthfully. The seed is the defect.
- **`TaskBoard.tsx` still sends `stage: 'review'`** with every project task handoff (`publishNativeTaskHome`). The
  page now opens Plan regardless, so the word is harmless, but the board's owner can drop it.
- **`AgencyInbox.tsx`'s "Draft response with AnA" is orange** inside the Respond step. D3 §6 item 3 allows only send.
  The file is S10's (RIM).
- **`routing.ts`: `documents` (Vault's alias) still goes to Projects with no project open,** while `vault` itself
  opens Vault (since `5144702d21`). Vault parity should decide whether the alias follows.

## Running it again

```
(set -a; . ./.env; set +a; PORT=5000 SKIP_DB_STARTUP_TEST=true npx tsx server/index.ts)
node docs/evidence/DESIGN/D3/D3-4/walk.cjs http://127.0.0.1:5000 <C2C-101 program id> <NeuroPanel-Dx program id>
node docs/evidence/DESIGN/D3/D3-4/interact.cjs http://127.0.0.1:5000 <C2C-101 program id>
```

Do not edit `client/` while a walk runs: Vite reloads the page, and the walk fails with a null `.pj-main`.
