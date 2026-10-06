# W5 / D2–D7 — review-task confirmation and recovery

## Existing-build finding

Authoring's Assign review creates a unified_tasks review task through the existing
POST /api/tasks/tasks API. It is distinct from authoring_reviews peer verdicts
and the formal signature workflow. No replacement task store or inferred document
approval is introduced here.

Single task creation lacked the commit-outcome guard already used by task
transitions: loss of the connection while COMMIT completed returned a generic
400. The dialog also said nothing was recorded on a missing response. A success
receipt was trusted by taskId alone, even if it described another document or
assignee. A mounted dialog could keep its selected reviewer and instructions
when its document context changed, and late responses could refresh/close the
new selection. Reviewer numeric checks admitted zero, negative, fractional,
unsafe and exponent-form input.

## Repair

The existing single-create route now returns the shared OUTCOME_UNKNOWN response
when COMMIT cannot be confirmed, and does not issue assignment notifications in
that case. Audit failure before commit still uses AUDIT_WRITE_FAILED and rolls
back. The shared task creation schema accepts only positive safe integer assignee
IDs; the client additionally requires an actual selected roster entry.

Assignment confirmation requires the server's task ID, authoring source type,
selected document ID and selected assignee ID. A lost/malformed/mismatched
response is unconfirmed. Its dialog retains instructions, blocks repeat submit
and offers Check existing review tasks. That action opens and refreshes the
existing Authoring task rail. It neither creates a second task nor invents a
success receipt. Confirmed audit rollback and ordinary validation/auth refusals
remain retryable in place. No automatic retry or server idempotency is claimed.

Each program/document/section context gets fresh dialog state. A pending request
can still finish on the server after selection changes; its old response cannot
close, refresh or toast against the new selection. A synchronous latch prevents
overlapping submissions in the same mounted dialog. Notification text describes
a requested notification, without asserting delivery.

## Validation

Before repair: 10 failing new regressions and 24 passing cases across the two
focused files. Final regression: 101 tests passed across 8 files:

- client/src/concept2cure/v2/__tests__/workbenchAssignReview.test.tsx
- client/src/concept2cure/v2/__tests__/workbenchProjectFiles.test.tsx
- client/src/concept2cure/v2/__tests__/workbenchFileToVault.test.tsx
- server/routes/__tests__/task-management-governed-writes-review.test.ts
- server/routes/__tests__/task-management-governed-writes.test.ts
- server/routes/__tests__/task-management-reasons.test.ts
- server/services/tasking/__tests__/task-audit-transaction.test.ts
- tests/golden-journeys/ind-authoring.journey.test.ts

Run with NODE_OPTIONS=--max-old-space-size=4096 npx vitest run and these paths.
The backend transaction harness injects loss after the callback at COMMIT and
asserts the typed unknown response and absence of notifications. It does not
prove a live PostgreSQL network fault. The Workbench integration test commits
its fixture task then drops the response; the existing rail finds that task,
and repeat submission stayed disabled. Delayed responses, wrong-document
receipts, invalid IDs and known audit rollbacks have separate regression cases.
The IND authoring journey continues to run on real PGlite SQL.

Production build, changed-file warning ratchet, test-import resolution and git
diff --check passed. No full local type-check success is claimed; unchanged
GitHub CI gates verify the published commit. No dependency, model, schema, store
or API endpoint was added. Task creation does not request a document peer review,
prove a document verdict/signature, or qualify an entire IND. Production
qualification and delivery/activation gates remain open.
