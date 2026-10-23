# Reporting current-access completion

W1 / D2, `concept2cure-v2`. This packet starts from synchronized canonical `dd749f3e5`, preserving the earlier published delivery through `827ceb953`. The subsequent canonical catch-up is recorded in `canonical-catchup.json`.

## What already exists

`Insights.tsx` and its existing catalog, history, schedule, pack and evidence panels already deliver reporting. `authService.tsx` supplies canonical session guards and `editor/authoringCurrentRead.ts` supplies a reusable account/session owner. `insightsLibraryModel.ts` already guards bundle PDF export. The single-report export and canvas owner are the client completion points.

`scheduling/generate-deliver.ts` and `server/routes/report-os.ts` already compute and persist governed runs through `report-os/persistence.ts`. Their late checks use `project-access.ts` and `c2c/current-program-access.ts`, but conditional guards currently omit ordinary report types. The completion extends those existing checks. Relevant deleted-history searches found no predecessor to restore.

The exact contract and boundaries are in `docs/design/REPORTING_CURRENT_ACCESS_COMPLETION_2026_10_23.md`. All earlier evidence retains its original source snapshot and result. No live demo, global coverage or regulated release qualification is implied.

## Completed behavior

The existing reporting canvas now belongs to the canonical session and account snapshot. Account or role replacement withdraws prior reports, catalog, history, selections, evidence and signing state together. Old handlers cannot dispatch under replacement credentials; delayed results cannot populate the replacement view. Ordinary bearer refresh remains supported. The existing canvas roots, theme, layout and signature dialog are retained; recovery notices use the existing canvas notice slot.

Single-report PDF export now has pending/duplicate-click protection and checks current ownership before dispatch and after response/body reads. Export remains a read. Finalization remains the explicit signature ceremony and its callback belongs to the displayed run. Unclassified transport/server errors and malformed positive run responses direct the current reader to Run history before another request. Explicit known rollback/access refusals retain their precise messages; nothing retries a sent write automatically.

Manual reports now always install the existing enlisted current-writer/source check. Scheduled reports always check the current creator, recipients and actual source access after computation and on the enlisted persistence client. Both reuse the existing fresh scope/workspace ownership check. Observed revocation, project archival or workspace movement refuses the operation or rolls back the report and enlisted notification/cursor/audit effects. No callback acquires another connection.

Only three existing runtime files changed. The [client packet](client/README.md) and [backend packet](backend/README.md) retain exact commands, source pins, original failures, fixture corrections and successful successors. Independent read-only cross-reviews found no blocking issue in either runtime patch. Earlier phase counts are not added together.

## Final verification

- Client: **277 passed in 31 suites**, no failures, skips or TODOs, 69.43 seconds. This includes 29 focused owner/action/export/recovery cases, existing plan, regional, signature, provenance, accessibility and package workflows.
- Backend: **164 passed in 12 suites**, no failures, pending cases or TODOs, 54.93 seconds. SQL-backed policy and rollback tests complement existing persistence, scope, configuration and subscription lifecycle checks.
- Production build: client **31.09 seconds**, server and audit verifier passed. All three runtime source hashes match the frozen build pins.
- Scoped lint: zero errors; client warnings remain seven and backend warnings remain five. The normal pre-push warning comparison and complete TypeScript program enforce the integrated result before publication.

`release/checks.json` and its lossless build archives record final integration. The earlier successful 23.08-second build remains explicitly a pre-uncertainty-refinement phase. Root verifies the published canonical SHA and actual hosted CI state after the normal direct push, without a PR, force push, hook bypass or increased baseline.

## Concurrent canonical reconciliation

Normal merge `484ed08fc` preserves the reporting completion `4f3ebaf73` and concurrent canonical changes through `2148660b9`. Four incoming native model-provenance runtime files and three test files have no reporting source overlap. All 36 client and 20 backend reporting pins remain unchanged.

The [late-native packet](late-native/README.md) records the independent review and **50 passing tests in four suites**, no failures, pending cases or TODOs, in 36.51 seconds. The latest merged-source production build completed in **29.84 seconds**; server and audit verifier passed. `release/checks.json` and `release/build-native-reconciled.txt.gz` retain this additional phase without overwriting the earlier reporting build evidence. Synthetic native tests do not establish live provider qualification.

## Remaining acceptance

Current actor rows are retained through commit; source-project policy is re-evaluated on the supplied executor. This does not establish serialization against every independent sharing writer. The SQL-backed tests do not establish native hosted acceptance.

This completion adds no reporting engine, prediction, market, model approval or permission grant. The existing regional filing-readiness bindings and source-data requirements remain authoritative. Live Codespace/approved-model acceptance, global regulatory qualification and the previously recorded Vault re-filing TODO remain separate. Hosted CI is not inferred from local checks.
