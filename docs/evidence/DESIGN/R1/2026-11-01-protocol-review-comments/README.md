# R1 reach: leave and resolve a protocol review comment

**Package:** R1 (with the F1 defect it exposed, committed separately as `059c0fa07`). **Date:** 2026-11-01.

## What already exists

- `server/routes/protocol-reviews.ts` already had `POST /documents/:id/comments` and
  `PATCH /comments/:id/resolve`. Both are governed: a reason is required, and an audit row is written through
  `governed()`. They are served in production (`launchScopeApiVerdict` = `launch`). No client called either one
  (`../2026-11-01-inventory/`, confidence `none`).
- The Reviews tab (`client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx`) displayed comments, but nobody
  could leave or resolve one.
- The governed drawer (`ProtocolDevForms.tsx`) and the write layer (`ProtocolDevWrites.ts`, with `send()` and
  `requireReason()`) are how every other protocol register writes. This reach uses them. It adds no screen,
  route, service or table.

## The change

- **`ProtocolDevWrites.ts`:** `addProtocolReviewComment` and `resolveProtocolReviewComment` call the two existing
  routes through `send()`. The reason is checked in the browser first, and the server's refusal is shown in full.
- **`ProtocolDevForms.tsx`:** two drawers. "Leave a comment" has comment, section, severity and reason. "Resolve
  comment" has a reason.
- **`ProtocolDevReviews.tsx`:** a "Leave a comment" action. Each open comment gets a Resolve button, whose
  accessible name carries the comment. A resolved comment has no button.
- **`ProtocolDevWorkspace.tsx`:** the confirmation sentences. After each write the protocol is re-read from the
  record.

## Evidence in the running app

Commit `059c0fa07`, plus this change, on a fresh database. Steps:
1. Create the project "LMN-201 RePreve — IND" through New project.
2. Start protocol CDI02 through "Start a protocol".
3. Open Reviews, then leave and resolve a comment.

| Step | Request | Status |
|---|---|---|
| Start the protocol | `POST /api/protocol-development/documents` | 201 |
| Leave a comment | `POST /api/protocol-reviews/documents/1/comments` | 201 |
| Resolve it | `PATCH /api/protocol-reviews/comments/1/resolve` | 201 |

The run had no failed request and no page error.

- `1-leave-a-comment-form.png`: the drawer.
- `2-comment-recorded-open.png`: the comment, once, marked Blocking and Open, with Resolve. The header reads
  "0 reviewers · 1 blocking open". It shows before any review is requested; before `059c0fa07` it could not.
- `3-comment-resolved.png`: Resolved, and no Resolve button.

**Tests.** `protocolDevSurfaceWrites.test.tsx` has three new cases: the exact body and route, Resolve only on an
open comment, and a short reason refused with nothing sent. All three fail without this change and pass with it.
All 31 protocol test files pass (289 tests).
