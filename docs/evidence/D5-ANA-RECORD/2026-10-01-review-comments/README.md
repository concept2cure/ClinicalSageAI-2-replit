# A review comment is fixed once posted, and every act on one is on the chain

Launch row **D5**, 2026-10-01. Slice 3 of the AnA record work. Slice 1 is turn
records (`../2026-09-26/`). Slice 2 is the authoring trail: comments, quoted
passages and AI-suggestion decisions (`../2026-09-26-authoring/`).

The founder asked that the product keep people's comments and quotes the way
Anthropic would, reportable to the FDA later and immutable. Slice 2 did that
for the authoring editor. The **Review** launch surface (the Authoring app's
review threads on artifacts, `client/src/concept2cure/v2/surfaces/ReviewThreads.tsx`)
keeps its comments in a second store, `concept2cure_thread_comments`, which
none of that reached.

## What was wrong

- **Comments could be rewritten.** `PATCH /api/concept2cure/review-comments/:id`
  overwrote a comment's words in place and kept no copy. Any role could
  UPDATE the table; no trigger stopped it.
- **Removal left nothing.** `DELETE` set `deleted_at`; the act and who did it
  were not recorded anywhere.
- **Nothing was chained.** The four places the router writes a comment
  (thread creation, a reply, resolve, reopen) and the two AnA writers (the
  `add_review_comment` command and the guidance executor) inserted rows with
  no audit row, outside any transaction.
- **The GDPR erasure overwrote them.** `erase_personal_data` rewrote every
  comment the subject had written to `[REDACTED PER GDPR ART.17]`, while it
  already kept the artifacts those comments review (Art. 17(3)(b)).
- **AnA's words were filed as the person's.** Both AnA writers insert under the
  person's id with no mark that AnA wrote the text.

## Decision

A review comment on a regulated artifact is part of that artifact's review
record. The authoring comments already follow this rule (slice 2): once a
comment is posted, its words, author and placement are fixed. A correction is a
reply. A retraction hides the comment, keeps its words, and is recorded.

The erasure keeps review comments, as it keeps the artifacts, on the same
legal basis. The subject's identity is pseudonymised by redacting their user
record.

## What changed

- **`migrations/20261001_review_comments_record.sql`**, a new file in the set,
  above the final pair. It creates no table.
  - `trg_c2c_review_comment_record_guard` fixes thirteen columns once a
    comment is posted: `comment_id`, `org_id`, `thread_id`, `artifact_id`,
    `version_id`, `parent_comment_id`, `author_id`, `author_name`,
    `author_role`, `body`, `kind`, `created_at` and `edited_at`.
  - `deleted_at` can be set once, from NULL to a time.
  - A direct DELETE is refused, and `trg_c2c_review_comment_no_truncate`
    refuses TRUNCATE.
  - The ON DELETE CASCADE from the comment's thread, artifact or project is
    admitted (`pg_trigger_depth() > 1`, shown on this PostgreSQL: 1 for a
    direct delete, 2 for a cascade). Those deletes are governed where they
    happen, and the comment's words are on its chained row either way.
  - Both triggers are on `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`, so a
    production boot refuses without them.
- **`server/routes/c2c/review-comment-record.ts`**, the one writer.
  - `postRecordedComment` inserts the comment and writes its chained
    `audit_logs` row (`review.comment.posted`) in one transaction. The row
    holds the words, their sha256, kind, thread, artifact, author and
    `origin`.
  - `retractRecordedComment` sets `deleted_at` and writes
    `review.comment.retracted` with the body's sha256 and the reason the
    person gave, trimmed, or null.
  - `recordCommentPosted` is the chained row alone, for writers with their own
    transaction.
- **`server/routes/c2c/reviews.ts`.**
  - All four comment inserts go through the writer.
  - `PATCH` answers 409 `COMMENT_TEXT_FIXED`. No launch screen calls it; the
    client never did.
  - `DELETE` is the recorded retraction.
- **AnA's writers.** `add_review_comment` (`command-executor.ts`) and the
  guidance executor write their comment and its chained row in one
  transaction, marked `origin: 'ana'`.
- **The erasure.** `concept2cure_thread_comments` leaves `ERASURE_SCOPE`. The
  comments are counted (`retainedReviewComments`), named in the signature
  manifest's `retainedTables`, and covered by `GDPR_RETENTION_LEGAL_BASIS`.
- **Project deletion.** `projectDeletionHolds`
  (`server/services/c2c/project-retention.ts`, PF-08) counts an artifact with
  review comments as holding records, as it counts a signed one. A project
  whose artifacts carry review comments answers 409 `PROJECT_HOLDS_RECORDS`
  rather than cascading its review record away. This is a one-condition change
  inside the PF-08 lane's window. It does not overlap that lane's hunks; its
  PGlite case and the locks dbtest's schema are updated with it.

## Shown

All runs are on PostgreSQL 16.13, on a database built by install-fresh +
deploy-migrate. The test is `tests/db/review-comments-record.dbtest.ts`. It
uses the real router behind `authenticateToken`, mounted as production mounts
it, with a real JWT for an organization member, and RLS enforcing.

| Case | Before (`red/dbtest-head.txt`: HEAD's router, triggers absent) | After (`green/dbtest.txt`) |
|---|---|---|
| A posted comment has a chained row with its words and sha256 | red | green |
| The chained row cannot be written → no comment | red (the comment saved) | green |
| Another tenant's caller on the thread | refused (control) | refused |
| PATCH | red (200, words rewritten) | 409, words unchanged |
| The owner's UPDATE of body or author, direct DELETE, TRUNCATE | red | refused with `IMMUTABILITY_VIOLATION` |
| Retraction: words kept, chained with the person's reason, once | red | green |
| Deleting the thread removes its comments; their chained rows remain | red (no chained row) | green |

**Mutations** (`mutations.txt`): each one was applied, run, seen red, and
restored.

| # | Mutation | Red |
|---|---|---|
| rm1 | The guard admits a direct DELETE | the owner-refusal case |
| rm2 | `body` left out of the fixed columns | the owner-refusal case |
| rm3 | The cascade refused too | the thread-delete case |
| rw1 | No transaction around the comment and its chained row (the old shape) | the atomicity case |
| rw2 | The retraction without its chained row | the retraction case |

An earlier rw1, which wrote only the chained row outside the transaction,
stayed green. That is correct: the writer inserts first and chains last, so a
failed chain write still rolls the comment back. The recorded rw1 is the
shape before this change.

**The erasure** (`ana-governed-command-signature.pglite.integration.test.ts`,
21/21): the subject's review comment is kept word for word and counted, and is
outside the manifest's scope. With HEAD's erasure it is red
(`red/erasure-retains.txt`). The "failing redaction" case now breaks the
conversations UPDATE, the real redaction that remains.

**Project deletion** (`project-retention.pglite.test.ts`): a draft with a
review comment is a record.

## Follow-up, same day: AnA's words shown as AnA's

The chained row already marked `origin: 'ana'`, but the comment row carried
the person's id and name, and the thread showed AnA's words as theirs.

- **The marker.** Both AnA writers stamp `author_role = 'ana'` when they post
  (`ANA_REVIEW_COMMENT_ROLE`, `shared/constants/review-comment.ts`). The
  author fields are fixed after posting, so the stamp is set once and cannot
  be changed later.
- **The thread.** `CommentByline` (`ReviewThreads.tsx`) shows such a comment
  as **AnA**, "on behalf of" the person. A person's own comment shows as
  before.
- **What stays.** The person's id and name stay on the row, because AnA wrote
  for them.
- **Comments posted before this change** keep the role they were posted with.
  Their chained rows carry `origin` from 2026-10-01 on.

Shown:
- `ana-governed-command-signature.pglite.integration.test.ts`: the
  `add_review_comment` case stamps `ana` and chains with `origin: 'ana'`.
  22/22.
- `reviewCommentByline.test.tsx`: 2/2.

Each was seen red with its half removed (`mutations-ana-attribution.txt`).

## Follow-up, same day: who takes part in a review

The morning's note below called this a product question. Read closer, it is a
defect. `getThreadPermissions` (`reviews.ts`) named document roles that no
membership carries: approver, reviewer, author and user. The roles a request
actually has are the organisation's own (`organization_users.role`, resolved
live per request): owner, admin, manager, member, the legacy editor, and
viewer. So every organisation role but admin was read-only on the Review
surface. A manager could not comment on a review or resolve it, and neither
could a member doing the work.

**The decision.** The map now follows the vocabulary
`ORG_ROLE_FUNCTIONAL_GRANTS` (`middleware/auth.ts`) already uses: whoever does
the regulatory work takes part in its review.

- **owner, admin, manager:** comment, request changes, resolve, assign.
- **member, editor:** comment, request changes, resolve. Not assign:
  assigning review work stays with those who lead it.
- **viewer, and any role the map does not name:** read only.
- **The old names** are kept for tokens that still carry them.
- **Retraction is unchanged:** the author, or an admin.

Shown on the real router (`tests/db/review-comments-record.dbtest.ts`,
`roles/`):

- **Red at HEAD's route:** 2 of the 3 new cases fail (`roles/red-at-head.txt`).
  The member is refused with "Your role does not permit commenting", and the
  manager is refused reassigning.
- **Green:** 10/10 (`roles/green.txt`). The viewer case is the control, green
  both ways.
- **Mutations** (`roles/mutations.txt`). Each fails only its own case:
  - the member read-only again;
  - the manager without assign;
  - the viewer allowed to comment;
  - the member allowed to reassign.

## Not done, and why

- ~~**Organization members cannot comment.**~~ Done the same day, above.
- **Found, not this lane's.**
  - **The tenant purge and signed artifacts.**
    `20260929_concept2cure_signatures_append_only.sql` refuses the cascade
    from deleting an artifact. `purgeTenant` deletes `projects`, which
    cascades to artifacts, so a purge of a tenant with any signed artifact
    fails. The review comments here admit the cascade for exactly that reason.
  - **`tests/routes/device-projects-governed-writes.test.ts`, 2 red.** They
    fail the same way at HEAD: the route now calls `.limit` (`7aaa97fd0`,
    D3), and the test's transaction mock has none.
