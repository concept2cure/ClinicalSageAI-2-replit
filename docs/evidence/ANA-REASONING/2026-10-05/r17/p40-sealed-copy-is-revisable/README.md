# P-40 — a sealed editing copy is revisable, and the refusal says so

Decided 2026-10-19 under the founder's delegation of 2026-10-13 (document
creation and editing). Recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`.

Closes the second and third findings of
`../qms-seal-finding-corrected/`, which came out of correcting task #36.

## The two defects, and why they are one change

**The document was stranded.** A QMS register entry at `draft` whose bound
editing copy had been frozen or approved could go nowhere:

| Way forward | What happened |
|---|---|
| Send for review | Refused — correctly. `decideAuthoringPermission` refuses `edit` on an immutable status ahead of every grant and bypass. |
| `reviseControlledQmsDocument` | Refused: it admitted `effective`, `retired`, `superseded`, `in_review` — not `draft`. |
| Re-bind a different copy | Refused: `bindContent` requires `authoring_document_id IS NULL`. |
| "Create a new version", the frozen message's own remedy | **No such route exists** on the authoring side, and there is no unfreeze (DP-35 / P1-32). |

**The refusal blamed the reader.** `requireContentAccess` collapsed every
outcome of the decider into 403 `QMS_DOCUMENT_PERMISSION_DENIED`, "You do not
have permission to read or change this authored document" — said to the
owner-administrator of a sealed document. False, and it named no way forward.
The decider already returns `document-immutable` separately; that distinction
was being thrown away.

They ship together because fixing only the sentence would have it name a remedy
that did not exist. This lane made that exact mistake earlier in the session
with `FILING_DIVERGED`, whose first refusal told the author to "save to
re-file" a section that could not be saved because nothing had changed.

## The decision

**A `draft` whose editing copy is sealed is revisable, and nothing else about
`draft` is.** A revision is what "create a new version" means here: the sealed
text is copied onto a new editing copy, the version is bumped, the old document
id is retained in `metadata.retainedAuthoringDocuments`, and the seal and every
signature over it are untouched.

The condition is the seal. Without it this would be a free version bump on any
draft — a new door, not a remedy. `checkDocumentWritable`, the lock module's own
predicate, decides it, and only its `DOCUMENT_FROZEN` verdict counts (see Q5).

The sealed refusal becomes 409 `QMS_DOCUMENT_SEALED`: the text is sealed, it is
part of the signed record, open a controlled revision. 409 and not 403 because
it is a state conflict, not a permission problem.

## What was deliberately NOT changed

- The seal still refuses the send-for-review and the rename. That refusal is
  the thing keeping a freeze meaningful.
- `IN_REVIEW` stays a non-sealing status. Review is a state a document is
  edited during (`document-lock.ts` says so in its own comment), and the review
  board finds its work by `upper(d.status) = 'IN_REVIEW'`; sealing it would
  hide the document from the reviewers it was sent to.
- The two disagreeing definitions of which statuses seal content remain open
  (task #40), not reconciled here: both are load-bearing in different places,
  and the mutants of the previous round show that editing either list opens a
  real hole.

## The red

Five cases failed before the change — four on the false sentence, one on the
stranding:

    refuses ... when the editing copy is FROZEN   → expected 403 PERMISSION_DENIED to match 409
    ... APPROVED                                  → same
    says the document is sealed ...               → expected 'You do not have permission to read or…'
                                                     not to match /permission/i
    does not rename a sealed editing copy         → same shape
    revises a draft whose copy is sealed          → "The controlled document changed or is already
                                                     a draft. Reopen it before revising."

Tally `5 failed | 4 passed (9)`.

Four assertions in that file were changed from the behaviour they pinned one
commit earlier. That is deliberate and is the point: the previous commit pinned
the refusal *as it was* while recording in its own evidence that the sentence
was false. This commit makes it true and moves the assertions with it.

## Verification

All nine QMS suites, 128 tests, pass. Six mutants, run against the whole QMS
directory so the neighbouring lifecycle cases count too:

| Mutant | Result |
|---|---|
| Q1 the sealed branch removed | KILLED (4 failed) |
| Q2 sealed refusal reuses the permission wording | KILLED |
| Q3 sealed refusal names no remedy | KILLED |
| Q4 `draft` admitted unconditionally | KILLED |
| Q5 any unwritable copy counts as sealed | **SURVIVED — explained below** |
| Q6 only draft+sealed revisable, other states dropped | KILLED |

**Q5 survived, and it should.** It replaces
`code === 'DOCUMENT_FROZEN'` with `!writable`, which would also treat
`DOCUMENT_NOT_FOUND` as sealed. That state is unreachable through this path:
`captureQmsAuthoringContent` runs first and refuses a document it cannot read
(`QMS_CONTENT_REQUIRED`), so the two forms are behaviour-equivalent here. The
precise form is kept as defensive depth — if that upstream guard ever changes,
`!writable` would silently admit a revision of a missing document — and the
survivor is recorded rather than papered over with a test for a state the code
cannot reach. Not every mutant has to die; a survivor has to be explained.

## Hot-file disclosure

`docs/LAUNCH_DEFINITION_OF_DONE.md` was last touched 2026-10-18 22:22 UTC by
another lane (`c0957ce25`, P-37 to P-39), inside the 24-hour window. The P-40
entry is a pure insertion before `## How sessions run under this file`; every
existing line, P-39's included, is byte-identical.

`server/services/qms/controlled-document-service.ts` carried `e1f3fd425`
(2026-10-17 23:02 UTC); that window closed before these edits were made.
