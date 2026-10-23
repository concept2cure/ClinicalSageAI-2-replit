# Existing reporting canvas: current-session completion

Workstream W1, launch row D2. Design: `docs/design/REPORTING_CURRENT_ACCESS_COMPLETION_2026_10_23.md`. Sources were reviewed at `dd749f3e5` after the latest company/legal report-pack integration.

## What already exists

`client/src/concept2cure/v2/surfaces/Insights.tsx` owns the launch reporting canvas: overview, catalog, report creation, saved/history/deep-linked runs, explicit electronic finalization and single-report/bundle downloads. `InsightsCatalogPanel.tsx`, `InsightsRunsPanel.tsx`, `InsightsSchedulesPanel.tsx`, `InsightsBundlesPanel.tsx` and `InsightsRunEvidence.tsx` supply the existing discovery, scheduling, pack and provenance interfaces. The synchronized `InsightsLegalPackage.tsx` and `InsightsPackageStationery.tsx` remain the company/legal package implementation. Relevant path-limited deleted-history searches found no implementation to restore.

`client/src/services/portal/authService.tsx` already owns current account objects, session revisions and events. `editor/authoringCurrentRead.ts` already combines those into `captureAuthoringSession` and `useAuthoringReadSession`, preserving ordinary bearer refresh. This completion reuses those primitives. The existing reporting context key covered program, organization, scope and segment; it did not cover current account/revision. The bundle downloader already guarded session revisions, while the single-report downloader did not.

## Changes

The existing canvas now mounts its existing subtree under the canonical account/session owner. A current account, role-object or session change withdraws the prior overview, catalog, report, history, schedule/bundle selections, provenance and signing state. A replacement account reads afresh; an observed logout shows a sign-in state with no previous reporting data. Initial unknown-account compatibility retains server authorization. Ordinary bearer refresh retains the same owner and open report.

The same owner is checked before run/history/deep-link dispatch, after asynchronous report reads and before finalization callbacks. Capture handlers on the existing canvas roots block old Run, schedule-save/PATCH and Finalize clicks made in the same frame as account replacement. Single-report export checks the owner and displayed report at response, error-body and blob stages before download, suppresses stale acknowledgements and prevents duplicate pending exports. Existing bundle guards remain, augmented by the same canvas owner/context.

Creation responses require an actual positive safe-integer run id. Transport failures, status-zero/generic server failures or malformed successful receipts tell the current reader that the outcome is unconfirmed and to check Run history; they do not claim rollback or automatically repeat the write. The canonical error-code reader preserves explicit not-recorded/current-access refusal codes, including root and nested error envelopes. Retired sent-run/finalization receipts are withheld from replacement accounts, with generic recovery wording that preserves the possibility that the write completed. Finalization still uses the shared signature ceremony and export remains a read.

The existing single `.rc` root and `.rc-canvas` layout are retained, including loading, error, no-program and retired-session states. No style, route, entitlement, report engine, jurisdiction, dependency or global transport changed.

## Reproduction and verification

The corrected pre-runtime reproduction has **12 failures and one passing counterexample** across 13 focused cases, in 13.90 seconds. The passing case is ordinary same-session bearer refresh. Its exact executed test source is archived and matches the captured SHA-256. The earlier setup-only run remains separately archived: its unsupported paragraph fixture and shadowed document helper were corrected before the product reproduction. It is not counted as 13 reproduced product defects.

Intermediate records are retained separately: the first 13-case successor has one ambiguous status-query assertion failure, the corrected/expanded 19-case successor passes, and the first full reporting snapshot passes 272 cases in 31 files before the final layout/predicate refinements. None is relabeled as the final source snapshot.

A late targeted reproduction then records three unknown-outcome failures (thrown status zero/500 and a returned generic 503), with five passing controls and 21 cases excluded by the explicit name selection. Known root/nested not-recorded refusals remain precise. The preceding 272-case green snapshot is retained under `pre-uncertainty-*`; it is not the final classifier snapshot.

On frozen final sources, **all 277 tests in 31 reporting files pass**, with zero failures, skipped/pending cases or TODOs, in **69.43 seconds**. The final reporting suite includes 29 focused ownership/outcome cases, existing source/context, plan/role, regional, export, electronic-signature, bundle, provenance and current company/legal package regressions. All **36 source/test pins** remain unchanged during this final execution.

Three legacy fixtures now retain the actual authentication module and guards; label-currency and lifecycle fixtures install/retire a stable canonical account. Existing bundle-export session-change tests now assert withdrawal and explicitly reopen the current account's library, preserving byte identity, no stale download/error and ordinary-refresh checks. No business assertion was removed.

Final focused lint exits zero: zero errors, seven pre-existing warning sites in `Insights.tsx`, none in the changed tests. A duplicated target predicate was replaced with the existing `reportTarget` helper to avoid adding a complexity warning. Root owns comparative warning gates, build, complete TypeScript, reconciliation and normal direct publication. Hosted CI and live/regulated acceptance remain separate.

`checks.json` records exact commands, phase boundaries and final pins. `archives.json` pins encoded and decoded bytes for the lossless proof files. Earlier RED and setup outputs are retained without modification.
