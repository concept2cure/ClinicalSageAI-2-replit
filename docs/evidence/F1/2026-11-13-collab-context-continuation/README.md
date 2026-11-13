# F1: repair existing collaboration context handling

W1, launch D2. Continue canonical `337b87b68` under the project-first roadmap. This is discovery/repair of existing collaboration, not a new module, screen, route, store, task service or model.

## What already exists

- `client/src/concept2cure/v2/registryModel.ts` already puts Tasks and Communication on the standard left rail. Preserve those entries; the roadmap forbids adding a second task/messaging surface.
- `surfaces/CollabLauncher.tsx` already provides the universal Quick task and Collaborate forms, reads the real tenant-scoped directory, creates messages through `/api/tasks/messages`, then optionally creates a task through `/api/tasks/tasks`. Its confirmed/unknown delivery controls already prevent automatic duplicate sends after a partial result (`__tests__/collabMessageReceipt.test.tsx`). The S12 work-project lines remain with their holder; audit other message/session handling only.
- `server/routes/taskManagement.routes.ts`, `server/routes/taskBoard.routes.ts` and `server/services/tasking/` are the canonical existing task/message stores and access/audit boundaries. Nothing is reimplemented or bypassed.
- `surfaces/AuthoringCollab.tsx` already joins section rooms, reports server presence and reads/acquires/releases section locks on the one document editor. `server/routes/realtime-collab.ts` owns room scope, actor identity and lock admission. Existing tests `__tests__/authoringCollab.test.tsx` and `authoringCollabRoomUnknown.test.tsx` cover identity and room behavior. Audit asynchronous reads and local takeover state when a person changes the document/section; establish a real failing case before changing source.
- `surfaces/TaskBoard.tsx`, `TaskTray.tsx`, CommunicationCenter and related agency surfaces are held by the Wave B lanes in coordination. Do not edit those files.
- The actual app, current strict app_service/RLS fixture and existing test/browser infrastructure remain available. UI changes must be used in the running app; synthetic interception is labeled separately from real backend proof.

Searches: current registry/rail, task/messaging/collaboration names, clients/routes/services/tests, plan/ledger and file holders; `git log --all --diff-filter=D` for Task/Inbox/tasking/messaging paths found retired generations rather than a replacement to build. Extend what exists and retain all admission/signature/review controls.

## Bounded next step

Read-only audits find and reproduce a concrete defect in unheld collaboration files. Then record exact owned paths, retain a genuine failing regression before repair, and verify the existing UI. No external message is sent; fixtures are fictional. Leave OpenAI credential setup pending and make no provider call. Every completed change is committed and pushed directly to concept2cure-v2 through normal hooks.

## Reproduced defects and owned repair

The lock audit reproduced an armed S1 takeover/reason surviving navigation to S2; the next click actually sends takeover for S2 with S1's reason. The one editor reuses AuthoringCollab, so this is a real lifecycle seam, not a server authorization failure. The messaging audit reproduced loadDirectory returning the prior account's cached team/projects after canonical stored identity changes. The server still refuses cross-organization recipients; the stale client directory is the defect.

Own only `surfaces/AuthoringCollab.tsx` plus its focused regression, and CollabLauncher's directory/session code plus its focused regression. Preserve the S12 workProject lines and all Wave B held screens. Reuse existing session/read scope helpers after searching; do not add a second authentication or task store. Bind confirmation, pending read results and cached roster to their originating context. Retain positive controls including token refresh in the same actor scope and the existing roomKnown/partial-message behavior.

The repair reuses `editor/authoringCurrentRead.ts` for account/access/session ownership, `shellProject.ts` for project-visit ownership, and apiCall's existing current-owner overload. Existing authoringCollab and authoringCollabRoomUnknown test mocks preserve real authService exports, with their original assertions unchanged. No second authentication or request convention is introduced.

## Implementation and verification

The one editor's existing AuthoringCollab now keys presence, lock reads and takeover intent to the exact document/section/project visit and canonical account/access session. Retired reads/actions cannot repaint another target or publish old completion toasts. Overlapping lock reads use their existing callback path with an ownership generation. The normal room leave remains under the original same-session actor; identity replacement falls back to the server's documented idle TTL rather than sending an old-room leave as the new account.

The universal task/message launcher now owns directory caches, local task rows, context, forms and toasts by the existing account/access session. A retired directory response cannot replace the current roster. Late message/task responses cannot continue an optional task write or publish an old task into the replacement account. Ordinary token refresh and same-access user re-reads retain the current directory and form.

Genuine unit RED: lock/presence context 12 failures with 14 passing controls; directory/session 7 failures with 2 controls. Exact source/test snapshots and raw logs are compressed here. Combined final unit run: **66/66 across seven suites**, including both focused suites and existing roomUnknown, identity/lock, partial message receipt, project selection and task assignment controls. Scoped ESLint has zero errors and no added warnings: AuthoringCollab warnings decrease from 3 to 2; CollabLauncher retains 8, existing test mocks retain 4, new focused tests have zero. Both workers peer-reviewed the other's patch without blocking findings.

## Browser proof and limits

The real local app ran through npm run dev with the existing non-owner app_service/RLS profile. A fictional project, one unbound empty working document and two empty sections were created once through the canonical project/document/section APIs. No migration or seed script was run. The editor's normal section navigation reproduced the old takeover intent carrying to another section, then confirmed the fixed UI requires a fresh confirmation/reason. Lock/presence responses and every takeover request were intercepted: no real holder was displaced and no notification was sent. The old counterexample receipt deliberately uses mode red; its successful runner exit means it reproduced the defect, not that the old behavior was correct.

The account-switch browser check uses real local account A initialization and controlled synthetic account-B session/directory responses. The canonical frontend AuthService performs the transition. The previous recipient and message draft disappear, then the new roster is reachable. No message/task POST was forwarded. This checks the frontend session seam; it does not establish a real second-account backend authorization or cross-sponsor server qualification. Browser receipts have zero page errors. Screenshot capture waits for the modal animation; the dialog crop focuses on this tested seam.

Runner prerequisites: the existing app/Playwright/Chromium and a private C2C_LOCAL_STATE fixture directory. The fixture's nonsecret ids are in collab-browser-fixture.json; the required auth JSON stays private and is never committed. C2C_PLAYWRIGHT_MODULE can select an existing Playwright installation. The scripts block external requests and unrelated mutations. No provider call or OpenAI key configuration occurred.

Combined unit command:

```bash
npx vitest run client/src/concept2cure/v2/__tests__/authoringCollabContext.test.tsx client/src/concept2cure/v2/__tests__/authoringCollab.test.tsx client/src/concept2cure/v2/__tests__/authoringCollabRoomUnknown.test.tsx client/src/concept2cure/v2/__tests__/collabDirectoryContext.test.tsx client/src/concept2cure/v2/__tests__/collabMessageReceipt.test.tsx client/src/concept2cure/v2/__tests__/collabTaskOpenProject.test.tsx client/src/concept2cure/v2/__tests__/TaskAssignmentControls.test.tsx
```

The existing Tasks and Communication rail entries were observed in the running app. No screen, navigation entry, API route, service, table, dependency or model was added. Full compiler and canonical hook status are recorded in the final qualification checkpoint.

The full canonical compiler returned **0 errors / exit 0** with the existing zero baseline and Node22/12GB heap, before integrating incoming LicensingSurface/documentation-only continuation work. The normal push hook rechecks the merged TypeScript tree. Browser runners also have zero lint errors/warnings; no warning allowance was changed. qualification-status.json binds the verified six source/test files byte-for-byte.
