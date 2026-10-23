# Regression fixture corrections

Root's retained `regressions-first.txt` records 227 passing and seven failing tests across 25 files before these corrections.

## What already exists

- `accessRequestsHonestEmpty.test.tsx` checks the real access-request screen's empty-versus-answered-versus-failed-history distinction. `surfaces/AccessRequests.tsx` now says “feature” in the unchanged claim that nobody has asked; the fixture still expected “app”.
- `projectHomeLaunchScope.test.tsx` checks actual ProjectHome launch locks, Evidence intake and document-target navigation. The existing document list now calls `useAuth` and the auth service's session guards through `editor/CanvasDocumentList.tsx` / `editor/authoringCurrentRead.ts`; this older fixture supplied no auth hook provider.
- `railPiecesRehomed.test.tsx` checks Home's welcome and quick actions, and the real ConversationThread engine picker. Its old whole-module auth mock exported only `useAuth`, hiding `authService` required by the existing document list.
- `projectHomeSubmitStage.test.tsx` already demonstrates a partial auth-module mock preserving the real service while supplying provider hooks.

## Exact corrections

1. `accessRequestsHonestEmpty.test.tsx`: change only `NEVER_ASKED` from `/nobody has asked for an app yet/i` to `/nobody has asked for a feature yet/i`. All assertions about the answered-set read, failed history, empty state, AnA context and page framing remain.
2. `projectHomeLaunchScope.test.tsx`: add a partial `importOriginal` auth-module mock. Spread every actual export, supply `useAuth` / `useAuthUser` from the actual `authService.getUser()`, and leave the real service, current-revision guards and event subscriptions intact. No fake always-current guard, auth bypass, production change or weakening of launch/document assertions.
3. `railPiecesRehomed.test.tsx`: replace the incomplete whole-module mock with a partial `importOriginal` mock. Preserve the existing Dana display-name hook fixture and every actual service export, including `getUser`, `captureSessionReadGuard` and `on`. Existing engine/navigation assertions remain.

These are compatibility repairs to older regression fixtures. They do not change frozen workflow-discovery tests, production auth, ProjectHome, current-session guard semantics or assertion outcomes. This worker did not run tests, compilers or Git mutations; qualification is owned by root and recorded separately.
