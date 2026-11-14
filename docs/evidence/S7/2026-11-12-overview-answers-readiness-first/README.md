# The Overview answers "is Module 3 ready, what blocks it, what is next" first

**Row:** D5 (the screens show the work) · **Package:** S7, under P-122 (inventory row A6) · **Date:** 2026-11-12

## What already exists

| Path | What it does today |
|---|---|
| `client/.../surfaces/CmcModule.tsx` `CmOverview` | The Overview tab: a lead line about the organisation's submissions, one figure (Module 3 questions overdue), the Section approvals table, the Portfolio, and — last — the "Module 3 build state" block |
| `GET /api/cmc/module3-os/readiness/:projectId` → `server/services/cmc/final-export-gate.ts` | The export gate's own verdict and counts. The block reads it; nothing is derived in the browser |
| `sectionIncomplete`, `nextSec`, `inReview`, `drafts` in the same component | The predicates the table and the "Advance the next section" button already use |
| `docs/evidence/DESIGN/P-122/inventory/cmc.md` row A6 | Records that the approved count and the named next section stood at the top of this tab until the D5 layout pass; the next section survived only as a hover title |

Nothing new: one block moved up inside its own component, one line added from values the component already computed.

## What a head of CMC saw (walked in the running app, C2C-201, 1440×900)

`01-before-1440.png`. The first screen says "1 submission — no preparedness index computed yet", "0 Module 3 questions
overdue", then the first rows of a 21-row table. Whether Module 3 can be filed, how many sections are approved and
what blocks the export were below that table, off the screen.

`02-after-1440.png`. Directly under the lead:

> **Module 3 build state** — 0% approved · **Not export ready**
> 0 of 21 sections approved — 21 draft — export blocked: 21 not approved
> Next to approve: §3.1. 6 drafts are incomplete: the table below names what each is missing.

Section approvals follows immediately, so the first thing to act on is still on the first screen.

## The change

- The build-state block moves from the end of the tab to directly above Section approvals. Its content is unchanged.
  Its sub-label read "§3.2.S — §3.2.P" over a list that now also holds §3.1, the three appendices and the US regional
  section; it reads "CTD Module 3".
- One line names **the next section a signer can act on**: the first in review, else the first draft, that the approve
  route would not refuse. An incomplete or out-of-date section is refused (409), so it is not offered as "next to
  approve"; when none qualifies the line says so. It also counts the incomplete drafts, over the same rows and with
  the same predicate as the table's "Incomplete" chip.
- The disabled "Advance the next section" said "Every section is approved" whenever there was no next section —
  including on a project with no sections. It now gives the true reason of three.
- Found only in the running app: on compiled sections the board's `path` repeats the number, and the line first read
  "Next to approve: §3.1 3.1." The path is printed only when it adds something. The table's own Path column shows the
  same repetition; it is in the region another session holds today and is reported to it in `COORDINATION.md`.

The file's earlier comment said the build state is "reference material" that does not go above the thing you came to
do. That order is reversed here deliberately, on P-122 §1: where the calm layout and a customer seeing their own work
conflict, the work wins. The retired tinted banner is not brought back.

## Verified

- Red first: 4 of the 5 new cases failed on the old layout (`expected false to be true` for the order; no
  `cmc-next-section`; `'Every section is approved'` on a project with no sections). Green: 29 of 29 in
  `cmcOverviewCompleteness.test.tsx`, and 368 of 368 across the 24 suites that mount the CMC module or its registers,
  with the retired-name ratchet.
- Opened and read in the running app on C2C-201 after the change (the second screenshot).
- `eslint` on `CmcModule.tsx`: 14 warnings, as trunk. The retired `cm-meta` class count is unchanged (41); the new
  line uses `sec-sub`.
