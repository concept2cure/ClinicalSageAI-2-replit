# Two copy-honesty gates green again (F1, 2026-11-09)

**The finding.** CI's Lint job has been red on trunk. Its guardrails were re-run one by one on today's head. Two of
the seven that still failed are copy-honesty gates that run in CI but not in pre-push, so they could regress without
anyone noticing.

| Gate | Finding |
|---|---|
| `ci:empty-state-honesty` | `ProtocolDevPanes.tsx:320`, "No trend signal over the window the trend engine reads.", chosen by `signals.length === 0` |
| `ci:empty-state-honesty` | `TaskBoard.tsx:303`, a rule's actions rendered "no action" when it has none |
| `ci:internals-in-copy` | `SubmissionSeqWorkspaces.tsx:751`, the table name `coauthor_documents` in the source of a screen |

The full red output is in `empty-state-honesty-red.txt` and `internals-in-copy-red.txt`.

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/assessmentState.ts`.** It is the one rule for clearance: an empty set reassures only
  when there is positive evidence that the assessment ran. The gate names it as the fix.
- **`shared/types/submission-api.ts`.** `DeliverableDocumentTable` is the closed set of tables a leaf can name.
- **The gates' occurrence baselines.** Each gate has one. A reasoned false positive could be added there, but fixing
  the code is the better answer, and no baseline changed.

## The fixes

**The trend line.**
- The line is reached only after the loading read and the failed read have returned.
- So the data being there is the evidence that the engine ran. It is now passed as `assessmentRan` to
  `assessmentState`, and the line shows only in `assessed-clear`.
- The wording is unchanged.

**The rule's actions.** The text describes configuration, not a clearance ("Task completed → no action"). It now
reads "none set".

**The table name.**
- It is a request payload value, not copy. It is now named once in `shared/types/submission-api.ts` as
  `FILING_COPY_DOCUMENT_TABLE`, checked against `DeliverableDocumentTable` with `satisfies`.
- The screen sends that constant, so no table name is spelled in a screen's source.
- The literal had been there since `07fbf47d4a` (2026-10-20). CI has been red on it since then.

## Proof

- **Both gates are green** (`green.txt`). The baselines are unchanged: empty-state still holds its one reasoned
  Nonclinical entry, and internals-in-copy holds none.
- **Suites:**
  - 22 suites for the protocol and task screens: 190 of 190 pass.
  - 17 suites for the Submission Center sequence screen: 178 of 178 pass.
- **ESLint:** warning counts are equal to HEAD's on all four files.

## The other five, routed to their owners (not fixed here)

| Gate | Finding | Owner |
|---|---|---|
| `ci:launch-scope-api` | `/api/project-hierarchy/:p/children` is unmapped | S12 |
| `ci:tenant-isolation:no-regression` | two test fixtures | the AnA lane and RIM |
| `test:proof-tier` | the CMC specification tenant-scope contract | CMC |
| `audit-requestdb-coverage` | `server/routes/csr-jobs-narratives.ts` is on the shared pool | the CSR lane |
| `ci:surface-text-ramp` | the ramp was stale | fixed in `a60460fccf` (D0) |
