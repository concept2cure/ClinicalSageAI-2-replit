# R1 reach: reopen a review thread or task where it was resolved (2026-11-06)

The R1 inventory (`../2026-11-01-inventory/inventory.json`) lists two launch-served handlers with no client caller:
- `POST /api/concept2cure/review-threads/:threadId/reopen`;
- `POST /api/concept2cure/review-tasks/:taskId/reopen`.

## What already exists (RULE 3)

- `server/routes/c2c/reviews.ts:721` and `:1645`: both reopen routes. Each refuses without the `resolve` permission
  (`getThreadPermissions`), refuses an item that is already open, and writes its own comment, activity and audit
  rows ("Thread reopened by …", `thread_reopened`).
- `client/src/concept2cure/v2/surfaces/ReviewThreads.tsx` (`ReviewThreadsPane`, mounted in `Review.tsx`): the review
  inbox. It resolves threads and tasks through `…/resolve`, and lists open items assigned to you only (`my-queue`).
  So a resolved item left the screen, with no way back.
- `my-queue` reports `permissions.canResolve`, from the same `getThreadPermissions` the routes enforce.

## What changed

Right after a thread or task is resolved, the pane says "Resolved “title”." and offers **Reopen**. It calls the item's
own reopen route, re-reads the inbox, and says "Reopened: title"; a refusal is said in the server's words, and the offer
stays. It is offered only when `canResolve` is true: a task's assignee may resolve it without `resolve`, but the server
refuses them a reopen, so they are not offered one. The offer lives in `useReopenLastResolved` beside the pane. The
pane's complexity is unchanged (40), and ESLint counts the same 5 warnings as before.

## Proof

`client/src/concept2cure/v2/__tests__/reviewThreadsReopen.test.tsx`, 4 cases: reopen a task; reopen a thread through
its own route; no offer without the `resolve` permission; a refusal said in the server's words. Before the change, 3
failed (the offer did not exist). The no-permission case passes either way by design. After the change, 4 of 4, with
`anaSeesScreens`, `reviewRecordExport` and `reviewCommentByline` (23 of 23).

Not walked in the running app: the demo database holds no review threads or tasks
(`concept2cure_review_threads` and `concept2cure_review_tasks` are empty).
