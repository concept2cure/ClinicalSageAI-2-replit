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
