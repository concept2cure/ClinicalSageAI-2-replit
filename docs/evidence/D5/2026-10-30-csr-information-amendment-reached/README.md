# D5: IND forms can file a CSR as an information amendment, and its letter says so (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane (submission). Found by the CSR path
sweep's placement finder and verified by hand. The sweep's verifiers did not
run: they failed on a billing error.

This corrects this lane's own overclaim. On 2026-10-29, `b9dbaeff4` ("an
information amendment says what it contains") taught the planner and the letter,
and `docs/design/CSR_PATH_REVIEW_2026-10-29.md` recorded the amendment as
**Fixed**. Only the service changed. No screen could reach it.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The planner | `server/services/ind-lifecycle/ind-amendment-service.ts` `planIndAmendment` (`b9dbaeff4`) | Places a `clinical_study_report` at m5.3.5.1 as an information amendment, and returns `informationAmendmentTitles` ("Information Amendment: Clinical", 21 CFR 312.31(b)) | — |
| The letter | `ind-cover-letter-service.ts` `informationAmendmentLabel` | Prints those titles, or names the 312.31(b) gap | It is given titles only when the caller states them |
| The letter's type | `server/routes/ind-lifecycle/documents.routes.ts` `withRecordedSubmissionType` | The stated type, else `submissions.lifecycle_stage` | The stage names only original and annual, and nothing advances it. The screen states no type, so every amendment's letter carried a `submissionType` gap |
| The filing | `ind-lifecycle-persistence.ts` | Writes the sequence and its leaves, and returns `leavesAwaitingDocument` | — |
| The card | `client/src/concept2cure/v2/surfaces/IndLifecycle.tsx` (IND forms, the `ind-checklist` launch surface, P-32) | Plans and files an amendment, and assembles the cover letter | It offered no CSR category, so a CSR could be planned only at m2.5 or m1.2. The plan view never showed the 312.31(b) identification. A filing whose leaves await their documents read "3 leaves placed". The letter card could not name the amendment |
| Placing documents and attaching revisions | Submission Center Builder (`SubmissionSeqWorkspaces.tsx`), `upsertLeaf` with an earlier-sequence `parentLeafId` (`assertParentLeafInScope`) | Places a document on a leaf, and links a revision to the leaf it revises | — (the card now points there) |

## What changed

- **The card offers `clinical_study_report`.** A CSR now plans at
  m5.3.5.1 as an information amendment, with the planner's own warning.
- **The plan view shows the identification the planner gives:** "Identified
  as: Information Amendment: Clinical (21 CFR 312.31(b))". Protocol
  amendments show their 312.30(d) title the same way.
- **A filing says what it wrote** (`filedSentence`):
  - "n leaves placed" only when every leaf has its document;
  - otherwise it names the leaves that await a document and says to place each
    in Submission Center before validation;
  - it also says when a revision, append or withdrawal was filed with no
    earlier leaf to act on.
- **The cover-letter card names the filed sequence the letter accompanies,
  as entered.** The server reads that sequence, tenant-scoped, and its stored
  leaves (`informationAmendmentFromLeaves`). When every content leaf is
  information-class, the letter is an information amendment and carries its
  312.31(b) titles: "Information Amendment: Clinical" for a CSR.
  - Otherwise the type stays a gap, not a guess: a protocol document (its
    312.30 title depends on what happened to the protocol, which a leaf does
    not record), a document type the planner did not set, or no contents.
  - A sequence this submission has not filed is 404, and a malformed number
    is 400.
  - A stated type still wins.
- `informationAmendmentFromLeaves` derives each leaf's class from the
  planner's own category table, so there is one mapping.

## Still open

- **The prior leaf GUID.** The card asks for one, and the planner carries it.
  But nothing stores leaf GUIDs (`submission_leaves.leaf_guid` has no
  writer), so it cannot be resolved to the leaf it names, and the filing
  drops it. The filing now says so, and points to Submission Center, where a
  revision is attached by leaf. Resolving the GUID, or removing the field, is
  the next step.
- **Form 1571 item 11** (the contents box) is still not in its field
  registry, which needs the official form (`www.fda.gov` is outside this
  environment's allowed domains).

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed code) | Green (`green.txt`) |
|---|---|---|
| `cover-letter-identifies-the-filed-amendment.test.ts` (new): a CSR amendment's letter | `submissionType` null, with the gap | "Information Amendment: Clinical", no type gap |
| …a sequence not filed in this submission / a malformed number | 200 | 404 / 400 naming it |
| …a protocol amendment; a stated type (controls) | pass | pass |
| `indLifecycleCsrInformationAmendment.test.tsx` (new): the CSR category | not offered, so not sent | sent; the identification shown |
| …a filing whose leaves await documents | "3 leaves placed" | names the 3 and where to place them |
| …a revision with no leaf to revise | not said | said |
| …the letter names its sequence | no such field | sent |
| Every IND forms and IND lifecycle suite, client and server (82 files) | — | 807/807 |
| `dispatch-verdict-parity.pglite.test.ts`, `routes.contract.integration.test.ts` | 11 fail on the committed code | the same 11 fail. Cause: their database has no `organizations` table, which the dispatch gate's legal-readiness check has read since `5ebfcfd2c` (2026-10-18). Fixed in the next change |
| ESLint | — | no file gained a warning |

## Disclosed (files another lane changed in the last 24 hours)

- `server/routes/ind-lifecycle/documents.routes.ts`: another session retired
  the briefing-book assembler from it (`5ab665f63`, 2026-10-30 00:42). This
  change adds imports and a function beside `withRecordedSubmissionType`.
- `IndLifecycle.tsx`, `ind-amendment-service.ts`: no other lane changed them
  in the last 24 hours. Codex is active on the branch today in Vault, STF
  packaging and project settings, none of these files.
- This change adds a row to `docs/work-orders/README.md` and corrects one row
  of `docs/design/CSR_PATH_REVIEW_2026-10-29.md`.
