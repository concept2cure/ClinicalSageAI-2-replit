# D2 — Home lists your open items; a new organisation's setup (pass 5)

Founder decision 9: Home lists your open items (sections to write, reviews, signatures waiting) and, for a new
organisation, a three-item setup checklist (company details, invite team, first project). Design note:
`docs/design/CLIENT_JOURNEY_2026-10-25.md`, "Pass 5".

## What changed

- **Your open items** replaces the "Your tasks" link: the tasks assigned to you (including deliverables assigned on a
  project's Plan), the approvals you sign, and the reviews you were asked for. These are the top bar's "Your work"
  groups and reads, moved into `OpenWork.tsx` and used by both, so Home and the bell show the same thing from the same
  reads; `TaskTray.tsx` keeps its notifications and badge. Each item opens where it is worked.
- **Set up your organisation** (`HomeSetup.tsx`), for organisation administrators, until all three are done:
  company details (the company-documents profile saved with an address, not the signup name), your team (more than
  one membership on the organisation), your first project (the project list Home already reads, now read once and
  shared with "Your projects"). A failed read says "Could not be checked". Each step opens where it is done: Admin &
  access Settings, Admin & access Members, the New project wizard.
- The organisation-administrator rule moved from `Shell.tsx` to `orgAdmin.ts`, with its explanation, so the shell
  and Home read one rule.

## Browser (local install, signed in as the organisation's administrator)

| File | What it shows |
| --- | --- |
| `home-setup-and-open-items.png` | Set up your organisation (1 of 3 done), Your projects, Your open items listing the two deliverables assigned on Plan. |
| `open-item-on-board.png` | An open item opened: the task on the board, with its project and the note written on Assign. |

No page errors.

## Tests

- `homeOpenItems.test.tsx` (3): each group listed from its read, each item opens where it is worked, a failed read
  is said. Red against the Home before this change (`red/open-items-on-old-home.txt`).
- `homeSetup.test.tsx` (6): a new organisation's three steps, the signup name not counted as company details, each
  step's door, a failed read, the checklist gone when done, not shown to a member. Each rule broken in turn turns a
  test red (`red/setup-*.txt`).
- The work panel's own tests (`taskTray*`, `notification*`) pass unchanged on the moved code.
- `green-summary.txt`: 572 pass; 6 failures in two files that fail identically at 2246406e4.
