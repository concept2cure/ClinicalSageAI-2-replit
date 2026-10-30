# Existing catalog read recovery

## What already exists

`client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` owns Subscription & features, the real catalog/subscription reads, search, feature grouping and governed toggles. `dataConnect.tsx` owns dependency-triggered `useLiveData`, effect cancellation, payload checks and shared error/retry controls. `queryClient.ts` owns authenticated transport. This correction reaches those existing retry controls; no global hook, transport, session store, route or AnA bus action is introduced.

## Reproduction and correction

The original mounted screen could not retry a failed catalog or subscription read. `red.log.gz` records **10 failed / 1 passed** before production edits; each failure found the missing recovery control. `red-inputs.sha256` pins the original production/test inputs; `red-test.tsx.gz` retains that exact test source.

The surface now uses independent manual read epochs through the existing hooks. Per-read refs reject repeated clicks before the hook publishes loading, and reset on an actual hook result so an identical repeated failure stays recoverable. Existing loading states replace the controls while each request is pending. Retrying one endpoint does not reread the other or dispatch a governed write. Search and the mounted feature state remain in the same component.

A catalog without its required payload (including null/204) is locally unavailable; a genuine `{ modules: [] }` remains empty. The same unavailable predicate supplies the existing AnA summary/admin-handler refusal. Shared null/204 reader behavior is unchanged. Missing or malformed subscription details recover through the existing fallback, with its billing-navigation control retained.

## Checks and limits

- `green.log`: **38 passed / 4 suites**, comprising the initial 11 recovery cases and existing `appsLive`, `appsCatalogEntitlement` and `workflowDiscovery` suites. This includes existing governed toggle/reason behavior.
- `green-final.log`: **12 passed / 1 suite** after splitting the test groups to avoid a new lint warning and extending identical-refailure coverage to both independent reads. Counts overlap and must not be added. `green-final-inputs.sha256` pins these final inputs.
- `lint-before.log` and `lint-final.log`: **0 errors**, the same three existing source warnings; the new test has no warnings. The source's existing function-size/complexity values increased within those warnings. Intermediate `lint.log` is retained separately.
- The tests exercise the actual surface, shared hooks/shape processing and shared recovery controls, mocking only canonical `apiRequest`. They cover loading, duplicate clicks, independent GETs, repeated refusal/success, malformed/absent payloads, true empty state and search preservation.

These checks do not establish hosted incident cause, browser/native-database acceptance or account/session read ownership beyond existing hooks. Full compiler, build, broader integration and canonical publication belong to the root session. No Git, dependency, build or compiler mutation was performed by this worker.
