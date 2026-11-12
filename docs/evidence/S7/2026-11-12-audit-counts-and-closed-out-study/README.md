# CMC: counts stated only over a read that resolved; a closed-out study stops offering what the server refuses

Plan S7. Completes `client/src/concept2cure/v2/surfaces/CmcModule.tsx` (`CmPathway`, `StabilityRowActions`).

## What already exists

- `CmPathway` (`CmcModule.tsx`), the Approvals & audit tab: it reads the section list
  (`/api/cmc/module3-os/sections/:project`), each section's event stream, and the contradiction history
  (`/api/cmc/module3-os/contradictions/:project`). Each card below the heading already has its own honest error state
  ("Couldn't load contradiction history", "Couldn't load the audit chain").
- The heading's one count line (`data-testid="cmc-audit-counts"`) and the Contradiction history card's header printed
  their figures from the arrays alone, so a failed or unfinished read printed `0`.
- `headerMeta` (`cmcShared.tsx`) already holds the rule for register cards: a count only over a read that resolved.
- `StabilityRowActions` (`CmcModule.tsx`): "+ Result", "Close out", "Estimate", "Trend", "History" on each study row.
  The server already refuses a result on, and a second close-out of, a study closed out under signature
  (`server/services/cmc/signed-record.ts`; status `COMPLETED`).

Nothing new was added: two helpers beside `headerMeta` in `cmcShared.tsx`, and the two existing render sites use them.

## The defects

1. With the contradictions read failing, the tab's heading said
   `… · 0 contradictions resolved · 0 still open` directly above "Couldn't load contradiction history". "Still open" is
   the figure the export gate refuses on, so a zero there reads as clearance. The same line said
   `0 governed events · 0 sections tracked` when the section list failed.
2. A closed-out study kept "+ Result" and "Close out" live. Each ended in a 409, the close-out after the signer had
   typed their password.

## The change

- `readCount(read, counted, what)` and `chainCount(state, partial, events)` in `cmcShared.tsx`. The count line now
  says `reading contradictions…` / `contradictions not read` / `sections not read` / `audit chain not read` in place
  of a zero, and `at least N governed events` when one section's stream could not be read. The chain's failed state is
  derived in render from the section read, so no frame says "reading" over a read that already failed.
- `StabilityRowActions`: on a `COMPLETED` study, "+ Result" and "Close out" are disabled and say why. Estimate, Trend
  and History are reads and stay open.

Not done, and why: a "Retire" door for a stability study. The server's retire writes lower-case `retired` into a
status vocabulary that is upper-case (`DRAFT`/`ACTIVE`/`PAUSED`/`COMPLETED`/`CANCELLED`). That needs a decision, not
a button.

## Proof

Red first (before the change), then green:

```
npx vitest run client/src/concept2cure/v2/__tests__/cmcAuditCountsHonesty.test.tsx \
               client/src/concept2cure/v2/__tests__/cmcStabilityClosedOut.test.tsx
before:  Tests  6 failed | 3 passed (9)
         expected '0 governed events · 0 sections tracke…' to contain 'contradictions not read'
         /Result/: expected false to be true
after:   Tests  9 passed (9)
```

In the running app, demo programme C2C-201 (2026-11-12, signed in, 1440 px):

```
AUDIT healthy    : 231 governed events · 21 sections tracked · 0 contradictions resolved · 0 still open
AUDIT failed read: 231 governed events · 21 sections tracked · contradictions not read
STUDY row 0 : C2C-201 drug substance — long-term → Result | Close out | History
STUDY row 2 : C2C-201 tablets — accelerated     → Result [disabled] | Close out [disabled] | History
              "This study is closed out under signature, so its results and shelf life are closed to changes"
```

The failed read was produced by answering the contradictions request with a 500 in the browser. The closed-out study
was the accelerated study with its status set to `COMPLETED` in the local database for the walk and set back after.
Screenshots: `audit-counts-contradictions-read-failed.png`, `closed-out-study-row.png`.

Lint: `CmcModule.tsx` 14 warnings before and after; `cmcShared.tsx` 0 and 0.
