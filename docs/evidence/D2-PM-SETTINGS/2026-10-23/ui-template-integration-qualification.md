# Authoring template-search merge: bounded PM-06 integration

The root normally merged incoming Authoring template search through `a2a34279f` at `819256673`. On the frozen merged tree, the UI agent repeated the existing bounded settings/Home/launch-scope cohort:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/ProjectSettings.test.tsx client/src/concept2cure/v2/__tests__/projectHomeSettingsHonesty.test.tsx client/src/concept2cure/v2/__tests__/projectHomeLaunchScope.test.tsx
```

Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, standard repository configuration. Result: **3 files, 43 cases passed**, exit 0, 19.67 seconds. Full output: `ui-template-integration.txt`; no stderr or React warnings were emitted. All 43 repeat the earlier integration cohort and add no distinct test cases to its count.

## Incoming scope review

Read-only Git diff confirmed seven incoming client source/test paths: four runtime files (`AuthoringAssemblyBuild.tsx`, `assemblyBuildState.ts`, `useAuthoringAssemblyBuild.ts`, `AuthoringTemplatePicker.tsx`) and three associated assembly/picker tests. No PM-06 source overlaps.

Assembly reuses the existing template picker with an assembly purpose, guarded search state in its existing controller bucket, loaded display metadata and the original exact template selection/preview path. Assembly offers no blank-document choice; existing creation callers retain the default creation purpose. Search and selection controls are disabled while held, loading or in unknown assembly state. The current actor/document/program visit guard also protects query changes. The incoming slice does not add a settings import, server catalog, permission grant, route, persistence model or agency coverage claim.

No actionable PM-06 interface conflict was found. The repeated tests reach actual settings requests/confirmation, ProjectHome metadata/activity refresh and launch destinations on the merged tree. They use synthetic API/auth/tenant fixtures and do not qualify the entire Authoring workflow or deployed-client acceptance.

## Retained upstream evidence verification

Evidence root: `docs/evidence/D2-ASSEMBLY-TEMPLATE-SEARCH/2026-10-23/`.

- `publication-source-freeze.json`: **64/64** declared repository pins match current bytes.
- `canonical-source-freeze.json`: **117/117** declared canonical pins match current bytes; the declared removed CapabilityBrowser path remains absent.
- `artifact-manifest.json`: **119/119** retained artifact byte counts and SHA-256 values match.
- All nine `qualification.json` canonical receipt hashes and their raw-gzip hashes match. Each receipt records exit 0 and no declared source drift. These cover the canonical UI replay, build and seven repository/editor/UI gates.
- The retained canonical UI log/receipt report **184 passed in 9 suites**. The earlier final editor log/receipt report **211 passed in 10 suites**. Their overlap is explicitly recorded upstream; these cohorts are neither added together nor claimed as rerun by this UI agent.

Upstream qualification keeps its publication/compiler receipt as a separate authority and records all 95 human checklist cases as Not run. No accepted-push or human-acceptance claim is inferred from these retained pre-publication checks. Root owns current combined build, whole-project TypeScript and normal publication gates.

Only this evidence and the bounded test output were written. No runtime/test edit, Git mutation, provider call, build or TypeScript run was performed by the UI agent.
