# D2: the task board shows every task store's work

**Row:** D2 (Projects). This is the open half of the board's "Two task stores" entry. The AnA half (the counts AnA is
given) was closed earlier today in `docs/evidence/D2/2026-10-01-task-completion-honest/`. **Lane:**
`…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed on the board before the change. `taskBoard.routes.ts` and `TaskBoard.tsx`
were last changed in `b894544ae` (`…015oLV2v`, 03:19 UTC), inside that lane's window, and are edited under the
founder's instruction of 2026-10-01. The edit is disclosed on the board.

## What was wrong

`GET /api/task-management/board` read `unified_tasks` only. The platform has four stores of work:

| Store | Written by |
|---|---|
| `unified_tasks` | the board itself; AnA's `create_task` mirror |
| `project_tasks` | the schedule of events, the Communication Center, the c2c task API |
| `c2c_project_work_items` | agency correspondence intake |
| `estar_submissions` | tracked filings |

So a task blocked in the schedule, an FDA information request, or a filing the agency was waiting on never reached
the board, and its Blocked column read 0 while two items were blocked elsewhere (`red/A-dbtest-on-trunk-route.txt`:
"expected [] to deeply equal [2 items]"). A person managing a programme from the board saw an incomplete picture with
nothing to say so.

## What is true now

- **The board reads every store through `loadUnifiedWork`**, the platform's one cross-store view, already used by the
  MDx workbench and by AnA's counts. It does no merge of its own. Completed work is included for the Done column.
- **Another store's work is a read-only card.** It carries its store's label (Schedule, Correspondence, Filing), sits
  in the column its status maps to, Blocked included, and opens a panel that says where it lives. That panel has
  "Open in Project home" or "Open in Submission Center", which opens the owning screen on the item's project. The
  board offers no move, archive or sign on these cards and invents no write path into another store. Fields that
  store does not record (an assignee id, progress, approval, dependencies) are left empty, never invented. Its assigner is `null`, not `''`. The pre-push fabricated-identity check refused a literal empty string in an identity field on the first push, and it was right: `''` cannot be told apart from a recorded value.
- **The board's own cards are unchanged** and keep their move, edit, archive and sign controls.
- **A task AnA created appears once.** It lives in both `project_tasks` and the board (its mirror carries
  `source_entity_type 'project_task'`), and is shown as the editable board card.
- **A store that cannot be read is named.** The response carries `meta.partial` and `meta.unreadSources`. The screen
  says "Not every task store could be read: …" and AnA's screen context says the counts are incomplete. The board's
  own table being missing used to read as an empty board; it is now reported the same way.

## Proof

| File | |
|---|---|
| `red/A-dbtest-on-trunk-route.txt` | `tests/db/task-board-every-store.dbtest.ts` against trunk's route: 4 of 6 fail. No other store's work, a Blocked count of 0, no read caveat. The two that pass are controls: the runtime-role posture, and "AnA's task appears once" (it holds on trunk and must still hold after). |
| `green/A-dbtest-runtime-role.txt` | After: 6/6, as a NOSUPERUSER NOBYPASSRLS role with RLS on, through the real `establishRequestTenantScope`. Includes another organisation's task never appearing, and a store made unreadable (its `SELECT` revoked) being named while everything readable still shows. Alongside it, `cross-object-resolver.dbtest.ts` (which shares the view) still passes: 15/15 across both. |
| `red/B-client-on-trunk-screen.txt` | `taskBoardEveryStore.test.tsx` against trunk's screen: 4 of 5 fail. Another store's card is labelled "Board" and offers Advance, which would try to move a task the board does not hold. There is no home link and no caveat. |
| `green/B-client.txt` | After: 5/5. |
| `green/C-neighbouring-suites.txt` | Every other task-board client suite, AnA's screen-context suites and the unified-view tests: 10 files, 64/64. |
| `red/M1-mirror-dedupe-removed.txt` | With the mirror rule removed, AnA's task shows twice (`TASK-PT-…` and `schedule:…`). |
| `red/M2-unread-store-not-reported.txt` | With a failed store left unreported, the board claims `partial: false` while missing a store. |
| `red/M3-move-offered-on-other-store.txt` | With the move controls offered on every card, the client test fails on Advance. |

`npm run typecheck`: 0 errors. ESLint warnings: `taskBoard.routes.ts` goes from 2 to 1 (the board's own read moved
into `readOwnBoard`), `TaskBoard.tsx` stays at 9, and the fixture stays at 0. Gates all exit 0: requestDb coverage,
tenant isolation, server error leaks, AnA surface context, launch-scope API, unbacked tables and unkeyed request tables.

## Not done here

- `project-rollup-service.ts` still counts tasks from `project_tasks` only, a second count path. It feeds the
  hierarchy roll-up, not the board, and is recorded on the board as a hand-on.
- The detail panel opens the owning screen on the item's project, not on the item itself. `onNav` takes a screen id,
  and none of the owning screens accepts an item to focus today.
