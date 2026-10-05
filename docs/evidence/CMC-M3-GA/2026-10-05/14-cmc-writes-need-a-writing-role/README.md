# A viewer reads CMC and writes none of it

Row **D2** (and D5 §11.10(d), (g)). Found by the GA route-readiness review
(2026-10-05): `no-role-gate-on-cmc-writes` (P1).

## The defect

No write under `/api/cmc` checked the caller's role, except three that were
gated one by one: contradiction resolve, source-evidence linking and placement.
The rest were open to a viewer:

- register creates and edits;
- specifications and batch records;
- the Module 3 compile, refresh and build-section;
- the contradiction sweep;
- agency questions.

So a viewer could edit GxP register rows. A viewer's recompile that changed a
section returned an **approved** Module 3 section to draft.

## The fix

**`server/api/cmc/cmc-write-role-gate.ts`** is mounted **once**, ahead of every
`/api/cmc` router (`server/bootstrap/register-core-routes.ts`). Any write route
added later is gated by default.

- A write (anything but GET, HEAD or OPTIONS) needs a governed-write role. This
  is `requireEditorAccessForWrites`, the same gate the ProtocolDev, RIM and
  IRB routers use, so a viewer gets 403.
- Six computations take a POST body but save nothing, so a viewer may run them:
  - ICH compliance;
  - control strategy;
  - variation classification;
  - the stability shelf-life, trending and poolability estimators;
  - the final-export guard.

  Each was checked to write no row. The exemptions are exact paths, so a write
  beside one is still refused.
- Signing routes still check signing authority on top of this gate.

## Red, then green

- **Staff simulation, real server.** New step 3b: the org admin adds a viewer
  through `POST /api/tenant-users`, the product path, and the viewer signs in.
  - Before (`red-simulation-before.txt`, the gate unmounted) the viewer
    **registered a drug substance, edited the registered one and ran the
    contradiction sweep**. All three returned 200. The run scored 134 passed,
    3 failed.
  - After (`green-simulation-after.txt`) all three are refused with 403. The
    viewer still reads the register and runs the ICH compliance check. Every
    staff write in the run still succeeds: **137 passed, 0 failed**.
- **Unit** (`cmc-write-role-gate.test.ts`, 33 tests, `green-unit.txt`):
  - eleven writes across the CMC routers are refused for a viewer and allowed
    for a member;
  - a request with no role is refused;
  - the seven computation paths are open to a viewer;
  - the exemptions are exact;
  - the gate is mounted ahead of every `/api/cmc` router (read from the
    bootstrap source).
- **Wider run.** Every CMC route suite and the bootstrap suites pass: 583 tests.
