# D3-2b: one read, several readers (work and agency inbox)

**Package:** D3 (`Plan: D3`). **Completes:** `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`.
**Spec:** `.design/claude-convergence/D3.md` §4.10 (reads lifted into `ProjectWorkspace`) for the unified work and the
agency inbox, with the readers §4.8 names: the Team card's per-person work (item 3) and the Filing card's agency
letters (item 2). **Read at:** `e533082d63` on `concept2cure-v2`, 2026-11-06, with D3-1, D3-3 and D3-2a on trunk.

No endpoint, route, service, table or AnA tool was added. Two reads that already exist are each made once by the page
instead of once per reader. No test file was added.

## What already exists (RULE 3)

**Searches run:** `grep -rn` over `client/src/concept2cure/v2` for `unified-work`, `ProjectWorkPanel`,
`useAgencyInbox`, `agencyCommsPath`, `ProjectRespond`, `ownerName`, `closureStatus`, `responseClock`, `onAssigned`.

| Read | Path | Before D3-2b |
|---|---|---|
| Unified work, `GET /api/concept2cure/projects/:uuid/unified-work` | `ProjectHome.tsx` `ProjectWorkPanel` | Read inside each panel: Plan's "Tasks" and Review's "Tasks and approvals". Switching between them read it again. After an assignment, Plan re-read it by remounting its tasks. |
| Agency inbox, `GET /api/concept2cure/projects/:uuid/agency-communications` | `AgencyInbox.tsx` `useAgencyInbox`, called in `ProjectRespond.tsx` | Read only when Respond was open, with its own notices. Nothing outside Respond said whether a letter was open. |

## What changed

- **`useProjectWork(pid, version)`** in `ProjectHome.tsx` makes the one work read. Both task panels take it as
  `state`. Plan calls `onWorkChanged` after an assignment, so the read is made again (`ProjectPlan.tsx`). The
  remount-to-reread no longer reaches a lifted read.
- **`useAgencyInbox(pid, fire)`** is called once by the page, which shows its notices once. `ProjectRespond` takes
  it as `inbox` and no longer reads.
- **The Filing card** gains "Agency letters": "Reading…", "Could not be read", "None open", or "1 open · next
  response due Feb 20, 2099". The due date is the letter's response clock when dated, else its typed date. The row
  opens Respond. Each Filing row's accessible name says label and value apart ("Agency letters: None open").
- **The Team card** gains each member's open work, matched by the owner name the work records: "Nothing open", or
  "2 open · next due Jan 5, 2020". A passed due date shows the clock in the warning tone. The lines after the members
  cover open work with no owner ("1 open item unassigned") and work held by someone not on the team; each opens Plan.
  While the read is out nothing is said, and a failed read is said once ("Open work could not be read."), never as
  "Nothing open".

### Second half (same step, its own commit)

- **Commitments.** The page reads the project's commitments to the agency once, by the verified integer project id
  the route takes (`GET /api/concept2cure/projects/:projectId/commitments`, `isCommitmentsPayload`). It reads nothing
  until the team read has verified the id. The Filing card gains "Commitments": "None open", or "2 open · 1 overdue ·
  next due Mar 1, 2020". Overdue is the server's effective status. A failed read says "Could not be read". The row
  opens Respond. Respond's own Commitments section is D3-4's.
- **Activity.** The project's audit feed, already read once by the page, is the Records card's last disclosure,
  "Activity", on every step. It was a section of the Author step. The rows, actors, recorded reasons and times are
  unchanged, and it shows even when the records read fails.
- **The records read itself is not lifted yet.** Today its one reader is the Records card. Its second reader,
  Evidence's Protocol, is D3-4's, which lifts it with that reader, so this step adds no plumbing for a reader that
  does not exist.

Red first: `red/d3-2b-second-half-against-first.txt` (3 failing against the first half). Added cases: the
commitments row (counts, overdue, next due, opens Respond); a failed commitments read; Activity as the Records card's
last disclosure in the aside, with nothing of it left in the main column (`projectActivityReason.test.tsx`).

In the running app (`walk.json`): "Commitments: None open" from the real route, and Activity lists the project's
three recorded acts inside the Records card, at 1440 light and dark and 390 light.

Found, not D3's: `projectCreationDoors.contract` (Vault.tsx's Projects index door) and `projectDestination` fail on
trunk without this change. They follow the Vault session's `adb1c00cba` and `5144702d21`.

## Tests (red first: `red/d3-2b-tests-against-d3-2a.txt`, 4 failing against the D3-2a source)

`projectHomeTeamSetup.test.tsx`, "one read, several readers (D3-2b)":
- each person's open work, a passed due date marked, and the unassigned and not-on-the-team lines opening Plan;
- a failed work read said once, never "Nothing open";
- the Filing card's letters row, named "Agency letters: 1 open · next response due Feb 20, 2099", opening Respond;
- the work and the inbox each read **once** across Plan, Review, Respond, Plan, Review. Against D3-2a this case
  fails: the old panels and Respond read again on each step change.

`projectRespondStage.test.tsx` mounts Respond as the page does, with the inbox read once outside it.

**Result** (`green/project-suites.txt`): 83 suites, 903 tests, 1 failure: `projectHomeStageCss`'s clash case, as on
trunk. Typecheck 0 errors. The lint ratchet shows no file gained a warning. The gates pass.

## The running app

`node docs/evidence/DESIGN/D3/D3-2b/walk.cjs http://127.0.0.1:5000 <programId>`. Log: `walk.json` (`"result": "pass"`).
- Counted at the network over eight step changes (Plan, Evidence, Author, Review, Submit, Respond, Plan, Review):
  **no read** of the work or the inbox. At mount the dev server reads each twice. `client/src/main.tsx` renders under
  `React.StrictMode`, which runs effects twice in development only, so a production build reads each once.
- "Agency letters: None open" opens Respond. The Team card says "Nothing open" for JM Smith (this project has no
  open work).
- 1440 light and dark, and 390 light: no sideways scroll.
