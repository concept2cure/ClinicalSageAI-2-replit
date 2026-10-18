# PR 148 targeted review

14 October 2026

[PR #148](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/148), “Phase 1+2: Bug fixes + Legacy route cleanup”, was merged on 16 March 2026 into main from concept2cure-v2. Reviewed PR head: 09a38edb070029a26cbdfc1203dfb290ff4c0108. Current study baseline: 87b27c897c5d1be20b0527009bcaf425ebbf3af6.

The PR changes 406 files, with 167,903 added and 13,153 deleted lines. This review covers the relevant workspace, coauthor, smoke-test, knowledge proxy, Vault and ingestion changes; it is not an exhaustive review of every changed file.

## Current issue carried forward from the PR

### P2 Recompute and validate local IVDR artifact digests before download

The historical Vault streamer returns the stored sidecar digest without hashing the file being streamed. Current LocalStorageProvider.get retains this behavior: it reads bytes and returns meta.sha256. IVDR pack download sends those bytes with X-Content-SHA256 from the returned metadata, without comparing the actual bytes with the expected pack artifact digest.

A restored, corrupted or replaced file can therefore be delivered with a checksum belonging to the original approved version. This contradicts the intended integrity contract for reproducible filing artifacts.

A fresh synthetic probe loaded the actual current provider source with types stripped; only the unused storage-provider import was removed. The original digest was written into metadata and different bytes into the file. The provider returned the changed bytes with the original digest. A request under another organization returned null, confirming that this reproduction does not bypass the current organization boundary.

Scope: current local provider and IVDR download path. Production requires durable storage; no claim is made that this fixture demonstrates corruption in a deployed tenant or verifies other storage providers.

Fix contract: verify actual byte digest and size against authoritative recorded expectations before serving. A mismatch produces a named integrity refusal, not an apparently valid file or an empty result. Retain the audit distinction between attempted and successful downloads. Test corrupted file, altered sidecar, wrong pack-version binding and valid artifact.

[Historical streamer](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/server/services/vaultService.ts#L153), [current local read](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/services/storage/local-provider.ts#L144), [current IVDR download](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/server/routes/ivdr-binder-routes.ts#L1001).

## Historical PR-head defects

### P1 Documents workspace renders before activeArtifact exists

ProjectWorkspaceShell creates openVerification with a dependency array containing activeArtifact before the const activeArtifact declaration. Evaluating that dependency array throws ReferenceError on render. This prevents the workspace from mounting even before a callback is clicked.

A local probe executed the original callback/dependency block in its recorded declaration order, with a useCallback stub and types removed. It reproduced “Cannot access 'activeArtifact' before initialization.” This is a declaration-order reproduction, not a live React browser run.

The historical component is absent from the current October tree. Do not apply a patch to a removed component; protect the replacement through authenticated workspace tests.

[Dependency read](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx#L599), [later declaration](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx#L718).

### P1 Advertised biotech smoke suite is excluded by the configuration

The PR adds biotech-modules.spec.ts but configures Playwright testMatch as **/*.e2e.ts. Default discovery therefore excludes the newly advertised suite. An explicit test filename does not change that match contract.

The current configuration includes both .e2e.ts and .spec.ts; this defect is fixed. The historical suite also uses same-origin checks that alone cannot prove the module remains inside the governed shell.

[Historical configuration](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/playwright.config.ts#L5), [new suite](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/tests/e2e/biotech-modules.spec.ts#L1), [current correction](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/87b27c897c5d1be20b0527009bcaf425ebbf3af6/playwright.config.ts#L7).

### P2 Regeneration leaves the selected section stale

The new drafting callback replaces section objects in docState. The child retains its selected DocumentSection object in local state, and the editor and Open in Editor callback still use that old object. After regeneration, outline state can change while the active editor and handoff retain the preceding content until reselection.

The historical coauthor component is absent from the current October tree. A replacement should resolve selection by stable ID from current state and test regeneration through save/reopen.

[Cached selection](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx#L757), [editor and handoff](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx#L839), [state replacement](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx#L996).

### P1 Project handoff can carry demo content without demo provenance

The historical project coauthor initializes its document state from DEMO_ECTD_DOCUMENT. The new shell handoff sends selected text into the project editor's document-creation path. Once the render blocker is corrected, unchanged hardcoded demo prose can enter a project artifact without a demo/source-origin marker in that handoff.

This is a source-supported historical path, not a claim of a client incident. The replaced components should not be treated as the current AnA governed authoring architecture.

[Demo initialization](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx#L958), [project handoff](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/ZenApp.tsx#L1564), [editor creation path](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/concept2cure/components/editor/EditorPanel.tsx#L308).

### P2 Retained CSR navigation targets removed routes

App.jsx retains CSR navigation entries whose matching routes were deleted. Those links fall through to the catch-all instead of the intended CSR surface. The current shell has been replaced; historical route targets do not establish current navigation behavior.

[Navigation](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/App.jsx#L271), [catch-all](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/client/src/App.jsx#L875).

## Historical CI and review evidence

GitHub records 35 checks for the final PR-head commit: 11 successful, 9 failed, 14 skipped and 1 cancelled. Failed checks include typecheck, Test, Integration Tests, setup, preview cleanup and GitGuardian. Danger success was not proof that all product or compliance checks passed.

The merge occurred at 01:22:05 UTC. GitGuardian completed with failure at 01:21:56 and one typecheck failed at 01:22:02; several other jobs completed after the merge. The GitGuardian comment reported 13 candidate secrets, including generic-password detections. This review did not retrieve credential values, validate their production use or claim that those findings remain open today.

Requested historical typecheck and Test logs return HTTP 410. Status is verifiable, but those job failure causes were not established.

[Checks](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/148/checks), [CI run](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/23124012332), [typecheck](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/23124012312/job/67163396416).

## Relevance to the Data Room improvement study

PR #148 is useful history, not the current platform baseline. Its rendering and demo smoke evidence do not establish scientific evidence validation or global filing readiness. The October study remains grounded in the newer pinned branch.

Add storage-read integrity verification to the processing/recovery workstream. Continue the original priorities: task-relevant version-bound passage selection, typed catalog facts with scientific context, computation-output lineage, dependency-triggered checks and qualified regional filing adapters.

No application changes, GitHub comments/reviews, commits, pushes or agency actions were performed. The two focused probes used local synthetic/source-derived fixtures; no full browser, database or production suite was rerun.

