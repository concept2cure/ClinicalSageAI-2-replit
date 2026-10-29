# D5: an information amendment says what it contains (2026-10-29)

Session `…01E8btkB`. Found by the submission reviewer in the CSR path review for
the LMN-201 / RePreve prospect: a CSR filed to an IND is an information
amendment, and its letter did not say "Clinical".

## What already exists

Searched `information_amendment`, `312.31`, `protocolAmendmentTitles`,
`ContentCategory`, `clinical_summary`, `1571` and `FDA_1571` in `server/`,
`shared/` and `client/src`.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The amendment planner | `server/services/ind-lifecycle/ind-amendment-service.ts` `planIndAmendment` | Places each changed document, and derives the 21 CFR 312.30(d) protocol-amendment titles from the leaves | No category for a clinical study report, and no 312.31(b) identification for an information amendment |
| The cover letter | `server/services/ind-lifecycle/ind-cover-letter-service.ts` | Titles a protocol amendment by its 312.30(d) titles, or names the gap | Titled every information amendment "Information Amendment", with no gap |
| Form 1571 | `server/config/FDAFormsRegistry.ts` `FDA_1571` (`version: 'unverified'`) | Fills sponsor, product, phase and signatory fields | Has no submission-contents box (item 11). **Not changed here:** filling it needs the official form's field names, and the form is not readable from this environment (fda.gov is not reachable). A field invented from memory would be worse than none |

21 CFR 312.31(b): an information amendment is required "to bear prominent
identification of its contents (e.g., 'Information Amendment: Chemistry,
Manufacturing, and Control', 'Information Amendment: Pharmacology-Toxicology',
'Information Amendment: Clinical')".

## What changed

- **The planner.**
  - A `clinical_study_report` category: an information amendment, planned at
    `m5.3.5.1`. It warns that a report of another study type files under its
    own Module 5.3 heading.
  - The plan returns `informationAmendmentTitles`. A CMC leaf gives the
    Chemistry, Manufacturing, and Control title; a pharmacology-toxicology leaf
    gives the Pharmacology-Toxicology title; a clinical summary or a CSR gives
    the Clinical title.
- **The cover letter.** It takes `informationAmendmentTitles` and accepts only
  312.31(b)'s three titles. With none, it names the 312.31(b) gap, as it
  already does for a protocol amendment under 312.30(d).

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/services/ind-lifecycle/__tests__/ind-information-amendment-identified.test.ts` (new) | `red.txt`: 4 of 4 fail at HEAD | `green.txt`: 60 files, 620/620, with every IND lifecycle suite and the IND launch-claim suite |
