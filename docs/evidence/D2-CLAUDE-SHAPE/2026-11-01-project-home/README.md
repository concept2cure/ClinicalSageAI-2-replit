# D2: Project home takes the shape of Claude's project page (2026-11-01)

The founder, 2026-11-01: *"This platform should look like Anthropic built this. It should match how Claude is designed
entirely, from projects to the canvas to the editor to the details. This is basically Claude for life sciences."*

This slice covers Project home only. The editor (`DocumentWorkbench.tsx`) is next, in the same lane.

## What the person saw before (`before-1440.png`)

At 1440 × 900:

- **The project was named three times** before anything could be done with it. There was a "PROJECT · BX-204 IND"
  crumb, then the heading, then a row of six uppercase chips.
- **A facts table and a reports button took the next band**, and below them a status line.
- **The step band was a filled panel.** "Next step" sat at its far right.
- **The box to talk to AnA was below the fold.** It started at about 626 px, in a side column, under the steps. That is
  the opposite of Claude's project page, where the conversation box comes first and the project's knowledge sits
  beside it.
- **Every document row had a filled orange "Open" button.** Four or more primary buttons stacked down the page, so none
  read as the primary action.

## What already exists

Nothing new was built. Every piece below is moved or restyled, never duplicated.

- `StartConversation`, `ProjectConversations`, `ProjectReportsDoor` and `ProjectStatusLine` (`ProjectHome.tsx`):
  - the composer that opens a thread fenced to this project;
  - the list of this person's threads on it;
  - the door to Reporting & analytics;
  - the filing status line.
- `ProjectSide.tsx`: the readiness ring and the skills card. It is unchanged.
- `.pj-grid`, `.pj-main` and `.pj-side` (`app-v2.css`): the two-column layout that CLIENT_JOURNEY pass 4 decision 5 put
  every step in.
- `StageTracker` and `StageBand` (`ProjectHome.tsx`): the steps and the open step's "what to do now". Neither changed
  behaviour.
- `.pj-tags .rd-chip` with `tone-*` (`app-v2.css`): the header's status chips. The tone classes are kept, so an
  overdue or blocked state still says so in colour.
- `.btn.ghost` (`app-v2.css`): the quiet button the shell already uses for secondary actions.

## What changed

| Before | After | Where |
|---|---|---|
| Crumb, heading and six uppercase chips | The heading and one quiet line, `BX-204 · FDA · … · planning` | `ProjectHome.tsx` (crumb removed); `app-v2.css` `.pj .pj-tags` |
| Facts, reports button and status line across the page | One "About this project" card at the top of the aside, holding the facts, the reports link and the filing status | `ProjectHome.tsx` `<section className="pj-about">`; `project-home-v2.css` `.pj-about*` |
| Composer under the steps, in the aside | Composer first in the main column, then the steps | `ProjectHome.tsx` `.pj-main` |
| Filled step band, "Next step" at the far right | A plain band with a rule under it; "Next step" under the instruction | `app-v2.css` `.pj .pj-stageband` |
| Filled "Open" on every document | `btn ghost` | `ProjectHome.tsx` document row |

**Supersedes CLIENT_JOURNEY pass 4 decision 5.** Decision 5 moved the composer beside the steps because, above them,
it pushed the steps 690 px down. Here the header is about 180 px shorter (no crumb, no chip row, no facts band), so the
composer can come first and the steps still start at about 470 px. Decision 5's other guarantee still holds: the
composer sits outside the step switch, so a half-typed message survives a change of step. The four layout tests that
pinned decision 5 now pin this decision, and cite it.

The crumb's CSS (`.pj-crumb*`, five rules in `app-v2.css`) had no remaining user and is removed. The generated contrast
ramp (`surface-text-ramp.css`, v2 and mdx) was regenerated. It drops `.pj-crumb-k` and also picks up three selectors
trunk had added without regenerating (`.dd-att-note`, `.pde-flow`, `.nav-item[aria-current="page"]`), so
`ci:surface-text-ramp`, which was red on trunk, is green.

## Evidence

| File | What it shows |
|---|---|
| `before-1440.png` | Trunk's Project home at 1440 × 900 |
| `after-1440.png` | This change at 1440 × 900: the conversation box first, the project's knowledge beside it |
| `after-390.png` | This change at 390 px. The meta line wraps with its separators at line ends, never at a line start |
| `01-red-old-layout.txt` | The four layout tests, run against the old `ProjectHome.tsx`: 4 fail. Against this change, they pass |
| `02-project-home-suites.txt` | Every Project home suite with this change: 295 of 298 pass |
| `after-step-change.png`, `04-used-live.json` | The page used live: the draft survives a change of step, and Open reaches the editor |
| `03-three-red-on-trunk.txt` | The same 3 fail on trunk without this change. They are stale `apiRequest(…, AbortSignal)` expectations, handled in the trunk-red sweep |

**Also run:**

- the CSS gates: selector shadowing, undefined classes, shell collisions, orphaned stylesheets and the surface text ramp;
- `ci:one-product`: 102 surfaces, 10 rail entries, none new;
- the ESLint warning ratchet: no file changed its warning count.

**In the running app** (`04-used-live.json`, `after-step-change.png`), as the BX-204 IND project's admin:

- the page was opened at 1440 and 390 px;
- a message was typed in the composer, and the step was changed to Evidence and back; the message was still there;
- a document's ghost Open was used, and the document opened in the editor.

There were no console errors, page errors or failed API calls.
