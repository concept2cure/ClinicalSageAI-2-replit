# Post-discovery reporting reconciliation

Separate bounded verification on frozen merge `26a71d223ae20855157cc6cfed4214b47e7f74c3`, which includes canonical workflow discovery through `aef1b6a15`. This phase makes no implementation changes. The earlier 323/32 and post-API 335/33 evidence remain separate and retain their own source pins/results.

## What already exists

- `surfaces/AdminSurfaces.tsx`, `surfaces/WorkflowCatalog.tsx` and `catalogWorkflows.ts` own the existing live catalog and its workflow grouping. Incoming canonical work completes discovery there; it retains existing navigation IDs, launch locks, entitlement checks and governed writes.
- `Shell.tsx`, `registryModel.ts` and `shared/constants/ui-surface-registry*.ts` own the existing shell navigation and Workflows label. `shellNav.test.tsx` and `workflowDiscovery.test.tsx` already exercise this discovery/navigation behavior.
- The existing `Insights*` panels, reporting action hook and shared `apiCall.ts` remain the reporting implementation. `insightsLibraryReachesBackend.test.tsx` and `reportingLibraryRecovery.test.tsx` already exercise their route reachability, receipts, ownership and recovery contracts. This phase runs those controls alongside the incoming discovery/navigation tests rather than adding another catalog or workflow engine.

## Verified result

**115 tests passed across exactly four files**, exit 0, in **15.76 seconds**:

- `workflowDiscovery.test.tsx`
- `shellNav.test.tsx`
- `insightsLibraryReachesBackend.test.tsx`
- `reportingLibraryRecovery.test.tsx`

All **32** source/test hashes match before and after execution. Pins include the shared registries, Shell/navigation, catalog models/UI/styles, API normalizer, session owner, reporting implementation and four test files. Exact arguments, working directory, Node 22.22.0 and 4096 MiB heap appear in [command.json](command.json). [before-source-pins.json](before-source-pins.json) and [after-source-pins.json](after-source-pins.json) establish the tested source; lossless raw JSON/log gzip artifacts and their original/compressed hashes appear in [artifact-manifest.json](artifact-manifest.json).

A preliminary pin-capture setup used two incorrect TypeScript file suffixes. Its successful but unpinned test run is retained privately and excluded from this qualified result. The corrected 32-file pin capture preceded the separate execution reported here. No failure from that setup is described as product RED, and overlapping runs/results are not pooled.

These are fixture-backed component tests of discovery/navigation and reporting controls. They do not replace full application browser acceptance, hosted authentication, native database qualification or regulatory acceptance. No implementation edits, compiler/build, commit or push were performed by this agent in this phase; parent release gates remain separate.
