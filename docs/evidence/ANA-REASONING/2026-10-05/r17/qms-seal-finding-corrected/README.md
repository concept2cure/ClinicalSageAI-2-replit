# Task #36 was a false finding. What is real is that nothing tested the seal.

## The claim, and why it was wrong

Task #36 said: the QMS send-for-review moves a FROZEN authoring document to
IN_REVIEW, un-sealing it — a seal bypass.

The write it was based on is real. `updateControlledQmsDocument` ends with:

    UPDATE authoring_documents SET title = COALESCE($3,title),
           status = COALESCE($4,status), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2

`$4` is `'IN_REVIEW'` when the register entry is sent for review, and the
statement reads the document's current status nowhere. `LOCKED_DOCUMENT_STATUSES`
is {FROZEN, APPROVED}, so on its face this is the one writer in the platform
that can move a document out of a sealed state.

It cannot. Two lines above it:

    if (row.authoring_document_id)
      await requireContentAccess({ ...ctx, pool: client }, row.authoring_document_id, 'edit');

`decideAuthoringPermission` refuses `edit` whenever the document's status is in
`IMMUTABLE_DOCUMENT_STATUSES`, and it does so **first** — before the read-only
check and before the global-admin branch, so not even SUPER_ADMIN gets through.
A sealed editing copy cannot be sent for review, and cannot be renamed through
the register either.

**Where the reasoning failed:** I reasoned from the write statement instead of
from the path into it. "This UPDATE reads no status" was true and was not the
question; the question was whether anything upstream had already refused. The
same mistake would be avoided by reading a handler top-to-bottom before
reporting on any statement inside it.

Verified at the line, against HEAD:
`server/services/authoring/authoring-permissions.ts` (`documentStatusAllowsAction`,
and the ordering inside `decideAuthoringPermission`),
`server/services/qms/controlled-document-service.ts` (`requireContentAccess`).

Two further premises checked while confirming it, both of which held:

- "There is no unfreeze" — true. A freeze is the platform's one signing
  ceremony (DP-35 / P1-32), and no un-freeze route exists.
- The authoring submit path is guarded independently:
  `Document must be in DRAFT status to submit`. So it is not a second way in.

## What is real, and is now pinned

The guarantee holds, but it was **incidental and untested**:

- It does not come from `document-lock.ts` — the module whose header calls
  itself "the ONE definition, shared by every entry point" and whose
  `LOCKED_DOCUMENT_STATUSES` is {FROZEN, APPROVED}.
- It comes from `IMMUTABLE_DOCUMENT_STATUSES` in `authoring-permissions.ts`:
  APPROVED, FROZEN, LOCKED, SUBMITTED, EFFECTIVE, SUPERSEDED, OBSOLETE,
  ARCHIVED.
- Nothing connects the second list to the seal, and no test covered the QMS
  path's reliance on it.

So the seal on this path rested on a list in another module, for a different
purpose, with no test. `qms-send-for-review-respects-the-seal.pglite.test.ts`
pins it: six cases, run as an organization ADMIN (the principal hardest to
refuse), asserting that a FROZEN or APPROVED editing copy survives a
send-for-review and a rename, that the refusal is the seal rather than a
missing grant, and that an unsealed draft still goes to review as before.

Six mutants, all killed:

| Mutant | Result |
|---|---|
| N1 FROZEN dropped from the immutable list | KILLED (3 failed) |
| N2 APPROVED dropped from the immutable list | KILLED |
| N3 immutability checked AFTER the admin bypass | KILLED (4 failed) |
| N4 QMS asks for `view` instead of `edit` | KILLED (3 failed) |
| N5 QMS access check removed | KILLED (3 failed) |
| N6 export no longer allowed on a sealed doc | KILLED |

N4 is the one that justifies the file. Changing `'edit'` to `'view'` in the QMS
call is a plausible tidy — the handler does read the document — and it opens
the un-freeze completely, with every other test in the repository still green.

## Three real findings this turned up, recorded as tasks

1. **Two definitions of "which statuses seal content"** that disagree, one of
   which claims in its own header to be the only one. The QMS seal depends on
   the list that makes no such claim.
2. **The refusal blames the user.** A sealed document's send-for-review returns
   403 `QMS_DOCUMENT_PERMISSION_DENIED`, "You do not have permission to read or
   change this authored document." An owner-administrator is told they lack
   permission on their own document when the truth is that it is sealed, and the
   message names no remedy.
3. **A draft whose editing copy is sealed has no forward path.** It cannot be
   sent for review (the seal, correctly), and `reviseControlledQmsDocument`
   admits effective/retired/superseded/in_review but not `draft`
   (`QMS_INVALID_STATE`, reproduced). The frozen message's own remedy —
   "Create a new version to make further changes" — has no route on the
   authoring side at all.
