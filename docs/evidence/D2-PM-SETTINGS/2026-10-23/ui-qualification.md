# PM-06 settings UI qualification

Source and test files were frozen after the final human-readable confirmation target change and the bounded parent-suite auth fixture correction. The UI scope is the existing ProjectHome header, a lazily opened inline settings panel, and the canonical governed confirmation dialog. Only description, priority and recorded target submission date can be changed.

## Retained runs

All runs used Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, and the repository's standard Vitest/ESLint configuration. These are separate executions, not one aggregate test run.

| Evidence | Result | Scope |
| --- | --- | --- |
| `ui-fail-first.txt` | 1 failed, 1 explicitly filtered/skipped | Before implementation, the evolved ProjectHome test could not reach a `Project settings` button. |
| `ui-legacy-noop-fail-first.txt` | 1 failed, 35 explicitly filtered/skipped | Before the final no-op correction, an unedited legacy description containing surrounding whitespace incorrectly enabled review. |
| `ui-settings.txt` | 2 files, 39 passed | Final integrated source: 36 dedicated ProjectSettings cases and 3 actual ProjectHome integration cases. Duration 15.50 seconds. |
| `ui-retained-companions.txt` | 4 files, 56 passed | Final integrated source: ProjectHome Submit stage 33, ProjectTeamSharing 9, TaskAssignmentControls 12, ProjectHome stage CSS 2. Duration 12.31 seconds. |
| `ui-parent-regressions-before-auth-fixture.txt` | 4 files, 34 failed | Retained diagnostic: all cases stopped before assertions at the existing CanvasDocumentList auth hook because the standalone fixtures supplied no AuthProvider/useAuth fixture. |
| `ui-parent-regressions.txt` | 4 files, 34 passed | Final integrated source: ProjectHome TeamSetup 5, TeamResponsibilities 12, IdentityFacts 7, Readiness 10. Duration 17.32 seconds. |
| `ui-lint.txt` | Exit 0; no output, 0 errors/warnings | Both new runtime TypeScript files and all three touched test files. |
| `ui-parent-regressions-lint.txt` | Exit 0; no output, 0 errors/warnings | Four additional ProjectHome fixtures. |

The final three test runs above were executed sequentially after the root integrated `9f8cae7f0`; they cover 129 UI cases across 10 distinct files. Prior passing logs are retained with the `-before-final-integration.txt` suffix. The parent regression log includes five React `act(...)` warnings: four emitted around the two actual-auth-service account/organization change actions and one from the existing Readiness retry click. These are retained in full and are not represented as assertion failures or lint diagnostics.

Final focused command:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/ProjectSettings.test.tsx client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx
```

Retained companion command:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/projectHomeSubmitStage.test.tsx client/src/concept2cure/v2/__tests__/ProjectTeamSharing.test.tsx client/src/concept2cure/v2/__tests__/TaskAssignmentControls.test.tsx client/src/concept2cure/v2/__tests__/projectHomeStageCss.test.tsx
```

Additional parent command:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/projectHomeTeamSetup.test.tsx client/src/concept2cure/v2/__tests__/projectHomeTeamResponsibilities.test.tsx client/src/concept2cure/v2/__tests__/projectHomeIdentityFacts.test.tsx client/src/concept2cure/v2/__tests__/projectHomeReadiness.test.tsx
```

Scoped lint command:

```sh
npx eslint client/src/concept2cure/v2/surfaces/ProjectSettings.tsx client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts client/src/concept2cure/v2/__tests__/ProjectSettings.test.tsx client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx client/src/concept2cure/v2/__tests__/projectHomeSubmitStage.test.tsx
npx eslint client/src/concept2cure/v2/__tests__/projectHomeTeamSetup.test.tsx client/src/concept2cure/v2/__tests__/projectHomeTeamResponsibilities.test.tsx client/src/concept2cure/v2/__tests__/projectHomeIdentityFacts.test.tsx client/src/concept2cure/v2/__tests__/projectHomeReadiness.test.tsx
```

## Assertions and boundaries

The dedicated suite reaches the actual component, canonical confirmation dialog, request helper, session ownership helper and shared wire guards. Route-aware synthetic API responses cover lazy reads, the three editable fields, null clearing, read-only capability, actual differences only, reason bounds, verified GET workspace binding for PATCH, malformed scope/data, stale revision, access withdrawal, uncertain writes, malformed/audit/foreign/changed-field receipts, pending close/Escape protection, stale same-frame handlers, account/role/organization/workspace/program/token retirement, and ordinary same-account token refresh. Uncertain or stale writes stay blocked across panel collapse until an explicit verified reload. A reload reads current facts; it does not prove an earlier uncertain write or audit.

The final no-op case verifies no automatic whitespace change is proposed for a legacy description that the person has not edited. The final confirmation assertion verifies human field labels and current-project context instead of a raw program identifier.

The ProjectHome integration suite mounts the actual header control and actual settings component. A verified save rereads project metadata and activity once while preserving the selected workflow stage; it does not navigate to the portfolio. The retained Submit suite only needed a current-tenant mock for the newly reachable authenticated header; its existing 33 assertions were retained.

The four additional parent suites retain every existing assertion. Their fixture corrections provide `useAuth` and `useAuthUser` from the actual `authService.getUser()`, seed a matching current JWT/user using actual `authService.setToken`, supply the current tenant scope, and end that actual session during cleanup. TeamSetup now changes accounts/organizations through actual `setToken` as well. CanvasDocumentList, ProjectSettings, session ownership helpers and current-response guards remain real; no production behavior was changed to accommodate the fixtures.

These frontend runs use synthetic auth/tenant/API fixtures and do not establish production database, provider, deployment or publication behavior. Backend/native, browser widths and screenshots, production build, whole-project type checking and final publication are qualified separately by the root agent. This UI adds no persistent cross-reload write reconciliation or idempotency store.

## Owned source list

- `client/src/concept2cure/v2/surfaces/ProjectSettings.tsx`
- `client/src/concept2cure/v2/surfaces/projectSettingsRequest.ts`
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` — header mount and metadata/activity read epoch only.
- `client/src/concept2cure/v2/styles/project-settings.css`
- `client/src/concept2cure/v2/__tests__/ProjectSettings.test.tsx`
- `client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx`
- `client/src/concept2cure/v2/__tests__/projectHomeSubmitStage.test.tsx` — current-tenant fixture only.
- `client/src/concept2cure/v2/__tests__/projectHomeTeamSetup.test.tsx` — current-auth fixture and actual session changes only.
- `client/src/concept2cure/v2/__tests__/projectHomeTeamResponsibilities.test.tsx` — current-auth/tenant fixture only.
- `client/src/concept2cure/v2/__tests__/projectHomeIdentityFacts.test.tsx` — current-auth/tenant fixture only.
- `client/src/concept2cure/v2/__tests__/projectHomeReadiness.test.tsx` — current-auth/tenant fixture only.

No Git, provider calls, schema/dependency changes, whole-project type checking, production build or warning-ratchet runs were performed by the UI agent.
