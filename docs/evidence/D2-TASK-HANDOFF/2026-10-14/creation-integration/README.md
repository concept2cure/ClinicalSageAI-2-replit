# Creation ledger and exact task handoff

The existing creation ledger now registers with the existing surface leave guard. Closing the creation form cannot discard a pending or unknown document/section outcome when an assigned task is opened. HTTP 408 remains unknown. A definite refusal or validated created receipt releases the relevant entry; confirmed receipt callbacks retain their existing behavior.

Recovery releases unknown only after both the scoped record read and the current native host refresh are explicitly verified. Missing/false host acknowledgement, failed or foreign-scope host reads, a pending refresh, and a late prior-context result preserve the guard. This connects existing infrastructure; it adds no route, store, authentication framework or server behavior.

## Evidence

- Initial combined integration: 9 failures and 4 passing controls before the ledger/leave-guard connection.
- Actual DocumentAuthoring/Workbench refresh: both selected 503 cases failed before the native host repair, then passed. Two additional foreign-scope host cases are included in the final run.
- Explicit host result contract: all four absent/false acknowledgement controls failed before requiring `true`.
- Final replay: **203 tests passed in 6 files**, zero failures/skips, 28.53 seconds. Counts and exact source fingerprints are in [phases.json](phases.json). The original 81 creation recovery cases and assertions are preserved; their successful-host fixture now explicitly returns `true`, and four controls are appended.
- Four owned source/test files: **0 ESLint errors, 0 warnings**.

The final command used Node 22 and `npx vitest run --config vitest.config.ts` with the six paths listed in `phases.json`, verbose and JSON reporters. Full outputs are preserved with deterministic gzip compression, alongside failing-first logs and the original hook/test snapshot. Existing React act warnings in the final log belong to unchanged CreateExport/Tray legacy tests; the new combined test has no stderr entry.

The client integration executes native components with synthetic authenticated transport and fixture accounts. It does not qualify a live write, deployed login/MFA, native PostgreSQL, official TypeScript/build, or a hosted CI run. The browser artifacts in this directory are root-owned: their harness explicitly simulates a successful host refresh; actual host failure/malformed handling is covered by native-component tests. Existing host authentication ownership remains authoritative.
