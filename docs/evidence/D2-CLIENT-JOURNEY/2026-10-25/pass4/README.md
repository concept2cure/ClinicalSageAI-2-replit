# D2 — Steps first; AnA beside the open step (pass 4)

Founder decision 5 of the design interview: opening a project shows the steps first, then the open step; AnA's start
box and the project's conversations move into the open step's side column. Design note:
`docs/design/CLIENT_JOURNEY_2026-10-25.md`, "Pass 4".

## What changed

- The start box and the project's conversations left the space above the steps (`.pj-start`) for a side column
  beside every step (`aside.pj-step-side` in `ProjectHome.tsx`). The column is outside the step switch, so a
  half-typed message survives a change of step, as it did above the steps.
- Author's own side cards (dossier readiness, skills, memory, instructions; `ProjectSide.tsx`) join that column on
  Author, where they were. `AuthorWorkspace` no longer draws its own grid.
- The column scrolls with the page (it can be taller than the window), where Author's sticky aside could not.

## Browser (local install, "BX-401 Oncology IND")

| File | What it shows |
| --- | --- |
| `desktop-plan-first-screen.png` | First screen: header, the six steps at y 316 (they were at about 690 behind the start box), Plan's list beside AnA. |
| `desktop-author-with-side.png` | Author, with the message typed on Plan still in the box, and Author's side cards. |
| `phone-plan-first-screen.png` | 390 px: steps first; the side column stacks under the step; no sideways scroll. |

No page errors.

## Tests

`projectHomeStages` and `projectHomeConversations` now pin the order: the steps before the start box, the start box
and conversations inside the side column, the message kept across all six steps. Run against the old order, both
fail (`red-old-order.txt`). `green-summary.txt`: the affected set, 1,055 pass; the 11 failures are five files that fail
identically at 2246406e4.
