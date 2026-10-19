# Honest-state review: commit e1f3fd425, 48 client surface files

Reviewed at HEAD `9795a1e1e` on `concept2cure-v2`. The working tree was clean before and after. 249 commits have landed since e1f3fd425, and 9 scope files changed after it, so every finding below was re-read at HEAD.

The landing added no fixture or sample data. There are 6 confirmed findings and 1 plausible. Three of the confirmed ones come from the landing and three predate it.

## Findings

**F1. A recorded agency receipt's outcome is erased by the refresh it triggers.** Medium, introduced by e1f3fd425, CONFIRMED by execution.
- **Where:** `As2ReceiptUpload.tsx:39-44` sets the outcome and then runs `await onRecorded()`. `GatewayTransmittals.tsx:482` passes the log's `load` as `onRecorded`. `load` calls `setState('loading')` at `:246`. `:461` swaps the table for a loading panel, which unmounts every row and the uploader with it.
- **What fails:** The outcome sentence never survives the reload.
- **What the user sees:** The form vanishes and the table reloads. A status chip changes (the server writes `received` or `rejected`, `fda-esg-receipts.ts:86`). None of these sentences appear:
  - "FDA transport rejected the submission. Review the agency receipt before correcting it."
  - "This receipt did not reconcile a sequence attempt; review the original transmission record."
  - "FDA center acceptance is a separate acknowledgement."
- **What they wrongly conclude:** That recording the receipt also resolved the sequence's dispatch state, and that `received` means FDA accepted it. The unreconciled warning is shown nowhere else.
- **Evidence:** I mounted the real `GatewayTransmittals` and returned a server answer of rejected plus unreconciled. With an instant mock the text survives, because React batches loading and ready into one render. With a 100 ms reload (any real network) all three sentences are gone.
- **Test gap:** `as2ReceiptUpload.test.tsx` only mounts the component alone with a no-op `onRecorded`.

**F2. Review stage: a partly unread work view with nothing in the readable stores renders as "No tasks or approvals on this program".** Medium (narrow precondition), earlier (line present since `ee05edc1e`, 2026-10-08), CONFIRMED by execution.
- **Where:** `ProjectHome.tsx:898` (`isEmpty` ignores `summary.partial`), and `Anchored` at `:193-196`. The "could not be read" warning sits at `:941`, inside `render`, which an empty list skips.
- **What fails:** `loadUnifiedWork` degrades a failed source to `ran:false` and an empty contribution (`unified-work-view.ts:395-412`), so the response can be `items:[]` with `partial:true`.
- **What the user sees:** The empty state, with no warning.
- **What they wrongly conclude:** That no approvals are waiting on them, when one of four stores was unread.
- **Related:** The landing's own `MissingRequestedWork` (`:2018`) words this state correctly, so the two now disagree.
- **Test gap:** `projectHomeReviewWork.test.tsx` covers partial with an item and empty without partial, but not `work([], partial=true)`.

**F3. Task board: the same shape.** Medium (narrow precondition), earlier (ordering since `cc9dfbafa`, 2026-10-01), CONFIRMED by execution.
- **Where:** `TaskBoard.tsx:891` tests `liveTasks.empty` before the unread-stores banner at `:936-940`. `useLiveRows.empty` (`dataConnect.tsx:452`) ignores `meta.partial`.
- **What fails:** The board route can return `data:[]` with `meta.partial:true` (`taskBoard.routes.ts:509`).
- **What the user sees:** "No tasks on the board yet … appears here once it is persisted", with no mention of the unread store.
- **What they wrongly conclude:** That the organisation has no tasks.

**F4. The transmittal log is a silent 100-row page, and its count is presented as the total.** Low, earlier, CONFIRMED by execution; real impact depends on volume.
- **Where:** `mdx-submission-gateway.ts:202` (`limit = 100`) and `:226` (`count: rows.length`). The client ignores `meta` and shows `rows.length` at `GatewayTransmittals.tsx:443`. AnA is told "N transmittal(s) recorded for this organisation" at `:338` and `:342`.
- **What the user sees:** With 100 rows returned, the header reads "100" and nothing says it is a page.
- **What they wrongly conclude:** That the log is complete. The screen's own comment calls this "the table an operator reads to confirm what has or has not already been sent to an agency". The landing's linked-transmittal pin shows the authors know the read may not carry a row.

**F5. The protocol empty-state title ignores the selected scope.** Low, introduced by e1f3fd425, CONFIRMED by execution.
- **Where:** `ProtocolDev.tsx:174` builds the title from the open program only. `:277` passes no scope to `ProtocolEmptyState`.
- **What fails:** Scope now defaults to the open program and can be "Unfiled protocols" or "All" (`ProtocolDev.tsx:196`, `ProtocolDevSelection.tsx:60`).
- **What the user sees:** With scope = Unfiled and a program open, "No protocol in development for BX-256". With no program open, "No protocol in development yet".
- **What they wrongly conclude:** That BX-256 or the organisation has no protocol. The zero belongs only to the unfiled set. The AnA context string is scoped correctly; the visible title is not.

**F6. NDA cockpit BLA table still says "none have been run" right after the embedded workbench saves one.** Low (latent: `nda-cockpit` is in no launch app), introduced by e1f3fd425, CONFIRMED by execution.
- **Where:** `NdaCockpit.tsx:213` reads the list once, with no refresh key. `:756` mounts `<BlaAssessmentWorkbench />` with no props, and its refresh counter is private (`BlaAssessmentWorkbench.tsx:39`). The empty state is at `:803-804`.
- **What the user sees:** "Draft saved. Read its recorded inputs and result before signing." with "No 351(a) biologics assessments have been run for this organization yet" directly below, until the cockpit reloads. The probe showed one table read, two workbench reads, and the server holding the row.
- **Also:** The table ignores `pendingStore`, which the workbench handles. That part predates the landing.

**F7. A transport failure on writes is worded as "the request didn't reach the server".** Low, PLAUSIBLE (not reproduced).
- **Where:** `apiCall.ts:100` appends that clause on any transport failure. The landing routes these writes through it:
  - package-run start, resume and release signature (`OrchestratorRunControls.tsx:25-29`, `:75`, `:91`, `:110`);
  - study-design persist (`ProtocolDevCreateDesign.tsx:46`).
- **Why it matters:** A response lost after commit is reported as non-delivery. The same landing fixed the identical wording in `IdentityConsole.failText`, so this is the straggler.

## Examined and honest

- **Uncertain commits:** AdminAccess revoke, AdminApiKeyCreate, IdentityConsole, ConversationFilesAdopt, SafetyNarrative, VaultCatalogRecord and ProtocolDevCreateDesign each separate refused from unconfirmed and block a blind retry. The server codes they key on exist (`API_KEY_COMMIT_UNCONFIRMED` in `api-key-service.ts` and the api-keys route).
- **Strict guards vs servers:** The landing's new guards match the real server contracts. I checked CmcRegisterLinks, CsrNarrativeReadiness, `invitations/mine`, `/organizations`, the catalog record, conversation-files `window`, sources `fileUploadId`, BLA save, IVD save and `limitReached`. None is permanently failing or dead, so there is no HS-0928-1 repeat.
- **Denominators:** Exact counts or disclosed caps in `ProjectHome` (`hiddenOpen`), `completedSummaryCount`, conversation files, CSR sources, and the board (uncapped).
- **Preserved guards:** `ProtocolDev` kept the row-shape guards (`isIndex` and `isDocument`) from the old `isProtocolReadModel`.
- **Other checks:**
  - `NotificationPreferences` matches the delivery query (`COALESCE(…, true)`) and its "email and push not available" claim is true.
  - BLA and IVD forms record blank as unrecorded.
  - EctdCompile handles the new run statuses, and skipped still differs from complete.
  - The CMC filing-path simulator deletion removes browser-invented filing categories.
- **V2App:** Refusals are surfaced through `onFailed`.
- **Fixtures:** I grepped the landing's added lines in all 102 touched non-test client files for fallback shapes the detector misses (UPPER_CASE constants after `??`/`||`, state seeded with object arrays). I found nothing. `fixtures/protocol-data.ts` now exports types only.

## Instruments run

| Check | Result |
|---|---|
| `check-ungated-fixture-fallback.mjs --list` | 0 findings, 0 baselined |
| `ci:internals-in-copy` | clean |
| `check:microcopy` | clean, 592 files |
| `ci:launch-scope` | clean, 28 surface files |
| `hostilePayloadProbe` (17 surface ids my files implement) | 18/18 |
| Vitest on 176 related and `*Honest*` files | 172 pass, 4 fail (17 tests; see below) |

- **Detector blind spots:** On a synthetic tree the detector caught 3 of 9 fallback shapes: `?? FIXTURE_/SAMPLE_` and a ternary on a `data/` import. It missed `?? STARTER_`, `?? EXAMPLE_`, `|| FIXTURE_`, an inline `?? [{…}]`, a ternary on a non-`data/` import, and a state seed. Its zero here means "no prefixed fallback", not "no fixture". The landing added nothing in any of those shapes.
- **Prior items:** HS-1008-1 is fixed at HEAD (`Insights.tsx:517-527` and `:1136-1141`). HS-1008-2 is server-side and not re-verified.

## Seen at HEAD, outside the landing's code

- **Authoring's honest-read tests are dark.** All 13 tests in `documentAuthoringHonestReads.test.tsx` error at mount. Its `vi.mock('@/services/portal/authService')` (`:27`) has no `authService`, and `useAuthoringAssemblyBuild.ts:24` now calls `authService.getUser()`. That hook arrived in `ad372567d` at 23:30Z, after the landing at 23:02Z. Until fixed, those assertions cannot turn red.
- **Four more red tests are stale expectations created by the landing:**
  - `anaDrivesWave5` and `specialistHandoffInteraction` still look for the deleted change simulator.
  - `protocolReviewerNameReadOnly` (2 tests) predates the `onDone(kind, receipt)` signature change.
- **Outside my lens:** Deleting the CMC change-to-Authoring handoff leaves its replacement, `CmcVariationAssessment`, reachable only when `launchScopeEnforced === false`. CLAUDE.md requires a reachable replacement or a founder decision for that.

## Coverage

All 48 diffs were read in full.

**Deep** (whole file or whole changed region at HEAD, plus server contract or an executed check):
- Components: As2ReceiptUpload, OrchestratorRunControls, CsrNarrativeReadiness, CsrSourceInputControls, CmcRegisterLinks, CmcVariationAssessment, ConversationFilesAdopt, BlaAssessmentWorkbench, IvdAssessmentWorkbench, AssessmentWorkbenchKit, NotificationOpenButton, NotificationPreferences, OrganizationAccess, TrackedFilingDetail.
- Protocol files: ProtocolDev, ProtocolDevSelection, ProtocolDevCreateDesign, ProtocolDevFileProgram.
- Others: AdminApiKeyCreate, GatewayTransmittals (diff plus HEAD `:245-253` and `:322-500`), NdaCockpit (HEAD `:200-230` and `:750-815`), ProjectHome (HEAD `:170-198`, `:880-950`, `:2018-2030`), TaskBoard (HEAD `:300-420` and `:870-945`), CmcModule (full 559-line diff plus `CmChange` at HEAD), SafetyNarrative (changed regions).

**Diff plus targeted HEAD context** (not read end to end):
- EctdCompile (status and run render), TaskTray, V2App (`refuse` path), AdminAccess, navEntitlements, GatewayAccountsSetting, SubmissionSeqWorkspaces, InsightsCatalogPanel and insightsLibraryShared (plus the count test), Insights (the 2-line diff and the catalog flow), VaultCatalogRecord, cmcRegisters, QualityModule.

**Diff only:**
- GlobalMutationErrors, Shell, SubmissionCenter, UsageBilling, AuthoringCollab, AuthoringCreateExport, IvdCompleteness, ProtocolDevDesign, ProtocolDevForms, IdentityConsole.

**Not opened:** none of the 48. These large files were not read end to end, only the landing-changed regions and the branches around them:
- CmcModule (3,038 lines), Insights (2,176), SubmissionSeqWorkspaces (2,141), SubmissionCenter (2,119), cmcRegisters (2,067), ProjectHome (2,027), TaskBoard (2,014), EctdCompile (1,827), V2App (1,350), NdaCockpit (815), SafetyNarrative (678).

**Opened outside the 48, read for contract only, not reviewed:**
- Server routes: the BLA, IVD, gateway, orchestrator, CSR, tenant-users, notifications, api-keys, vault-catalog, task-board, unified-work and insights-canvas routes.
- Client and shared files: `dataConnect.tsx`, `apiCall.ts`, `queryClient.ts`, `BlaAssessmentInputs.ts`, `launch-scope.ts`.
- `DocumentAuthoring` and the quality app: tests only.

## Files are in /tmp/claude-0/-home-user-ClinicalSageAI-2-replit/df678b90-6e5c-570f-95c8-b0431c63411d/scratchpad/
- `probe/`: `as2-outcome.probe.test.tsx`, `nda-stale.probe.test.tsx`, `protocol-scope.probe.test.tsx`, `projecthome-partial.probe.test.tsx`, `taskboard-partial.probe.test.tsx`, `gateway-cap.probe.test.tsx`, `vitest.probe.config.ts`.
- Each probe asserts the honest expectation, so it fails while the defect exists.
- To re-run one: `npx vitest run --config <scratchpad>/probe/vitest.probe.config.ts <name>`.
- Logs: `probe-as2b.txt`, `probe-batch.txt`, `probe-batch2.txt`, `probe-gwcap.txt`, `probe-hostile.txt`, `vitest-related.txt`.
