# The CMC work area words a refused read by what it is

**Package:** D0 (the rule), adopted in S7's files. **Date:** 2026-11-09. Session
`session_01GJidg5q1KFNfFT2VZyjcqw`.

> The founder, 2026-11-05: "A feature can be not licensed, not relevant to this project, blocked by missing evidence,
> or unavailable to this user. Those are different conditions and should not be collapsed into a generic failure."

## What already exists (RULE 3)

Nothing here is a new rule, a new panel or a new classifier. All three exist:

| Path | What it does |
|---|---|
| `client/src/concept2cure/mdx/hooks/useFetchJson.ts` | `readFailureFor` / `describeReadFailure` — the one classifier |
| `client/src/concept2cure/v2/dataConnect.tsx` | `ErrorState` and `EmptyState tone="error"` take the failed read's `{ status, code }` as `read` plus a `readWhat`, and `readRefusalWords(read, what)` is the same rule for code that is not a panel. `DataState` / `ListState` already carry `status` and `code` |
| `docs/evidence/D0/2026-11-06-refused-read-one-rule/` | The change that put the rule in the shared panel, and handed adoption on: *"one attribute per call site"* |

`CmcModule.tsx` is **the largest holder in the product**: 13 strings in that evidence's
`03-adoption-list.txt`, more than TaskBoard's 17 only because that file is counted differently — it is third on the
list and the first in CMC's lane. This is the adoption, not a second rule.

## What was wrong

Every read-failure state in the CMC work area said *"Couldn't load …"* / *"could not be read"* / *"didn't respond.
Sign in to your tenant and retry."* So a plan without the CMC module, a part outside this release, a role refusal, a
project in another organization and an expired session **all read as an outage**, and each told the user to retry
something a retry cannot change.

## The change — one attribute per call site

Six panels now pass the read that failed:

| Panel | Read | `readWhat` |
|---|---|---|
| the Module 3 board (Overview) | `/api/cmc/module3-board` | the Module 3 board |
| specifications | `/api/cmc/specifications` | this project's specifications |
| stability studies | `/api/cmc/stability-studies` | the stability register |
| batch records | `/api/cmc/batch-records` | this project's batch records |
| process capability | `…/process-capability` | the capability assessment |
| contradiction history | `/api/cmc/module3-os/contradictions/…` | the contradiction history |

Two places are **not panels**, and take the same rule through `readRefusalWords`, which `dataConnect` exports for
exactly this:

- **the export-readiness chip** and its explanatory line. "Export readiness could not be read" over a 403 says the
  export gate failed, when the truth is that the feature is not licensed for this organization;
- **the Overview's own meta line**, which said "The Module 3 board could not be read — nothing below is established"
  beside a panel now saying "not enabled for your organization". A reader seeing both would be told two different
  things about one read.

And `CmcRegisterLinks.tsx`, a CMC surface of its own, was found during this work rendering the same failure with its
own words, and adopts the rule too. Its sentence — *"Register saves remain recorded; dossier linkage is unknown until
this check succeeds"* — is kept for a failure to answer, because that distinction is the whole purpose of the panel.

## Two panels deliberately unchanged, and why

`meta.sectionsUnreadable` and `meta.portfolioUnreadable` come back on a **200** board: the read succeeded, and the
server reported that one of *its* reads failed. There is no refused HTTP read to classify. The same holds for the
audit-chain panel, whose message is composed from N per-section failures rather than one read. They keep their own
words, and the suite pins that they still say *failed read* rather than *empty register*.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `01-red.txt` | the change not yet made | **25 of 31 cases red.** The six that passed are the 500s (already correct) and the two deliberately-unchanged panels |
| `03-mutation-panels-drop-the-read.txt` | all six panels stop passing `read` — **the state as shipped** | 36 of 47 red |
| `04-mutation-chip-and-line-not-classified.txt` | the chip and the Overview meta line keep their failed-read words | 7 red: all six board refusals (the line contradicts the panel) and the chip's own case |
| `06-mutation-sub-read-report-ignored.txt` | the board's report of its own failed sub-read is ignored | the unchanged-panel case red — an unreadable section store would have drawn as *"No Module 3 sections yet"* |
| `02-green.txt` | — | 47 of 47 with every mutation reverted |

**One mutation did not go red, and it is recorded rather than dropped**
(`05-mutation-200-board-classified-is-a-noop.txt`): passing `read={board}` to the `sectionsUnreadable` panel leaves
all 47 green, because `readRefusalWords` returns null for a 200 and a *refused* board sets no `meta`, so that panel
never renders beside one. It is a no-op, not a defect — but it is also why the two panels are left alone rather than
given an attribute that reads as if it did something.

## Found, not fixed here: these panels have no retry control

Only the register-link panel passes `retry`. The rest tell the reader to *"sign in to your tenant and retry"* in
prose and offer **no control** — so the one refusal a retry can change (`503 VERIFICATION_UNAVAILABLE`) has no retry
to keep, and a 500 has none either. UI standards §8 says a failure always offers a way out. A real retry needs a
refetch on `DataState`, which `dataConnect.tsx` does not expose; that file is D0's shared primitive and the
coordinating session reviews changes to it, so this is **reported to D0's owner rather than taken here**. The suite
asserts the retry only where a control exists, so the gap is visible rather than locked in.

## Two fixture facts worth keeping

Both found by this suite, both about guarded reads rather than the product:

- `CmcRegisterLinks`' read is guarded by `isLinkRead`, and its panel renders whenever that read fails — so a test
  that answers it with a shapeless 200 puts a second failed-read panel on the page beside the one under test.
- The capability read is guarded by `isCapabilityRead` and renders on the Batch records tab, with the same effect.

Both are answered with their real shape by default in the suite, and each panel's own cases override that.

## Gates

`tsc --noEmit` 0 errors. ESLint: 13 warnings on `CmcModule.tsx` + `CmcRegisterLinks.tsx` before and after — no file
gained one. New suite: `client/src/concept2cure/v2/__tests__/cmcRefusalNotFailedRead.test.tsx`, 47 cases.

## Still open in the adoption list

`CmcModule.tsx`'s remaining "could not be read" strings are the two 200-board sub-read panels, the audit chain, the
earlier-question-file line and the per-section chain sentence — each a composed report rather than one read's own
failure. The other owners on `03-adoption-list.txt` (TaskBoard, ProjectHome, MasterLicensing, BiopharmaSpecialty,
DocumentWorkbench, CommunicationCenter, SubmissionCenter, Pyramid, AdminAccess) are unchanged by this slice.
