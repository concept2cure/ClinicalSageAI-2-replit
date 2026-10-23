# Incoming MDX project workflow compatibility

Separate bounded verification on merge `e8b11ce0c19bcbd64c1104c90cc442dfd1e13000`, preserving incoming canonical MDX project work through `62a8d5e7f`. This phase makes no implementation changes and does not repeat the full reporting/API integration. Prior phase results remain separate and are not pooled here.

## What already exists

- `surfaces/ProjectHome.tsx` is the existing verified project workspace. Incoming `ProjectMdxWorkflow.tsx` reaches the existing work-package compiler from that workspace; existing device/diagnostic feature destinations remain governed.
- `catalogWorkflows.ts`, `registryModel.ts`, `surfaces/WorkflowCatalog.tsx`, the shared surface registry and launch-scope constants already own workflow discovery, navigation and launch access. Incoming canonical work integrates the project workflow with these existing definitions rather than adding a separate MDX application in this verification phase.
- The reporting canvas/library controls, legal chooser, shared API/session helpers and reporting tests retain their preceding qualified source. All **55** hashes from the prior legal-chooser phase match before this run, including every reporting runtime/helper and its test files.

## Verified result

**135 tests passed across exactly seven files**, exit 0, in **23.82 seconds**:

- `workflowDiscovery.test.tsx`
- `registryModel.test.ts`
- `appsCatalogEntitlement.test.tsx`
- `ProjectMdxWorkflow.test.tsx`
- `ProjectHome.mdxWorkflow.test.tsx`
- `reportingLibraryRecovery.test.tsx`
- `insightsLibraryReachesBackend.test.tsx`

All **87** source/test hashes match before and after execution. The pins retain the prior 55 reporting files and the incoming core project/discovery UI, shared registry/launch-scope definitions, related source/tests and selected test manifest. [before-source-pins.json](before-source-pins.json) and [after-source-pins.json](after-source-pins.json) record that identity. [command.json](command.json) records the exact command, working directory, Node 22.22.0 and 4096 MiB heap. Lossless raw JSON/log gzip artifacts and original/compressed SHA-256 values appear in [artifact-manifest.json](artifact-manifest.json).

These are fixture-backed component and request tests of the selected project/discovery/reporting boundaries. They do not establish hosted acceptance, native database behavior, live approved-model acceptance or global regulatory qualification. No implementation edits, other test jobs, compiler/build, commit or push were performed by this agent; parent release gates remain separate.
