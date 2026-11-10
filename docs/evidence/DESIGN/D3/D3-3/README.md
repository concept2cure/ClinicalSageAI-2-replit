# D3-3: the Team drawer, the Team card, and settings opened on a field

**Package:** D3 (`Plan: D3`). **Completes:** `client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx`.
**Spec:** `.design/claude-convergence/D3.md` §4.9 (the two drawers), the Team card of §4.8 item 3, and About's "Edit"
of §4.8 item 1. The order follows `BUILD_ORDER.md` ("D3-3 goes before D3-2"). D3-1 delivered the settings drawer.
**Read at:** `17f7fe37b8` on `concept2cure-v2`, 2026-11-06, with D3-1 on trunk.

No screen, route, service, table, mount or AnA tool was added (RULES 4 and 6). The card and the drawer are two
exported components in the existing `ProjectTeamResponsibilities.tsx`. They render the same team read, the same
roster component and the same `ProjectTeamSharing`. No test file was added.

## What already exists (RULE 3)

**Searches run:** `grep -rn` over `client/src/concept2cure/v2` for `ProjectTeamResponsibilities`,
`ProjectTeamSharing`, `PROJECT_TEAM_AUTHORITY_NOTE`, `useProjectTeam`, `pj-team`, `team=`, `de-gov`, `pj-card-h-go`,
`useDialog`, `request=`.

| Piece | Path | Before D3-3 | Not done before D3-3 |
|---|---|---|---|
| The team read | `ProjectTeamResponsibilities.tsx` `useProjectTeam` | One verified read per project and session, called by `ProjectWorkspace`. It is retired on a project or scope switch. | — |
| The roster | `ProjectTeamResponsibilities.tsx` `ProjectTeamResponsibilities` | Identity, responsibilities, sharing role and sources per member, with the authority note above. Loading, unverified and empty states. | — |
| Sharing | `ProjectTeamSharing.tsx` | Grant, set a role and revoke. Server capability decides which controls show. | — |
| Where they showed | `ProjectHome.tsx` → `ProjectPlan.tsx` `team` prop | A "Team" section on the Plan step only. | Not on any other step. Not a drawer. |
| Project settings | `ProjectSettings.tsx` | A drawer since D3-1, opened by the gear beside the name. | Nothing else on the page could open it, or open it on a field. |
| Team classes | `styles/app-v2.css` `.pj-team`, `.pj-team-m`, `.pj-team-av` | Rules for an older team strip. | No markup used them. |

## What changed

- **The Team card** (`ProjectTeamCard`) is in Project knowledge, after About, on **every** step. Each member shows
  an initials disc, the name, and a line of responsibilities and sharing role ("Project lead · Project owner ·
  Owner"). It reads "Reading the team…" while loading. A failed read says so with "Retry team" (a refusal is said
  as itself, through D0's `ErrorState` `read`). An empty team says "No recorded team members."
  "Manage" (`aria-label="Manage team"`) opens the drawer.
- **The Team drawer** (`ProjectTeamDrawer`) is D0's `.de`, with eyebrow "Project" and title "Team". It holds the roster
  (`showNote={false}`), `ProjectTeamSharing`, and the authority note once, as a `.de-gov` box. Its footer has "Done".
  `useDialog` keeps focus inside, Escape closes it, and focus returns to "Manage". A project switch closes it, and so
  does an account or organization change (the workspace remounts), so no sharing control from a previous scope stays
  on screen.
- **Plan** loses its `team` prop and section (`ProjectPlan.tsx`).
- **"Refresh sharing"** is `btn small`, so "Grant sharing" is the drawer's one primary.
- **Settings opened on a field.** `ProjectSettings` takes `request?: { n, focus? }`. A change of `n` opens the drawer,
  reads the saved settings, and focuses the named field (`description`, `priority` or `targetSubmissionDate`, now
  with ids). A request already seen at mount opens nothing. About's "Edit" (`aria-label="Edit project details"`, for a
  person who may change the project) calls `openSettings('description')`.
- **CSS.** The three unused team rules became the card's (`.pj-team`, `.pj-team-av`, `.pj-team-m`), with
  `.pj-team-row`, `.pj-team-who` and `.pj-team-n` beside them.

Not in D3-3: the per-person due work on the card. It needs the lifted unified-work read (§4.10), which is D3-2.

## Capability kept

| Moved | Where it is now |
|---|---|
| Team section on Plan: the roster, its states, the authority note, sharing controls | The Team drawer: the same components, reads, writes, refusals and notices. A summary is on the Team card on every step. |
| Opening settings only from the gear | The gear, and About's "Edit" (on the description). |

## Tests (red first: `red/d3-3-tests-against-d3-1.txt`, 10 failing against the D3-1 source)

| File (`client/src/concept2cure/v2/__tests__/`) | Change |
|---|---|
| `projectHomeTeamSetup.test.tsx` | Sharing is reached through "Manage team". After an account or organization change the drawer is closed; reopened, it reads sharing with the new anchor and headers. **Added:** the card on every step and not on Plan; the drawer's roster, note-once, Escape and focus return; a failed team read on the card with its retry. |
| `projectHomeTeamResponsibilities.test.tsx` | The roster's wording is checked in the drawer. The empty and loading lines are checked on the card. The Plan clicks are gone (the card is on every step). |
| `ProjectSettings.test.tsx` | **Added:** a request opens the drawer on the named field, once. A request seen at mount opens nothing. |
| `ProjectTeamResponsibilities.test.tsx` | **Added:** `showNote={false}` drops the note and keeps the roster. |
| `projectHomeReviewWork.test.tsx` | "No error" is checked in the step body. The test serves no team, so the card rightly says the team could not be read. |
| `filingLifecyclePlan.test.tsx` | `ProjectPlan` has no `team` prop. |

**Result** (`green/project-suites.txt`): 81 suites, 886 tests, 1 failure: `projectHomeStageCss`'s clash case, as on
trunk. Typecheck 0 errors. The lint ratchet shows no file gained a warning. The design and fixture gates pass.

## The running app

`node docs/evidence/DESIGN/D3/D3-3/walk.cjs http://127.0.0.1:5000 <programId>`. Same local stack and project as D3-1.
Log: `walk.json` (`"result": "pass"`).
- 1440 light: the Team card is in Project knowledge on all six steps, and no step's main column has a "Team"
  section.
- "Manage" opens the Team drawer at 1440 light, 390 light (full width, with a full-width "Done") and 1440 dark. The
  drawer shows the roster, "Project sharing" and the note once. Focus moves in; Escape closes the drawer and focus
  returns to "Manage team".
- About's "Edit" opens Project settings with focus in "Project description".
- No sideways scroll at either width.
