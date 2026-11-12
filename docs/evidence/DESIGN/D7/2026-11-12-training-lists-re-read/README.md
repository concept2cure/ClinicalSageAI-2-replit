# D7 · Who is due to train, coverage and the review schedule follow a confirmed write (2026-11-12)

Package **D7**, under founder decision **P-122** (the merged Quality shows the work). Found by walking a controlled
document end to end in the running app (`w41-document-end-to-end.cjs`): the author creates and writes it, routes it,
the approver signs it, a person is assigned to train on it, and reads and acknowledges it.

The walk passed every step. One list was wrong after the last one:

- A person read and acknowledged the document. The coverage section said "1 of 1 acknowledged".
- "Training overdue, due or lapsing", under it, still listed that person as due on that document, until the page was
  reloaded.

## What already exists

- **The confirmed-write signal**: `qualityWritten()` in `client/src/concept2cure/quality/qmsWrites.ts`, called by
  every Quality write door once the server has confirmed (`dd14af400`), and `useQualityWrites()` in
  `registerContext.ts`. The figure line (`QualityFigures.tsx`) and the records registers (`QmsRecords.tsx`) already
  follow it.
- **The due list**: `TrainingExpiry.tsx`, reading `GET /api/mdx/qms/training/expiring` through
  `useTrainingExpiring` (`hooks.ts`). It was read once, when the page opened.
- **Coverage and the review schedule**: `SopRegister.tsx` reads `useTrainingCompliance()` and `useReviewDue()`.
  Coverage was re-read by two callbacks (closing the Training drawer, and after an acknowledgement); the review
  schedule only on returning from the editor. Neither was re-read after an approval or a retirement, which put a
  version in force or take one out.

Nothing new: no screen, route, mount or table.

## What changed

- `registerContext.ts`: `useOnQualityWrite(reread)` runs a re-read after each confirmed Quality write, and not on
  mount. It is the effect `QualityFigures.tsx` already had, in one place; the figure line now uses it.
- `TrainingExpiry.tsx` re-reads its list on a confirmed write.
- `SopRegister.tsx` re-reads the review schedule and coverage on a confirmed write. The two callbacks that re-read
  coverage a second time (closing the Training drawer, after an acknowledgement) no longer do: the write's own signal
  is the re-read, and it lands when the server confirms, behind the open drawer.

## Tests

- `__tests__/TrainingExpiry.test.tsx`: the list is re-read when a Quality write is confirmed, and not before.
- `__tests__/SopRegisterApproval.test.tsx`: the review schedule and coverage are each re-read once.
- `__tests__/QualityFigures.test.tsx` (unchanged): the figure line's four reads are re-read, through the shared hook.

`red.txt`: the two new cases fail before the change. `green.txt`: Quality's suite, 31 files and 411 tests.

## Walked in the running app

`w41-document-end-to-end.cjs` (`shots/w41-document-end-to-end.log.json`), at 1440, three people, no page error.

1. **The author** (Ada) opens Quality from the project, and creates a controlled document from "New controlled
   document" (`shots/w41-new-document-1440.png`). The one editor opens on it (`shots/w41-editor-1440.png`). They
   write its first text, save with a reason, and return to the register: the row is Draft, with "Send for review".
2. **The route** (`shots/w41-send-for-review-1440.png`): the form offers the organization's designated approver
   (Theo) and says why the author is not offered. After sending, the row reads "Under review · Waiting for Theo
   Trainee."
3. **The approver** (Theo) sees "Your turn: approve." and signs (`shots/w41-sign-1440.png`). "Signature applied"
   shows the manifest (`shots/w41-signature-applied-1440.png`). The row is Effective, and the figure line's
   "documents in force" went up by one with no reload (`shots/w41-effective-1440.png`).
4. **Assigning** (`shots/w41-assigned-1440.png`): the approver assigns Quinn by name, with a reason. With the drawer
   closed and no reload, the due list names Quinn on the document: "due 2026-11-26 (in 14 days), 14 days after they
   were assigned" (`shots/w41-due-after-assigning-1440.png`, step `due-after-assigning`).
5. **The reader** (Quinn) opens "Read and acknowledge" (`shots/w41-reader-1440.png`), reads the text and
   acknowledges (`shots/w41-acknowledged-1440.png`).
6. **After** (step `after`): coverage says "1 of 1 acknowledged", and the due list no longer names the document
   (`dueOnIt: []`). Before this change that list still named Quinn.

Run it from this folder with `NODE_PATH=$(npm root -g) node w41-document-end-to-end.cjs`. It needs `WALK_PASSWORD`
and a running server.

## What else the walk found

- **One refused request, each run**: `GET /api/c2c/projects/:id/sources` answered 503
  `SOURCE_READ_ACCESS_CHANGED` when the editor opened on the new document. Its cause and the repair are in
  `docs/evidence/F1/2026-11-12-source-scope-admissions/`.
- **The editor's save toast on a controlled document** says "The text is saved in the editor but not in the filing:
  This document is not bound to a filing". A controlled document is never bound to a filing. The editor is the
  coordinating session's; this is handed to it in `.design/claude-convergence/COORDINATION.md`.
