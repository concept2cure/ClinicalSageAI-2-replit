# Workflow discovery merge: bounded PM-06 integration

After the root normally merged incoming workflow discovery through `ecc153941` at `295bacc11`, the UI agent ran this focused cohort against the frozen integrated source:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/ProjectSettings.test.tsx client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx client/src/concept2cure/v2/__tests__/projectHomeLaunchScope.test.tsx
```

Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, standard repository configuration. Result: **3 files, 43 cases passed**, exit 0, 18.74 seconds. Full output: `ui-workflow-integration.txt`; no stderr or React warnings were emitted. The 39 settings/Home settings cases repeat prior qualification; the four LaunchScope cases are the additional bounded coverage, not 43 new settings cases.

## Read-only interface review

- The incoming `navEntitlements.tsx` diff changes human wording. Entitlement decisions, lock branches, requestability and CTA destination IDs remain the existing ones. ProjectHome still imports its existing `useSurfaceAvailable` predicate; no new catalog grouping grants project-settings write access.
- `ui-surface-registry.ts` changes the `apps` display label to Workflows. The `apps`, `projects` and `project-home` identities and routing remain intact. Rail/account labels point to the same `apps` destination.
- Home's `Surfaces.tsx` discovery button now calls `onNav('apps')`. `surfaceViews.ts` continues resolving `Apps` through `AdminSurfaces.tsx`; that module reexports the single implementation from `WorkflowCatalog.tsx`.
- `catalogWorkflows.ts` presents existing live feature rows through existing `LAUNCH_APPS` composition. It retains original row IDs and backend group indices for governed switches; unclassified rows remain under Additional capabilities. This helper is not imported by ProjectHome or its settings request path.
- The incoming ProjectHomeLaunchScope change only supplies provider hooks backed by the real auth service, retaining its current-session guards and all four existing assertions. The run still verifies Respond/Submit do not offer locked tools, the source tracer stays unavailable and a CTD module opens the existing document authoring destination.

No actionable PM-06 conflict or changed settings authority contract was found in this bounded review. ProjectHome settings remains in the current header, and the existing governed read/write/session/receipt checks are exercised by the 39-case retained settings cohort.

## Incoming qualification retained

`docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/root/ref-race-inputs.json` contains 71 source/configuration SHA-256 pins. All **71/71** match the integrated working tree; its declared deleted paths remain absent. The retained upstream `root/ref-race-tests.txt` reports **502 tests passed in 46 files**; `root/ref-race-test-result.json` records exit 0 and `selectedInputsUnchanged: true`. That broader qualification is retained, not represented as a new run by this UI agent or as a clean-stderr claim.

The bounded integration uses synthetic API/auth/tenant fixtures and an existing mocked launch verdict, so it does not establish deployed-client acceptance or backend authorization. Root separately owns the final combined build, TypeScript checks and normal publication gates. This review used explicitly authorized read-only Git diff commands; no Git mutation, source/test change, provider call, build or TypeScript run was performed by the UI agent.
