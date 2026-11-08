# D0: one rule for a refused read, in the panel every screen shares

**`Plan: D0`** (`client/src/concept2cure/v2/dataConnect.tsx`), with the two editor callers converged under `Plan:
F1`. Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-06.

> The founder, 2026-11-05: "A feature can be not licensed, not relevant to this project, blocked by missing
> evidence, or unavailable to this user. Those are different conditions and should not be collapsed into a generic
> failure."

## The defect

117 screens in `client/src/concept2cure/v2/surfaces` and `editor` render a failed read as "X could not be read",
with **Try again**, whatever the server answered (`03-adoption-list.txt`). That includes:

- a plan without the feature (`MODULE_NOT_LICENSED`);
- a part not in this release (`LAUNCH_SCOPE`);
- a role;
- an unconfirmed organization;
- a record not in this organization;
- an expired session.

None of those is changed by a retry. The Vault (`3c84ddc6ac`), the Data Room panel (`b61a8b345`) and the editor's
citation catalogue (`f0809d977`) were each fixed with a helper of their own. That repeats one rule three times, and
leaves 117 screens without it.

## What already exists (RULE 3)

- **The classifier:** `readFailureFor` and `describeReadFailure` in `client/src/concept2cure/mdx/hooks/useFetchJson.ts`.
- **The read:** `DataState.status` and `.code` in `dataConnect.tsx`, carried on every v2 read.
- **The one failure panel:** `ErrorState`. `EmptyState tone="error"` already delegates to it, which is how the 139
  error call sites were once converged "without touching any of them" (`dataConnect.tsx`'s own header).

## The change

- `ErrorState` and `EmptyState tone="error"` take an optional `read` (the failed read's `{ status, code }`) and
  `readWhat` ("the data room").
- When the read was refused, the panel shows the classifier's title and words in place of the caller's, and offers no
  retry. An unavailable ownership check keeps its retry: it is the one refusal a retry can change.
- A failure to answer (5xx, no response), or no `read` given, keeps the caller's words and retry. So the change is
  opt-in, and a call site that passes nothing is untouched.
- `readRefusalWords(read, what)` is the rule, exported for code that is not a panel.
- **Converged (zero duplication, `Plan: F1`):** `DataRoomSourcesPanel.tsx` drops its own helper and passes
  `read={state}`. `useProjectSourceCatalog.ts` calls `readRefusalWords`.
- **Not converged:** the Vault's `vaultReadFailure` is in files the Vault parity session holds; handed on.

## Evidence

- `01-red.txt`: 13 new cases fail before the change (six refusals on each panel, and the ownership check). The three
  failure cases already pass.
- `02-green.txt`: `errorState.test.tsx`, 33 of 33.
- The panels, the Data Room and the editor catalogue suites: 127 of 127. Typecheck clean; lint at trunk's counts.
- **Running app** (`walk-data-room.json`, `screenshots/`). The Data Room walk of 2026-11-05, run again on the shared
  rule at 1440 and 390 wide:
  - not licensed: no retry;
  - not in this release: no retry;
  - a 500: "The data room could not be read", with **Try again**.

## Handed on: adopt `read={state} readWhat="…"`, one attribute per call site

- **Every owner in `03-adoption-list.txt`.** Largest counts:
  - TaskBoard (D6);
  - ProjectHome (D3/S1);
  - CmcModule (D5/S7);
  - MasterLicensing;
  - BiopharmaSpecialty;
  - DocumentWorkbench (D4);
  - CommunicationCenter (D6/S10);
  - SubmissionCenter (D7/S5).
- **ProjectHome, seen live.** `screenshots/390-out-of-release.png` shows the project page's own "Data room" section
  answer the same refused read with "couldn't load this project's sources — the list below is incomplete"
  (`ProjectHome.tsx:507`). Two sessions edit that file now, so it is not changed here.
- **The Vault parity session:** `vaultReadFailure` in `Vault.tsx` can call `readRefusalWords`.
