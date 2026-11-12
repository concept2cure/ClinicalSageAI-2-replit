# Two of this lane's sentences named a remedy nobody could take

Plan package **F1**. Completes
`server/services/qms/document-approval-signature.ts` and
`client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx`. Launch row D5.

Both sentences were written by this lane in October (P-29.2 increment 2, and
D-29-C). Both told the reader to do something the product refuses. Found on
2026-11-12 while re-reading every open item of the lane against trunk.

## What already exists (RULE 3)

| Path | What it does | What it does not |
|---|---|---|
| `server/services/authoring/authoring-refile-saved-section.ts`, `PATCH /api/authoring/sections/:id` with `filingOnly: true` (another lane, `848fa68e3`, 2026-10-23) | Re-files a saved section without a content change, with a reason, audited. | Run for a QMS controlled document that is not a draft (`assertCurrentQmsWrite`), or for a sealed document (`reserveWritableSection`). |
| `client/src/concept2cure/v2/editor/AuthoringRefileSavedText.tsx` | The "Re-file saved text" control in the editor bar. | — |
| `server/services/c2c/filing-section-target.ts`: `divergedSectionLabel`, `filedCopyDivergedSentence` | The shared way a refusal names a diverged node, and the device exits' sentence. | — |
| `server/routes/authoring.router.ts` `filingDivergedRefusal` | The three authoring seals already name Re-file saved text. | Still names its nodes inline rather than through `divergedSectionLabel` (that file is in other sessions' hands today; left alone). |
| `server/services/qms/qms-review-route.ts` `returnQmsDocument`, `POST /qms/documents/:id/return`, and the "Return for revision" button in `client/src/concept2cure/quality/QmsReviewRoute.tsx` | Returns a document under review to draft, with a reason, governed. | — |
| `server/routes/authoring.router.ts` `filingApprovalReply` | Sends `filingApproval.reason` when the filing is locked or submitted. | — (the client dropped it) |

Nothing new was needed. Both repairs are words, plus one field the client
stopped throwing away.

## 1. The QMS approval's refusal

`refuseIfFilingDiverged` said:

> … Re-file it from the editor: open that section, make any edit and save, which
> rewrites the filed copy. Then approve again. Nothing was signed.

An approval is given to a document **under review**. A controlled document
under review refuses every authoring write, and the re-file with it:
`qmsAuthoringRefusal` answers `QMS_DOCUMENT_CONTROLLED` for any register status
but `draft`. So the remedy could not be performed — on the day it shipped, not
only now. This was not read off the code alone: a test asserts the refusal at
`in_review` and its absence once the register entry is back at `draft`, and it
passes against the code as it was.

It now says:

> Not approved. The filed copy of section 2.5.1 (filed at 2.5) is not the
> document's text. Approving seals the text for filing, so the signature would
> attest to text the submission does not contain. A controlled document under
> review cannot be changed or re-filed, so return it for revision in the Quality
> register first. Then open that section in the editor and choose Re-file saved
> text, send the document for review, and approve again. Nothing was signed.

Each step is an act that exists, in the order they have to happen. The sections
are named through the shared `divergedSectionLabel`, each once (the old inline
copy named a section once per diverged node).

Not confirmed, and said so: that the approver who meets this refusal is the
person the Quality screen offers "Return for revision" to. The button is shown
by standing (`can.returnIt`); the sentence names the act, not who performs it.

## 2. The note after an approval

`notApprovedNote` said:

> The approval did not cover section 2.5: its filed text is not the text you
> signed, so it was left unapproved in the filing. Open it in the editor and save
> to re-file, then approve again.

Neither half could be true where it is shown:

- It appears **after** the approval, which froze the document. Nothing in it
  can be saved or re-filed.
- A filed copy that differs from the signed text is refused **before** the
  signature (P-29.2, `FILING_DIVERGED`). So "not the text you signed" is not
  how a section comes to be left behind; an unfiled section is, or a filing
  that is locked or submitted — and for that last case the server already
  sends its reason, which the transport dropped.

It now says:

> The approval did not reach section 2.5 in the filing. [the server's reason,
> when it gave one] It is not approved there, and will not count as finalized
> when the submission is checked for dispatch. This document is now approved and
> frozen, so nothing in it can be saved or re-filed.

It names no remedy, because this document has none to offer. That is the open
question below, and saying so plainly is better than a step that fails.

## For the founder: a sealed document can leave filing sections behind for good

After an approval seals a non-QMS document, a filing section it left unapproved
has no repair path: the document cannot be saved or re-filed (sealed), the
filing's own save is refused while a bound document is sealed
(`checkFilingWritable`), there is no unfreeze, and there is no new-version
route for an authoring document outside Quality. P-40 gave a QMS document its
way forward (a controlled revision); nothing does the same here.

Two ways to close it, neither a session's to choose under RULE 6:

1. **Refuse the approval** while a bound section is unfiled *and could be
   filed* (its filing row exists and is empty) — the approver is sent to
   Re-file saved text before signing, when it still works. This narrows P-29.2,
   which reports an unfiled section and seals anyway because an unfiled node can
   also be one the filing has no row for, which no one can file.
2. **A revision of a sealed authoring document**, as Quality has. A new act.

My recommendation is the first: it prevents the dead end with a control that
already exists, and adds nothing.

## Verification

- QMS: 8 cases in `qms-approval-checks-the-filing.pglite.test.ts` (3 new). Red
  `2 failed | 6 passed`.
- Client: 14 cases in `esignNotApprovedDisclosure.test.ts`. Red
  `5 failed | 9 passed`. Three assertions that pinned the old sentence are
  replaced; they pinned words this lane wrote and got wrong.
- Around them: the nine QMS suites and the 44 client suites that touch the
  filing bar pass (63 files, 804 tests; the 44 again after a restructure, 572).
- 13 of 13 mutants killed (`mutants.txt`).

## Hot-file disclosure

`AuthoringFilingBar.tsx` was changed on 2026-11-12 by another session
(`8d5537908`, P-102) and is not held in `COORDINATION.md`. This change touches
only this lane's own transport read, state and `notApprovedNote`, and leaves
the file with no new lint warning (an intermediate version added two; it was
restructured before commit).
