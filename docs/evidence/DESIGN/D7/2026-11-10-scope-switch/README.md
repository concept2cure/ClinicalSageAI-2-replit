# A scoped Quality never shows another scope's rows as its own (D7, 2026-11-10)

Package **D7**, Quality on the work-area pattern. This repairs three findings of the Quality review of 2026-11-10 on
C14 (QP3, Quality scoped to the open project):

1. **The previous scope's rows stood under the new scope's heading.**
   - `useFetchJson` keeps its last answer while a new URL loads, so a refresh does not flash empty.
   - After "Show the whole organisation", or back to the project, the controlled documents, the change log and the
     records registers therefore showed the previous scope's rows under the new scope's line until the new read
     landed.
2. **Periodic review listed the organisation's documents under the project.** With a project open and its documents
   not yet read, the schedule fell back to the organisation's rows unfiltered (`reviewRows`, `SopRegister.tsx`).
3. **A version history the server does not find said "this project".**
   - The history drawer used the shared refusal words (`describeReadFailure`), whose default subject is "this
     project".
   - It also offered Try again, which cannot change a 404.
   - C15 had already corrected the same case for a notification target (`ControlledDocumentTarget.tsx`).

## What already exists

- **The scope**: `useQualityScope`, `scopedPath` and `setQualityWide` (`quality/registerContext.ts`, C14).
- **The reads**:
  - `useSopRegister` (`quality/hooks.ts`);
  - `useChangeRegister` (`quality/changeHooks.ts`);
  - the records registers' read in `QmsRecords.tsx`.

  All go through `useFetchJson` (`mdx/hooks/useFetchJson.ts`). It already cancels a late response once its URL
  changes. It deliberately keeps the last data while loading.
- **The schedule's filter**: `reviewRows`, `SopRegister.tsx` (C14).
- **The history drawer**: `ControlledDocumentHistory.tsx` (C15), with `ErrorState`'s `read`/`readWhat`.
- **The 404 wording**: C15's notification-target override (`ControlledDocumentTarget.tsx`).

Nothing new: no route, screen or table. `useAnswerOf` is a function in `registerContext.ts`, beside the scope it
serves. The shared `useFetchJson` keeps its refresh behaviour for its other callers.

## What changed

| | Before | After |
|---|---|---|
| A read's data | whatever `useFetchJson` last answered | `useAnswerOf(path, data)`: the data only while it is the answer to this path; otherwise null, and the read reports loading |
| Periodic review, a project open, its documents unread | the organisation's rows | unread (`reviewRows` null), so nothing is listed and no figure is given |
| A version history 404 | "… not found … this project …", with Try again | "Not found in your organization. This document's version history was not found in your organization, so it was not read." No Try again |

## Tests

- `quality/__tests__/qualityScope.test.tsx`: after "Show the whole organisation", the documents and changes are null
  and loading until the organisation's answer arrives, then are that answer.
- `quality/__tests__/QualityWorkArea.test.tsx`: with a project open and its documents unread, the periodic-review
  section lists nothing and gives no figure. The flag it sets is reset in `afterEach`.
- `quality/__tests__/SopRegisterAuthoring.test.tsx`: a 404 on the version history names the document, says nothing
  of a project, and offers no Try again.

`red.txt`: the three cases fail before the change. `green.txt`: Quality's 28 suites, 373 tests.

## Walked in the running app

`w30-scope-switch.cjs` (`shots/w30-scope-switch.log.json`) ran as the approver, with no page errors. Its two API
errors are the 404s the walk itself answers for the version history: the drawer reads it twice in development.

1. **The controlled documents.**
   - Quality opened from C11 · Walk C11 gasket programme lists the project's SOP-001…SOP-008.
   - The walk held the organisation's documents read for 2.5 seconds, then clicked "Show the whole organisation".
     Half a second later the scope line read "The whole organisation's quality records.", the register showed
     "Loading the register…" and no rows (`shots/w30-sop-switching-1440.png`).
   - Then it listed the organisation's nine, QS-SOP-001 among them.
2. **The change log, the same way.** The project has no change ("No change is filed under C11 …"). While the
   organisation's read was held, it showed "Loading the change log…" and no rows
   (`shots/w30-changes-switching-1440.png`). Then it listed the organisation's changes.
3. **History, answered 404 by the walk** (`shots/w30-history-404-1440.png`). "Version history of QS-SOP-001" says
   "Not found in your organization. This document's version history was not found in your organization, so it was
   not read." There is no Try again.

Run it from this folder with `NODE_PATH=$(npm root -g) node w30-scope-switch.cjs`. It needs `WALK_PASSWORD` and a
running server.
