# The training reader and the review route are the product's drawer (C16, C17, 2026-11-10)

Package **D7**, sweep items C16 and C17. Walking them found two defects in shipped behaviour. They are repaired in a
separate `Plan: F1` commit, and their evidence is here too.

- **C16** (dialogs-2, the reader part of styles-dialogs, the styles-accent focus ring).
  - "Read and acknowledge" was a 56rem box on an opaque `--bg-200` overlay at z 100. It hid the sidebar and the
    conversation.
  - It had its own Close button, button reskins, and a 2px orange focus ring at 2.96:1.
  - "Acknowledge this revision" sat at the end of the text, below however long the procedure ran.
- **C17** (dialogs-5, dialogs-9, the `de-sheet` part of styles-dialogs, the Sheet half of dialogs-11).
  - The review route's sheets were the bottom-sheet variant, with a "Review route" eyebrow, and were not registered as
    a ceremony.
  - Reassign was Quality's own copy of the shared reassign sheet, and its candidates read had no "Read it again".
  - Remind and Reassign on the member lines were orange `sp-ask` text.

## What already exists

- **`DialogPanel`** (`client/src/concept2cure/quality/ControlledDocumentDialogs.tsx`) is the product's drawer for
  Quality since C15, and it registers the ceremony (`v2/ceremony.ts`).
- **`RouteReassignSheet`** (`client/src/concept2cure/v2/reviewRoute/RouteReassignSheet.tsx`) is the one reassign
  sheet. The Vault and the Authoring document already use it.
  - It reads the subject's candidates `?for=reassign`, lists only those the route admits, and says why the others
    are not offered.
  - It asks for the reason and posts through the subject's own act.
- **`QmsReviewRoute.tsx`'s `Sheet`** is the shell of the route form, the route panel and its acts.
- **`reassignQmsMember`** (`quality/qmsReviewRoute.ts`) is the reassign write, unchanged.
- **The rate limiter's record-read bucket** is `DOCUMENT_METADATA_READS` in `server/middleware/redisRateLimiter.ts`.
  It already holds the authoring document's `review-route` and `route-candidates` reads, added the same day after the
  CSR walk.

Nothing new: no screen, route, table or file.

## What changed

| | Before | After |
|---|---|---|
| The reader's shell | its own overlay and box | `DialogPanel`. The title is "Read and acknowledge" (or "Edit controlled text"). The document, revision and status are the header's line. Close is the header's. The footer holds Edit controlled text / Reload record / Back to document, and **Acknowledge this revision** as the primary action, so it stays in view below a procedure of any length. The declaration's checkbox and notes stay with the text. |
| The procedure | the sans body | the reading serif (`var(--font-serif)`). It stays plain `pre-wrap` text, because that text is bound to its digest. |
| Focus | Quality's 2px orange ring | the product's ring (`--accent-200`) |
| The route's sheets | the bottom-sheet variant (`de-sheet`) with a "Review route" eyebrow, unregistered | the drawer, with no eyebrow, registered as a ceremony |
| Reassign | Quality's own `ReassignDialog`, with no retry for a failed read | the shared `RouteReassignSheet`, as-is: what the reassignment keeps and records, who may take it over and why others are not, the reason, and "Read it again". The `reassign` purpose of Quality's candidates hook is gone. |
| Remind, Reassign | orange `sp-ask` text | `btn ghost small` |
| CSS | `.qms-training-overlay`, `-dialog`, `-head`, `-actions`, the reskins and the ring, their phone rules | deleted. The receipt, declaration and successor rules stay. The ramp sheet is regenerated. |
| Ratchet | `de-sheet` 5 | 4 |

**Found walking, repaired as F1** (separate commit, `Plan: F1`):

| | Before | After |
|---|---|---|
| `GET /api/mdx/qms/documents/:id/route-candidates` and `…/review-route` | counted as document content, 20 a minute. An author wrote the procedure in the editor, sent it for review and opened Reassign within the minute. The candidates read answered **429**, and the sheet said who may take it over could not be read. | counted as record reads (`document_metadata`), as the authoring document's same two reads are. A QMS document's route acts and writes stay in `documents`. |
| The people picker with no one to offer | `No one matches “”.`, as if a search had found nobody | **"No one can be chosen."** A search that finds nobody still says "No one matches “…”". |

## Tests

- `PersonalTrainingReader.test.tsx`: the reader is `.de` in `.de-bd`. The header line names the document, revision
  and status. The text is in the body. "Acknowledge this revision" is in `.de-f`, and Close is `.de-x`.
- `qmsReviewRoute.test.tsx`:
  - the route panel is the drawer with no eyebrow, and is a ceremony;
  - Remind and Reassign are `btn ghost small`;
  - Reassign opens the shared sheet, whose failed candidates read offers "Read it again";
  - the reassignment posts `{ taskId, assigneeId, reason }` to `…/review-route/reassign`.
- `foundationsRetiredRatchet.test.ts`: `de-sheet` is at 4.
- `redisRateLimiter-vault-reads-and-batch-upload.test.ts` (F1): a QMS document's `review-route` and
  `route-candidates` reads are `document_metadata`. Its reassign, its re-send, its PATCH and its versions stay
  `documents`.
- `vaultReviewRoute.test.tsx` (F1): with no options the picker says "No one can be chosen."; a search that finds no
  one still says "No one matches".

`red.txt` has these five cases failing before the change. `green.txt` covers Quality's suites, the ratchet, AnA's
wave-4 and wave-6, the Vault route, the leave guard and the limiter: 38 files and 510 tests. The typecheck is clean.
These gates pass:

- `ci:undefined-css-classes`;
- `ci:class-vocabulary`;
- `ci:check-css-selector-shadowing`;
- `ci:surface-text-ramp`.

## Walked in the running app

`w23-reader-route.cjs` (`shots/w23-reader-route.log.json`) recorded no page errors.

- **The reader** (as the approver; `shots/w23-reader-1440.png`).
  - QS-SOP-001 opened from "My acknowledgement" as `.de` at 1000 / 440px on the 0.24 scrim at z 120.
  - The rail is still visible, and there is no eyebrow.
  - The procedure is set in `Lora, ui-serif, Georgia, …`.
  - The footer is "Reload record", then "Acknowledge this revision", disabled until the declaration was ticked and
    enabled after.
  - The keyboard focus ring on the declaration is `rgb(173, 81, 50)`, which is `--accent-200` (`#ad5132`).
- **The route** (as the author). Setup, through the product:
  1. `w23a-designate.cjs`: the walk organisation had no designated QMS approver and no member holding the Approver
     role, so no route could name one. The administrator designated Theo Trainee through the membership route, with
     a reason. Their own designation was refused, "Your own QMS approver designation is changed by another
     administrator", which is correct.
  2. A new SOP was created.
  3. Its procedure was written and saved, with a reason for change, in the one editor. Sending it for review without
     saved text had been refused: "The authored document contains no saved text", which is correct.
  4. It was sent for review naming Theo.

  Then:
  - The route form and the route panel are `.de-bd` drawers with no eyebrow (`shots/w23-route-panel-1440.png`).
  - The member lines' Remind and Reassign are `btn ghost small` in `rgb(61, 61, 58)`, `--text-200`, not orange.
  - Reassign opened the shared sheet (`shots/w23-reassign-1440.png`). Before the F1 repair its candidates read
    answered 429. After it, the read succeeded.
  - Nobody else is a designated approver, so the sheet says "No one can be chosen." (before the picker repair it said
    `No one matches “”.`) and "3 members are not offered, and why".
  - It was cancelled; nothing was reassigned.
- The editor's project-sources read answered 409, then 503, in this environment. That read is the editor's (D1), not
  Quality's, and is noted for its owner.

Run the walks from this folder: `NODE_PATH=$(npm root -g) node w23-reader-route.cjs`, after the one-time
`DESIGNATE=<member id> … node w23a-designate.cjs`. They need `WALK_PASSWORD`, a running server and the walk project of
`../2026-11-10-records-table/`.

## Not done here, and why

- **The shared reassign sheet keeps its own `de-sheet` and "Review route" eyebrow**. It is v2's component, used as-is
  by the plan; the Vault and Authoring share it. Converging it is D0's.
- **"Edit controlled text" inside the reader (dialogs-3)** waits on a founder decision, as the sweep plan records. It
  was not walked at the drawer's width: no document in the walk organisation is unbound and editable there.
- **The shot behind the reassign sheet shows the SOP register's head crowded.** The title, the sentence, the filter
  and "New controlled document" wrap at 1440. That is the next commit.
