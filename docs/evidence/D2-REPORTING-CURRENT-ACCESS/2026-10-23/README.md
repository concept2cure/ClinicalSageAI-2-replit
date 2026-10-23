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

The [late-native packet](late-native/README.md) records the independent review and **50 passing tests in four suites**, no failures, pending cases or TODOs, in 36.51 seconds. That merged-source production build completed in **29.84 seconds**; server and audit verifier passed. `release/checks.json` and `release/build-native-reconciled.txt.gz` retain this additional phase without overwriting the earlier reporting build evidence. Synthetic native tests do not establish live provider qualification.

## Preserve concurrent Authoring PDF completion

Canonical advanced again through `0a7abf314`, with Authoring PDF convergence already independently qualified in `docs/evidence/D2-AUTHORING-PDF/2026-10-23/README.md`. Normal merge `5482e9b75` retains it alongside this reporting completion. Ordinary Authoring PDFs reuse the existing rich Word builder and strict converter, preserving signatures, working-copy notices, source guards and historical company presentation. Definite pre-write conversion refusals remain distinct from uncertain export or Vault outcomes. No reporting runtime source overlaps the six incoming runtime paths.

That combined production build passed in **26.89 seconds**, including server and audit verifier. All 87 selected build source/test/helper pins remain unchanged. `release/checks.json` and `release/build-authoring-reconciled.txt.gz` retain this later phase; earlier builds remain historical. The [late-authoring packet](late-authoring/README.md) records the bounded integration review and **115 passing tests across eight suites**, zero failures, with **one inherited re-filing TODO**, in 44.67 seconds. All 22 before/after pins and prior reporting/native pins remain unchanged. These separate test results are not added to the earlier reporting or native counts.

## Preserve governed Authoring refiling

The first normal push of `9eba8a7dc` passed every pre-push gate and the full TypeScript compiler with **zero errors**, then Git refused the remote compare-and-swap because another writer had advanced canonical through `8ba496f69`. This is retained as a successful check followed by a failed publication attempt, not a successful push.

Normal merge `d8ef73f27` preserves the incoming governed Authoring refiling completion. It extends existing Vault check-in with verified source-bound rendition families, assigned versions and predecessors, retained numeric slots and locked metadata revalidation. Existing sequence placements keep their exact byte pins until explicitly replaced. The former re-filing TODO is implemented for these new numeric PDF/Word families; historical hash-labelled and all-retired families still require review. The [late-refiling packet](late-refiling/README.md) records bounded independent review and **170 passing tests in seven suites**, zero failures, pending cases or TODOs, in 39.97 seconds. All 18 before/after inputs and all 68 prior reporting/native pins remain unchanged. Eight prior Authoring pins legitimately changed and their original/new hashes are retained; the remaining 14 are preserved. Earlier TODO-bearing reports retain their historical source and result.

That combined production build passed in **21.85 seconds**, including server and audit verifier. All 94 selected build inputs remain unchanged. `release/checks.json` preserves the latest build and the first push attempt, with separate exit statuses and lossless logs. No reporting or native source pins changed.

## Preserve concurrent Unicode boundary repair

The second normal push of `7e0a8332c` again passed every gate and the full compiler with zero errors, then received a fetch-first rejection because canonical advanced through `70e5ea3bb`. Normal merge `41c39279a` preserves its small Vault chunk-boundary repair: cuts and overlap starts keep surrogate pairs intact across UTF-8 storage. No reporting, native or previously qualified refiling source pin changed. The [late-unicode packet](late-unicode/README.md) retains independent review and **33 passing tests across three suites**, zero failures, pending cases or TODOs, in 9.53 seconds. The property census covers 2,688 deterministic inputs and 8,080 chunks with zero violations. All four new before/after inputs and all prior reporting/native/refiling selected pins remain unchanged.

The latest combined production build passed in **20.27 seconds**, including server and audit verifier. All 98 selected build input hashes remain unchanged. `release/checks.json` and lossless archives preserve this build and the second checked-but-rejected publication attempt. The fix does not claim migration of historical chunks, complete grapheme segmentation or resolution of separate retrieval defects.

## Remaining acceptance

Current actor rows are retained through commit; source-project policy is re-evaluated on the supplied executor. This does not establish serialization against every independent sharing writer. The SQL-backed tests do not establish native hosted acceptance.

This completion adds no reporting engine, prediction, market, model approval or permission grant. The existing regional filing-readiness bindings and source-data requirements remain authoritative. Live Codespace/approved-model acceptance and global regulatory qualification remain separate. The former Vault re-filing TODO is addressed by the concurrent completion above within its declared numeric-family boundary. Hosted CI is not inferred from local checks.
