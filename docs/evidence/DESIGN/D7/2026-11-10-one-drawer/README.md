# Quality's dialogs are the product's one drawer (C15, 2026-11-10)

Package **D7**, sweep item C15. It covers these findings:

- dialogs-1 and sop-dialogs;
- the page-dialog part of styles-dialogs, and the dialog part of dialogs-4;
- the thrown-read half of dialogs-6;
- dialogs-7 and dialogs-11;
- product-target-dialog-own-chrome.

Six of Quality's dialogs had their own chrome:

- New controlled document;
- Record periodic review;
- Job roles;
- Who must train;
- Version history;
- a notification's controlled document.

Each one was a centred box on a dark overlay at z 200, with Quality's own buttons, field styles and 11.5px hints. Beside
it, on the same tab, "Raise change request" opened the product's drawer from the right. None of the six told the shell
it was open, so AnA could change the screen under a reason someone was typing. A read that failed was a red line with
Try again, even when the answer was a 404 that no retry can change.

## What already exists

- **The product's drawer**: D0's `.de` (`client/src/concept2cure/v2/styles/journey-v2.css`, "the drawer"). It is a scrim
  at z 120 with a 440px panel from the right, full width at 640px and below, with 44px footer actions there.
  - The header is `.de-h` (`.de-h-t`, `.de-h-s`, `.de-x`).
  - Then `.de-body`, `.de-field` / `.de-label` / `.de-desc` / `.de-err`, the inputs (`.de-input`, `.de-select`,
    `.de-textarea`), the single choice `.de-seg`, and the footer `.de-f` with `.de-btn ghost|primary`.
  - `client/src/concept2cure/v2/C2CForm.tsx` draws it for every generated form, including Quality's "Raise change
    request".
- **The ceremony channel**: `client/src/concept2cure/v2/ceremony.ts`. C2CForm, GovernedConfirmDialog and EsignModal
  register while open. The shell's `refuse` (`V2App.tsx`) then refuses AnA's screen changes with "Finish or cancel the
  open governed form before AnA changes the screen."
- **`useDialog`**: `client/src/concept2cure/v2/useDialog.ts` handles focus in, Escape, the Tab trap and focus back.
  Quality's `DialogPanel` already used it.
- **`ErrorState` / `EmptyState`**: `client/src/concept2cure/v2/dataConnect.tsx`. With `read={status, code}`, a refusal
  is said in the classifier's words and offers no retry (C4).
- **`DialogPanel`**: `client/src/concept2cure/quality/ControlledDocumentDialogs.tsx`. It is Quality's one dialog shell,
  used by all six dialogs, so changing it changes every one.

Nothing new: no screen, route, table or file. `DrawerField` and `failedReadOf` are two small helpers beside
`DialogPanel`, in the same file.

## What changed

| | Before | After |
|---|---|---|
| The shell | `.qms-dialog` centred box, dark overlay at z 200, its own `h2` | `DialogPanel` draws `.de-bd > .de[role=dialog]` as C2CForm does: the title in `.de-h-t`, the dialog's one-line description in `.de-h-s`, Close as `.de-x`, the body, and a `footer` in `.de-f`. A form's submit sits in the footer with `form=`. Clicking the scrim closes it unless a write is in flight. |
| AnA while one is open | not told | `DialogPanel` registers the ceremony, so the shell refuses AnA's screen changes until it closes |
| Fields | `<label>` wrapping a control, Quality's input styles, the hint after the control at 11.5px | `DrawerField`: label, hint (`.de-desc`, wired by `aria-describedby`), control, error (`.de-err`, `role=alert`, `aria-invalid`), in C2CForm's order |
| Review outcome | two native radios in Quality's `fieldset` | the product's single choice (`.de-seg`, `role=radiogroup`, `aria-checked`), as C2CForm's `seg` |
| Read panels (Job roles, Who must train, Version history) | a footer "Close" | Close is the header's; the footer holds each panel's own actions ("New job role"; "Assign a job role", "Assign a person"), shown while no act is open. Row acts (Add a person, Rename, Delete, Remove, Withdraw) are `btn ghost small`. |
| An act inside a panel | Quality's buttons | its own heading, `DrawerField`s and `.de-btn` actions at the end, 44px on a phone |
| A read that threw (the notification's document, the version history, the setup's project list) | a red line and Try again | `ErrorState` with the read's status (`failedReadOf`). A refusal is said as one, with no Try again. A document that is not there says "This controlled document was not found in your organization, so it was not opened." An invalid reference offers no retry. |
| The notification target's notices | `.qms-notice` boxes | `EmptyState` (opening; held while another document is being edited, with "Dismiss target") |
| The target record's status | the raw status (`effective`) | its label (`STATUS_LABEL`) |
| The workbench | `.qms-btn` Back and a `.qms-empty` loading line | `btn ghost small` Back and `EmptyState busy` |
| "Revision required", with no review date from the approval | "The document keeps the review date its approval set." when the approval set none | "Its approval set no periodic review date, and recording this does not set one." |
| CSS | `.qms-dialog*`, `.qms-empty`, `.qms-notice`, size literals on `.qms-effective-*` | deleted. The literals became `--fs-small` / `--fs-caption`. The generated ramp sheet (`v2/styles/surface-text-ramp.css`) is regenerated. It had gone stale as C6–C15 deleted Quality's own rules (`.qms-thead`, `.qms-tag`, `.qms-pill`, `.qms-chip`, `.qms-row`, `.qms-dialog`, `.qms-notice`). `ci:surface-text-ramp` passes again. |

## Tests

- `QualityWorkArea.test.tsx`: "New controlled document" opens as `.de` in `.de-bd` with its submit in `.de-f`.
  `ceremonyOpen()` is true while it is open and false after Cancel.
- `SopRegisterAuthoring.test.tsx`: a 404 notification target says it was not found, offers no Try again, and is
  dismissed.
- `SopRegisterPeriodicReview.test.tsx`:
  - the outcome is a radiogroup, with "Remains current" checked and then "Revision required";
  - with no review date from the approval, the drawer does not claim one is kept.
- The rest of Quality's suites pass unchanged, finding fields by their labels as before. This covers
  `TrainingAssignments`, `qmsGovernedActions`, `ChangeControl*` and `ControlledDocumentWorkbench.integration`.

`red.txt`: the four new cases fail against the code before C15. `green.txt` covers Quality's suites, AnA's wave-4 and
wave-6 (ceremony) suites, project home's Quality, the core handoff, the task board's Quality source and the button
reset: 34 files and 394 tests. The typecheck is clean. These gates pass:

- `ci:undefined-css-classes`;
- `ci:class-vocabulary`;
- `ci:check-shell-css-collisions`;
- `ci:check-css-selector-shadowing`;
- `ci:surface-text-ramp`.

## Walked in the running app

Both walks ran as the approver, with no API or page errors.

`w22-drawers.cjs` (`shots/w22-drawers.log.json`) measured each dialog against "Raise change request" on the same page:

| Dialog | Left, width at 1440 | Scrim z | Footer |
|---|---|---|---|
| Raise change request (C2CForm, the reference) | 1016, 440, measured mid-slide: its entrance moves 16px | 120 | Cancel, Raise change |
| New controlled document (`shots/w22-new-document-1440.png`) | 1000, 440 | 120 | Cancel, Create and open: disabled, opacity 0.5 |
| Job roles; New job role (`shots/w22-job-roles-new-1440.png`) | 1000, 440 | 120 | New job role; none while the act is open |
| Who must train on QS-SOP-001 (`shots/w22-training-1440.png`) | 1000, 440 | 120 | Assign a job role, Assign a person |
| Version history of QS-SOP-001 | 1000, 440 | 120 | none (Close is the header's) |
| Record periodic review (`shots/w22-record-review-1440.png`) | 1000, 440 | 120 | Cancel, Continue to sign |
| New controlled document at 390 (`shots/w22-new-document-390.png`) | 0, 390 | 120 | Cancel and Create and open, both 44px high |

`w22b-record-review.cjs` (`shots/w22b-record-review.log.json`): the walk organisation had no effective document, so
"Record review" was not offered.

1. The approver approved QS-SOP-001 through its row's Approve and the e-signature. It became Effective.
2. Record review was then offered. The drawer opened with "Remains current" checked.
3. "Continue to sign" with no date gave "Enter the next review date."
4. "Revision required" checked it and removed the date field. The corrected sentence shows
   (`shots/w22-record-review-revision-1440.png`).
5. Nothing was signed.

Run the walks from this folder with `NODE_PATH=$(npm root -g) node w22-drawers.cjs` (then `w22b-record-review.cjs`).
They need `WALK_PASSWORD` and a running server.

## Not done here, and why

- **The shared refusal words name a project for every 404.** `describeReadFailure` (`mdx/hooks/useFetchJson.ts`)
  defaults its subject to "this project", and `ErrorState`'s `read` passes no subject. So any 404 shown through it reads
  "This project was not found in your organization". That is wrong for a document, a CAPA or a record. It is D0's, and
  is noted for D0. Quality says its document's 404 in its own words, without passing the 404 through `read`.
- **The training reader (C16)** and **the review-route sheets (C17)** are their own items. They still draw their own
  chrome.
