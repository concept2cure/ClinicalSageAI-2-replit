# A refused read in Quality is said as a refusal; only a failure offers Try again (2026-11-10)

Package **D7**. The Quality sweep's commit **C4**: findings `sop-refused-read`, `records-3`, the hook-backed half of
`dialogs-6`, and the summary and library arms of `styles-honest-notice`, each confirmed by an independent skeptic.
It adopts D0's one rule for a refused read (`605f9deb5`, `docs/evidence/D0/2026-11-06-refused-read-one-rule/`): the
shared `ErrorState` / `EmptyState tone="error"` take the failed read (`read`) and what was not read (`readWhat`).

## What already exists (RULE 3), and what changed

| Path | Before | After |
|---|---|---|
| `hooks.ts` (`useSopRegister`, `useSopTemplates`, `useReviewDue`, `useTrainingCompliance`, `useTrainingExpiring`, `useCheckedRead` and through it `useJobRoles`, `useTrainingAssignments`), `changeHooks.ts` (`useChangeRegister`, `useChangeSummary`) | Returned the error text only; `useFetchJson`'s `failure` (status and code) was dropped | Each returns `failure`. `useSopTemplates` also returns `refresh`. |
| Every Quality failure panel: the register, the review schedule, training, expiry, job roles, who must train, the change log, the record registers, a CAPA's action items | A read refused because the module is not licensed, the area is not in this release, or the reader's role cannot see it was shown as "could not be read" with a Try again that could never change the answer | `read={…failure}` with a singular `readWhat` ("the controlled-document register", "the review schedule", "the training record", "the training expiry list", "the job roles list", "who must train", "the change log", "the CAPA register", "this CAPA's action list", "the Quality system library"). A refusal is said in the classifier's words with no retry. A failure to answer keeps its words and its Try again. |
| `QmsRecords.tsx` | "The capa register could not be read" (the title lower-cased whole). The figure line also said "The register could not be read." under the same failure. | "The CAPA register could not be read" (`inSentence`, moved from `App.tsx` into `qmsRegisterKit.tsx` so both use one). The figure line is absent while the register is unread or failed: the section's own line says it, once. |
| `SopRegister.tsx`, `ChangeControl.tsx` (the library) | A failed Quality system library read was only a `title` on a disabled "New controlled document", or a grey line | A failure panel under the section head, with Try again (`sop-templates-failed`), or the refusal's words |
| `ChangeControl.tsx` (the totals) | A failed summary read said "Change-log totals appear once the change register loads.", as if it were pending | "The change-log totals could not be read." |

## Tests

Red first (`red.txt`):
- the CAPA register refused by this release: its words, no Try again, no figure line; and a 500 that keeps its Try
  again;
- the SOP register refused for the reader's role.

Green (`green.txt`): 32 files, 352 tests. Two suites' mocks now keep the real module underneath (`queryClient` for the
shared panel's redaction, `useFetchJson` for its classifier). The partial `queryClient` mock in
`ChangeControlApproval.test.tsx` threw once the library failure rendered through the shared panel. The ten other suites
that render Quality pass (137).

## The running app

Re-walked (`../2026-11-10-outcomes-and-empties/w8-states.cjs`) at 1440 and 390: no regressions, and no API or page
errors. On this local stack every Quality read answers. A refusal here would need a role or licence the walk accounts
do not have, so the refusal itself is proven by the tests, not the walk.
