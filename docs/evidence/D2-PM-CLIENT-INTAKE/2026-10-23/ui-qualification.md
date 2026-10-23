# UI and shared wire qualification

## What already exists

The inventory and frozen contract are in [contract.md](contract.md). This work extends `NewProjectWizard` in the existing `Projects.tsx`, the existing `apiRequest` and `capturedActorHeaders` request path, the existing project publication helper, and the existing wizard styling. It does not create a separate workspace directory, store, permission model or project surface.

## Implemented behavior

- Configure reads `/api/clients?purpose=project-intake` with the captured actor/organization. The complete directory envelope is checked for matching scope, active organization-owned workspaces, unique positive IDs and actual names.
- A single verified workspace is visibly recorded. Multiple workspaces start unselected; the global selected client is never used as intake intent. Configure and Review name the selected client.
- Create refreshes those facts, refuses a changed/unavailable selected workspace, and sends the explicit numeric `clientWorkspaceId` with the matching `x-client-id` header.
- Publication/navigation requires a 201 receipt with the real program UUID, integer anchor, created flag, matching actor/organization and exact selected workspace ID/name. There is no fabricated `id: 'new'` fallback.
- Account/organization changes reset the entire keyed wizard. Captured bearer checks also run after asynchronous reads/writes and immediately before publication; stale replies retire the view and cannot publish or navigate.
- Transport, 5xx and malformed successful replies block Create and automatic retry, offering Check projects. A confirmed save whose details are unavailable is stated as created. Confirmed 4xx refusals can retry only through another fresh workspace read. Filing-not-offered recovery and the scaffold advisory remain reachable; a confirmed advisory cannot create a duplicate.

## Verification

- [ui-fail-first.txt](ui-fail-first.txt): the new explicit multi-workspace acceptance case failed against the original wizard because the Client workspace control did not exist. One targeted failure; 16 cases skipped in that first run.
- [ui-scoped-final-110.txt](ui-scoped-final-110.txt): 11 files, 110 passing tests. This includes all nine existing wizard/discovery suites (71 cases), the new workspace suite (21 cases), and the shared wire suite (18 cases). No React stderr was emitted in this run.
- The final dedicated workspace rerun additionally checks actual shell publication for confirmed creation, absence of publication for malformed/stale receipts, and disabled Create after unknown outcomes. Its log is retained as `ui-publication-final-21.txt`.
- [ui-eslint-final.txt](ui-eslint-final.txt): zero errors; seven warnings remain in the existing large Projects surface. New helper, wire guard and tests have no warnings. Root owns the repository-wide warning comparison.

The UI tests use synthetic authenticated actor/organization fixtures, real captured-token checks, the actual bounded request helper, actual wire guards, and real wizard selection/review controls. The legacy filing/discovery suites receive a route-aware active-workspace response and scoped successful receipts while their existing endpoint doubles retain the behavior each suite examines. The dedicated workspace cases do not mock away the chooser or the scope guards. Real HTTP, native PostgreSQL/RLS, browser, build and whole-program TypeScript qualification are root/backend-owned and recorded separately; these unit results do not claim those checks.

## Final source scope

- `shared/project-intake-workspace.ts`
- `shared/__tests__/project-intake-workspace.test.ts`
- `client/src/concept2cure/v2/surfaces/Projects.tsx`
- `client/src/concept2cure/v2/surfaces/projectIntakeRequest.ts`
- `client/src/concept2cure/v2/__tests__/projectIntakeFixture.ts`
- `client/src/concept2cure/v2/__tests__/newProjectWizardWorkspace.test.tsx`
- Existing suites: `newProjectWizardName`, `newProjectWizardFailure`, `newProjectWizardNotOffered`, `newProjectWizardRegulatedChoices`, `newProjectWizardRegionalDevices`, `newProjectWizardEuDeviceClasses`, `newProjectWizardPredicatePair`, `newProjectWizardCrossLaneSearch`, and `projectDiscoveryHandoff` (`.test.tsx` in the same test directory).

No new CSS, dependencies, schemas, stores, routes, provider calls, notifications or Git operations were introduced by the UI workstream. The exported browser/component interface remains `NewProjectWizard({ onClose, onNav, segment? })`, under the existing auth and tenant providers.

## Pending-create exit cross-review correction

Backend cross-review found that Cancel, the Projects breadcrumb and Escape could unmount the wizard while creation was pending. Reopening would discard the unresolved outcome. The existing wizard now guards all three exits with the same synchronous pending ref used to refuse a second Create, while showing Cancel and the breadcrumb as disabled during creation. The ref is released in `finally`; settled refusal/unknown outcomes retain their normal way out, and confirmed creation still closes and navigates. Account/organization retirement remains authoritative. No persistent store or global navigation/unload interception was introduced.

- [ui-pending-exit-fail-first.txt](ui-pending-exit-fail-first.txt): all three new deferred-create exit cases failed before the fix. Cancel/breadcrumb exercised a pending POST; Escape also exercised the same-turn preflight boundary.
- [ui-pending-exit-final.txt](ui-pending-exit-final.txt): 34 tests passed in the workspace and failure suites, including all three actual Host unmount/reopen regressions, eventual unknown-outcome recovery through Check projects, bearer retirement, existing Escape/focus behavior, confirmed refusals and scaffold notice behavior. The workspace suite now has 24 cases.
- [ui-pending-exit-eslint.txt](ui-pending-exit-eslint.txt): zero errors, with the same seven existing Projects warning categories; no test warning. Root owns the final build/browser/TypeScript and warning comparison after this correction.
