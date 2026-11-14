# Biostatistics opens the rail's work areas, directly above CMC (P-132)

**Date:** 2026-11-14 · **Decision:** P-132 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) · **Package:** R1 (the rail entry is
in no scoped package and is carried by R1, as P-131 records)

**The founder's words, 2026-11-14:** "Continue expanding biostatistics- also place on left rail above cmc"

## What already exists (RULE 3)

- `client/src/concept2cure/v2/registryModel.ts` `RAIL_CORE`: the rail's entries, in order. Biostatistics was already
  one, a work area directly below CMC / Module 3. It was added by the founder's words of 2026-11-06, which
  `scripts/ci/one-product-baseline.json` `founderDecisions["rail:biostatistics"]` records and P-107 confirmed.
- `client/src/concept2cure/v2/Shell.tsx` renders `RAIL_CORE` in order under the "Work areas" heading. ⌘K's "Go to"
  follows the same list. Neither changed.
- `docs/design/ONE_DESIGN_PLAN.md` §2 "Sidebar" listed the work areas without Biostatistics and said it "is reached
  from the project". That had been out of date since 2026-11-06.

Nothing is added: no rail entry, screen, route or table. The one-product baseline is unchanged, because its rail list
is a set of ids and the ids are the same.

## The change

- `RAIL_CORE`: Biostatistics moves up one place, so the work areas read Biostatistics, CMC / Module 3, Risk-based
  monitoring, Quality, Reporting & analytics.
- P-132 is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`, and the plan's sidebar paragraph lists the work areas in
  this order (a `Plan: PLAN` commit with `Founder-Decision: P-132`, as RULE 5 requires for a plan change).
- Tests that pinned the old order now pin this one:
  - `registryModel.test.ts`: Biostatistics opens the work areas, and CMC is directly below it;
  - `shellNav.test.tsx`: the rail's labels in order;
  - `cmdkPlaces.test.tsx`: ⌘K's "Go to" in the rail's order.

## Verified by making the check fail

- `red.txt`: the three test files as changed, against trunk's `RAIL_CORE`. 4 of 89 fail: the rail's order, the
  work-area group, ⌘K's order, and "Biostatistics opens the work areas".
- `green.txt`: the same files after the change, 89 pass.
- Every test file that reads the rail (`RAIL_CORE`, "Work areas" or "CMC / Module 3"), 22 files: 393 pass.

## Opened in the running app and used (RULE 4)

`walk.txt` and `screenshots/`, from the dev server (2026-11-14, dev login):

- 1440 px: "… Submission Center · Biostatistics · CMC / Module 3 · Risk-based monitoring · Quality · Reporting &
  analytics" (`rail-1440.png`).
- 390 px, sidebar opened: the same order (`rail-390.png`).
- Biostatistics opened from its rail entry, and the same session walked three of the S12 sweep's fixes
  (`docs/evidence/F1/2026-11-13-biostat-s12-sweep/`): the binary delta, the interim plan with no interim analysis, and
  the group-sequential calculator's per-look table.
