# The Overview's empty portfolio names what this release composes

Plan S7. Completes `client/src/concept2cure/v2/surfaces/CmcModule.tsx` (`CmOverview`, Portfolio).

## What already exists

- The Portfolio section of the CMC Overview, with three states: a failed read (`cmc-portfolio-unreadable`), an empty
  portfolio, and the submissions table (Module 3, preparedness, questions overdue).
- The composition boundary (`server/services/cmc/composition-scope.ts`, decision P-28): small-molecule Module 3 for a
  US IND; NDA, ANDA, BLA, MAA, Japan CTN and J-NDA are refused by name.

## The defect

The empty state said "Your regulatory submissions (BLA / MAA / NDA / J-NDA) appear here…": four application types,
every one of which the release refuses to compose, and not the one it does.

## The change

Copy only: "Your submissions appear here with their Module 3 state, preparedness index and overdue agency questions.
This release composes Module 3 for a small-molecule US IND." The wording matches the table's own columns.

## Proof

Red first (`cmcOverviewCompleteness.test.tsx`, "an empty portfolio names what this release composes": the new
sentence not found), then the file's 31 cases pass. Lint: `CmcModule.tsx` 14 warnings before and after.
Not walked in the running app: the demo account's portfolio is not empty, so the state does not render there.
