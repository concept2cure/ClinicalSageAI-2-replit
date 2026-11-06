# D3-2a: Project knowledge, the same on every step

**Package:** D3 (`Plan: D3`). **Completes:** `client/src/concept2cure/v2/surfaces/ProjectSide.tsx`.
**Spec:** `.design/claude-convergence/D3.md` §4.8 items 1, 2, 4, 5, 6 and 7, over the reads that already exist. The
four reads §4.10 lifts are D3-2b. Following `BUILD_ORDER.md`, D3-2 takes the readiness card into Author.
**Read at:** `21a21849d7` on `concept2cure-v2`, 2026-11-06, with D3-1 and D3-3 on trunk.

No screen, route, service, table, mount or AnA tool was added (RULES 4 and 6), and no read was added: every card
renders a read the page already made. No test file was added.

## What already exists (RULE 3)

**Searches run:** `grep -rn` over `client/src/concept2cure/v2` for `ProjectSide`, `DossierReadinessCard`,
`dossierSummaryValue`, `ProjectStatusLine`, `ProjectRecordedContext`, `ProjectSkills`, `ProjectRecords`,
`ProjectCoreWork`, `ProjectReportsDoor`, `pj-about-link`, `pj-about-row`, `pj-work-area`, `pj-card`.

| Piece | Path | Before D3-2a |
|---|---|---|
| The side column's Author cards | `surfaces/ProjectSide.tsx` | The dossier's readiness card (with its ring), Skills, and Memory and Instructions as two cards. All on the **Author step only**. |
| Memory and Instructions | `surfaces/ProjectRecordedContext.tsx` | Two cards over one scoped profile read. Each repeated the loading and failure line. "Instructions" opened with two sentences about separate sources. |
| Records | `surfaces/ProjectRecords.tsx` | "Records in this project", a section of the **Author** step's main column, with six stores as headings and rows. |
| Work areas and Reports | `surfaces/ProjectCoreWork.tsx`, `ProjectHome.tsx` `ProjectReportsDoor` | Orange inline links in the About card. |
| Market status and the review line | `surfaces/ProjectMarkets.tsx` `ProjectStatusLine` | Lines at the bottom of the About card. |
| The readiness figure | `surfaces/ProjectDossier.tsx` `dossierSummaryValue` | Used only in AnA's page summary. |

## What changed

Project knowledge now has the same cards on all six steps, in Claude's order:
- **About.** The facts, under a heading that always shows. "Edit" appears for a person who may change the project
  (D3-3).
- **Filing** (new card, existing reads). A "Dossier readiness" row with the figure (`dossierSummaryValue`) opens
  Author. Then `ProjectStatusLine`, moved unchanged from About, which opens Submit at a market's verdict.
- **Team** (D3-3).
- **Work areas.** `ProjectCoreWork` is a card. Each area is a row with its surface's icon, its label and a chevron,
  with its description in the title. "Reports" is the last row, and its accessible name is still the full sentence.
  The rows wait for the project's read, but the Reports row does not. The navigation keeps its name.
- **What AnA knows.** One card: "AnA reads these in every conversation in this project.", then "Memory" and
  "Instructions" as closed disclosures. Each summary says what it holds ("· enriched Nov 5", "· none saved",
  "· none recorded"). The loading and failure line is said once. The two separate-source sentences are gone.
- **Skills.** Unchanged markup, now on every step.
- **Records.** One card. Each store is a closed disclosure whose summary gives its count ("Vault documents · 6",
  "· not available"). A failed read says so through D0's refusal rule.

On Author, the readiness card (figure, ring, counts and what it means) sits above Module completion, beside the
modules it measures. Removing the ring is D3-4's.

CSS: the Work areas and Filing rows share one rule. The About card's orange-link rules (`.pj-about-row`,
`.pj-about-link`) and the hidden "Work areas" kicker are deleted, since no markup uses them. `surface-text-ramp.css`
was regenerated for the rows' hover.

## Capability kept

| Moved | Where it is now |
|---|---|
| Readiness card in the Author side column | The figure on the Filing card (every step); the card itself on Author, above Module completion. |
| Memory and Instructions cards (Author only) | One "What AnA knows" card on every step, both disclosed in full, with the not-verified line kept. |
| Skills (Author only) | The same card on every step. |
| Records in this project (Author's main column) | The Records card on every step: every store, its count, its rows and its "not available" reason. |
| Work areas and Reports links in About | The Work areas card's rows, with the same destinations and names. |
| Market and review lines in About | The Filing card, unchanged. |

## Tests (red first: `red/d3-2a-tests-against-d3-3.txt`, 36 failing against the D3-3 source)

Added:
- `projectHomeStages`: the column's cards in order, the same on all six steps; the Filing figure opens Author.
- `projectRecords`: one "Records" card of closed disclosures with counts.
- `projectCoreWork`: a "Work areas" card with icons and the Reports row last; the Reports row shows before the track
  is read.
- `ProjectRecordedContext`: Memory and Instructions as closed disclosures of one card.

Rewritten:
- `ProjectRecordedContext`: one card, one alert, and no separate-source sentences.
- `projectSideNotRead`: one "select a project" line.
- `projectHomeConversations`: the figure on the Filing card, no ring in the aside.
- `projectHomeRecords`: the Records card in the aside.
- `projectHomeReportsDoor`: the door is a Work areas row.
- `projectHomeSubmitStage`: the step's own retry, scoped to the step body.

**Result** (`green/project-suites.txt`): 81 suites, 892 tests, 1 failure: `projectHomeStageCss`'s clash case, as on
trunk. Typecheck 0 errors. The gates pass.

## The running app

`node docs/evidence/DESIGN/D3/D3-2a/walk.cjs http://127.0.0.1:5000 <programId>`. Log: `walk.json` (`"result": "pass"`).
- 1440 light: on Plan, Evidence, Author, Review, Submit and Respond the column reads About, Filing, Team, Work
  areas, What AnA knows, Skills, Records, the same list each time.
- The Filing card's "Dossier readiness 0%" opens Author, where the readiness card is.
- The Records card lists six stores ("Submissions · 1", "Data Room sources · 1", …), all closed. One opens on click.
- 1440 dark and 390 light: the same column, with no sideways scroll. At 390 it follows the step body.
