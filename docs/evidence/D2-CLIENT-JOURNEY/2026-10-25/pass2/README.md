# D2 — Each feature in its project step (pass 2)

Design: `docs/design/CLIENT_JOURNEY_2026-10-25.md`, "Pass 2". Built on pass 1 (`d97388005`). Observed on the same
local install as pass 1, on the IND project created there through the wizard (FDA, product recorded as a drug, no
documents yet).

## What changed

- A project with no documents opens on **Evidence**, its first step with work to do. A project with documents, or
  one whose document list could not be read, opens on Author as before. A step chosen by a person, AnA or a
  handoff is never overridden.
- Each step says **What to do now** (static guidance about the step, `PJ_LIFECYCLE.now`, with device wording
  where it differs) and offers the **Next step**, so the five steps read as a sequence. Respond has none. A filing
  that builds no sequence gets no Submit sentence about sequences.
- **Author** offers CMC / Module 3 for a US IND whose product is recorded as a drug (the composition boundary,
  `server/services/cmc/composition-scope.ts`). **Submit** offers the IND forms for a US IND. Both screens read the
  open program, so each opens on this project. `isUsInd` moved from `SubmissionCenter.tsx` to
  `programSequence.ts` so the submission and the project read one rule.

## Browser (`*.png`)

| File | What it shows |
| --- | --- |
| `project-opens-on-evidence.png` | The IND project opens on Evidence: what to do now, and Next step: Author. |
| `author-offers-cmc.png` | Author, with CMC / Module 3 beside the editor and protocols. |
| `submit-offers-ind-forms.png` | Submit, with IND forms beside readiness, compile and Submission Center. |
| `ind-forms-open-on-this-project.png` | IND forms opened from there: this project's 1571, 1572 and 3674. |

No page errors.

## Tests

- `red-against-unchanged-project-home.txt`: `projectHomeNextStep.test.tsx` against the source at `d97388005`:
  6 of 10 fail (opening on Evidence, the now line, Next, the device wording, CMC, the IND forms). The other 4
  guard what already held (Author with documents, a failed read decides nothing, a chosen step is kept, an NDA is
  offered neither) and pass on both.
- **The Project home suite was not running.** `before-auth-mock-149-failures.txt`: 23 Project home test files
  failed before rendering — `useDocumentList` reads the session through `useAuth`, which throws without an
  `AuthProvider`, and those files mock neither. They fail identically at `1595d6dc5` (the baseline) and at
  `d97388005`, and `failures-identical-without-pass2.txt` is the same set with and without this change. Each file now
  mocks `useAuth` the way `projectHomeStages.test.tsx` already did.
- `green-summary.txt` (every result in `green-full.txt.gz`): with the mocks, 593 of 598 tests in the 62 files that
  touch Project home, Submission Center or the step definitions pass. One stale expectation, unmasked by the mocks,
  was corrected (`projectHomeDocuments`: the device "coming later" line's wording).
- **Five remain red, unchanged by this work** (they fail identically without the pass 2 source):
  - `filingPathNoDeadEnds.test.tsx` (4): asserts `device-510k` is outside the launch scope; it joined the
    Projects app's surfaces on 2026-10-23 (MDX features of the project). The test's premise needs the owner of
    that decision.
  - `projectDocumentDisposition.test.tsx` (1): "Review removal of Retained search record" is not found.
    Unrelated to the steps; not investigated here.
