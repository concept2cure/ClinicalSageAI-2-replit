# WO08 retained reporting stash disposition — 2026-10-16

Bounded read-only inventory against canonical HEAD `990a687c6eb31adb1becfa58d91fc9d2932f23ed`. Retained stash `8555ddd92aab26cefbac9452222926e6523079c0` (message: reporting-remediation-2026-10-10-before-Claude-reconciliation) has base `275707c7a3192e0bae02eb2f83ff1181bbb7dece`, index parent `51b547f12f4948b4f7241baba23ddabaf9c4ce1f`, and untracked parent `969fe6a05d0fd96595f2fd6052b7e76cc73d0d61`. No stash application, replay, deletion, SQL, model/provider call, tests, merge or push was performed for this inventory. Other sessions' worktree/index changes were left alone. Only this private report was written during inventory.

## Finding

The retained stash is substantially incorporated into the reconciled canonical reporting implementation, beginning with `728f6364f50c26f5af1f09e97fd6fecc84920ffd` and preserved/extended by `a64d422ac`, `1d1e25c54`, `fa39bd5d8`, and subsequent reporting truthfulness/plan commits. It must not be applied wholesale. Tracked-file byte census: **{'reconciled_or_superseded': 30, 'exact_current': 24, 'exact_integration_then_changed': 4, 'base_unchanged': 1}**, total **59**. Untracked-parent census: **{'absent_retained': 16, 'reconciled': 11, 'exact_current': 6}**, total **33**. The third parent matters: the stash contains **92 paths**, rather than only the 59 tracked deltas.

One bounded residual is demonstrable from source: `tests/ops/report-os-foundation.test.mjs:76` still demands `provider: 'regional_registry_readiness'`; current `orchestrator.ts:294` emits `submission_readiness`, and line319 emits `regional_package_manifest`. The former provider is absent. The stash's test-only correction was not incorporated, although the one-evaluator implementation and its detailed readiness regression tests were. Root has authorized a separate actual Node RED→GREEN and this one test expectation repair. At inventory completion that test has not yet been run or changed.

No additional pending production capability is established by the inspected scope/scheduling/download/readiness diffs. This conclusion is a source/history disposition, not a fresh execution, browser, hosted CI, scheduler or production qualification. Different bytes alone are not proof of a gap; the table distinguishes exact incorporation from reconciled continuation. Old alternative UI and historical proof remain preserved in the original stash and are not proposed for reintroduction.

## Significant contract evidence

- **Actual scope and engine:** stash additions to `reportAvailability`, scope ownership, genuine organization-wide domain summaries and canonical saved history are present. `728f6364f` adds `compute-run.ts`, `scope-ownership.ts`, `project-access.ts`, `persistence.ts` and `run-history.ts`, and shares dispatch with scheduling. Current `server/routes/report-os.ts` imports `computeRunForType` at line40, `persistReportRun` at line89 and calls dispatch around1623. Account summaries do not become project-restricted merely because a project is open. `segment.ts`, `taxonomy.ts`, taxonomy-global and deployed registry seed are byte-identical to the stash.
- **Scheduling:** current `scheduling/generate-deliver.ts:25` validates creator, entitlement, scope and recipients; its run UUID is deterministic per occurrence. It calls the common dispatcher at line40 and canonical persistence around52, then performs cursor comparison, platform notification and chained delivery event on the persistence transaction's client. `configuration.ts:32` explicitly refuses unconfigured external transport. IANA timezones and legacy offsets remain; cadence adds finite-day validation. `subscription-service.ts` adds configuration equality to optimistic enablement and SQL due filtering/order. `worker-register.ts:26` now refuses unread plans (`dfb3fd368`) rather than substituting Standard. `scheduling/README.md` records these actual limitations and current access gates. This supersedes the stash implementation with additional safeguards; no runtime sweep was exercised here.
- **Downloads and snapshot fidelity:** `audit-compliance-reports.ts:275` still converts the authentic retained signed snapshot with `exportSavedReportCsv` and records release through `recordAndSend`; reconciliation intentionally permits conversion after its live catalog definition changes. The snapshot-export service is exact stash bytes. Noto-font provisioning and direct `bidi-js@1.0.3` survive. The PDF writer includes the corrected bidi mirroring level-array and Arabic ligature/ActualText treatment introduced after the stash. `1d1e25c54` adds complete retained packets, current access/seal/plan checks and exact-byte export audit; this expands the stash's renderer, rather than replacing it with another exporter. See current `docs/design/REPORTING_EXPORT_FIDELITY_2026-10-10.md` and `docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/retained-report-pack/backend/README.md` for historically qualified proof and its limits. No historical evidence was amended.
- **Readiness truthfulness:** the stash removed a duplicate regional readiness computation in favor of canonical `evaluateReadiness` and preserved package-manifest observations. Reconciliation additionally carries `artifactsAssessed` and full gap objects, avoiding "No gaps detected" for an unassessed matrix. `render-one-readiness` explicitly refuses an assessment inference from legacy empty artifact lists. Supported regional report types now compute their own market from Module 1 rather than repeat one generic score; current reports preserve declared gaps and uncomputed dependencies. The stale foundation assertion is the identified remaining test-contract mismatch.
- **Current context after fa39:** `fa39bd5d8cd5641a6dc0d5b573c145f4e17731cd` adds recorded-regional filing applicability and actual verified subscription presentation/execution. Current `insights-canvas-routes.ts:471` passes `tierResolved`, applies own-scope engine availability and recorded filing admission; `Insights.tsx:1621` gates execution on actual plan resolution. `838443890` refuses a drifted regional declaration before reading a program. `dfb3fd368` adds fail-closed unread-plan checks to definition/suggestion creation and scheduler. Replaying stash routes/UI would remove these later changes.
- **Existing UI replaces alternate untracked files:** current `Insights.tsx:20–22` imports Catalog/Runs/Schedules panels and line1891 renders schedules in the existing surface. Their initial canonical panel history is `0ce0d0bb8`; reconciliation `728f6364f` preserves/reworks them, and fa39 binds their actual plan/region. `git grep` at HEAD found no `ReportingWorkspace` or `ReportSchedules` references in v2 or the shared UI registry. Restoring the stash's alternate `ReportingWorkspace.tsx`, `ReportSchedules.tsx`, custom CSS or isolated review entrypoints would introduce a duplicate UI. The canonical registry retains report runs, bundles, insights-canvas and subscriptions prefix claims.

## Exact tracked-file inventory (59)

Blob pairs below are **stash / HEAD**, not worktree hashes. `Exact at 728f` means that integration commit contains exactly the stash blob and a later reachable commit changed it. `Reconciled/superseded` means byte identity is not claimed; the listed contract/history was reviewed and retained as the disposition. Latest reachable path commit is evidence of continuation, not alone proof that every hunk is equivalent.

| File | Disposition | Blob IDs | Evidence / reason |
| --- | --- | --- | --- |
| `Dockerfile.optimized` | Reconciled/superseded | `6ce866f28f89` / `357d0273fd4e` | `fa39bd5d8`; Noto assets retained; fa39 hardens validator transport |
| `client/src/concept2cure/v2/TaskTray.tsx` | Exact stash bytes at HEAD | `5c9a45e0377d` / `5c9a45e0377d` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/__tests__/complianceReports.test.tsx` | Exact stash bytes at HEAD | `0060a7d547cc` / `0060a7d547cc` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/__tests__/complianceReportsHonestStates.test.tsx` | Exact stash bytes at HEAD | `a01655b97bef` / `a01655b97bef` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/__tests__/complianceReportsReview.test.tsx` | Exact stash bytes at HEAD | `29947c19a5f2` / `29947c19a5f2` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/__tests__/complianceReviewRecords.test.tsx` | Exact stash bytes at HEAD | `93748ceee349` / `93748ceee349` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/__tests__/taskTrayHonestReads.test.tsx` | Exact stash bytes at HEAD | `21c6bb440101` / `21c6bb440101` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx` | Exact stash bytes at HEAD | `f13d9fd1f7b3` / `f13d9fd1f7b3` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx` | Exact stash bytes at HEAD | `1018de43f646` / `1018de43f646` | `728f6364f`; incorporated, no replay |
| `client/src/concept2cure/v2/surfaces/Insights.tsx` | Reconciled/superseded | `f62b275d4571` / `8cb092c0c232` | `fa39bd5d8`; canonical existing Insights UI, recorded regional context and actual plan |
| `migrations/20260930_report_type_registry_seed.sql` | Exact stash bytes at HEAD | `40c52632a23b` / `40c52632a23b` | `728f6364f`; incorporated, no replay |
| `package-lock.json` | Exact stash bytes at HEAD | `7365b5e3e37d` / `7365b5e3e37d` | `728f6364f`; incorporated, no replay |
| `package.json` | Reconciled/superseded | `ab8484a8c41e` / `56ee999e2234` | `b60d89a20`; bidi-js pin retained; later unrelated scripts retained |
| `server/routes/__tests__/audit-compliance-reports.test.ts` | Exact stash bytes at HEAD | `d15d47fec7b7` / `d15d47fec7b7` | `728f6364f`; incorporated, no replay |
| `server/routes/__tests__/insights-canvas-catalog.test.ts` | Reconciled/superseded | `a5f9d4592db7` / `9f3f99bf3c61` | `fa39bd5d8`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/routes/__tests__/report-os-audit-recording.test.ts` | Reconciled/superseded | `6a14679501ba` / `a68e110f7dcf` | `728f6364f`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/routes/__tests__/report-os-delivery-recording.test.ts` | Reconciled/superseded | `ccd2de996c4f` / `922a7cf46ad1` | `728f6364f`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/routes/__tests__/report-os-finalize-signature.test.ts` | Reconciled/superseded | `3c342366e9ff` / `10476b8a1784` | `1d1e25c54`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/routes/__tests__/report-os-run-engine.test.ts` | Reconciled/superseded | `1c4dc224a375` / `91c4deb9f4ef` | `728f6364f`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/routes/audit-compliance-reports.ts` | Reconciled/superseded | `a5e3268fc9bd` / `2ac47ed64be5` | `728f6364f`; same signed snapshot CSV conversion; retained catalog independence |
| `server/routes/insights-canvas-routes.ts` | Reconciled/superseded | `66debd450868` / `7b99b4eecd28` | `fa39bd5d8`; canonical existing Insights UI, recorded regional context and actual plan |
| `server/routes/report-os-insights.ts` | Reconciled/superseded | `8c414171488d` / `563a6f6c4819` | `d255d8c81`; tenant/readiness truthfulness retained and later engine-input fixes |
| `server/routes/report-os.ts` | Reconciled/superseded | `e0cc3a284f04` / `3ebe471120b7` | `af2e4d743`; canonical dispatch/persistence, current access and retained downloads |
| `server/services/audit/compliance-reports/signed-report.ts` | Exact stash bytes at HEAD | `8f396281fccb` / `8f396281fccb` | `728f6364f`; incorporated, no replay |
| `server/services/audit/signedAuditExport.ts` | Reconciled/superseded | `00632593070d` / `5b0eb3deeece` | `728f6364f`; conversion source export plus unlinked-chain truthfulness |
| `server/services/notifications/notification-service.ts` | Reconciled/superseded | `cda634b61861` / `c6361daa1109` | `728f6364f`; transaction client retained for atomic scheduled delivery |
| `server/services/report-os/__tests__/orchestrator-readiness.test.ts` | Exact stash bytes at HEAD | `1fdc3393b251` / `1fdc3393b251` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/__tests__/report-engine.test.ts` | Reconciled/superseded | `53ab5cfa8575` / `d47466c4c65e` | `728f6364f`; later audit/access/signature/engine fixtures retained; no obsolete fixture replay |
| `server/services/report-os/__tests__/segment.test.ts` | Exact stash bytes at HEAD | `0c4bb45bc802` / `0c4bb45bc802` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/canvas/__tests__/definition-service.test.ts` | Exact stash bytes at HEAD | `41660691a752` / `41660691a752` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/canvas/__tests__/suggestion-service.test.ts` | Exact stash bytes at HEAD | `8ae641119dca` / `8ae641119dca` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/canvas/definition-service.ts` | Exact at 728f; later amended | `96bc80161457` / `c9d3cb22be2b` | `dfb3fd368`; retain later plan/PDF/research safeguards |
| `server/services/report-os/canvas/suggestion-service.ts` | Exact at 728f; later amended | `3e882707f2a3` / `a298c4a1dc59` | `dfb3fd368`; retain later plan/PDF/research safeguards |
| `server/services/report-os/orchestrator.ts` | Reconciled/superseded | `ea74f2f4a953` / `230f532124ee` | `728f6364f`; one readiness evaluator; explicit unassessed gaps; own regional engines |
| `server/services/report-os/pdf/__tests__/run-pdf.test.ts` | Reconciled/superseded | `492a8d9de454` / `2503d1aad652` | `1d1e25c54`; fidelity fixes plus complete retained packet exporter |
| `server/services/report-os/pdf/bundle-pdf.ts` | Exact at 728f; later amended | `28b529e0f7eb` / `8f1a3334f846` | `1d1e25c54`; retain later plan/PDF/research safeguards |
| `server/services/report-os/pdf/run-pdf.ts` | Reconciled/superseded | `48c9c21a9e5d` / `6b6322f6aaea` | `1d1e25c54`; fidelity fixes plus complete retained packet exporter |
| `server/services/report-os/pdf/writer.ts` | Reconciled/superseded | `ff58c832f9b9` / `3de75166ea99` | `1d1e25c54`; fidelity fixes plus complete retained packet exporter |
| `server/services/report-os/render/__tests__/render-one-readiness.test.ts` | Reconciled/superseded | `ba2851e1b5b0` / `7b6676a0554d` | `728f6364f`; one readiness evaluator; explicit unassessed gaps; own regional engines |
| `server/services/report-os/render/__tests__/render.test.ts` | Reconciled/superseded | `912e5186405d` / `d532cc550cbc` | `be20b53d9`; one readiness evaluator; explicit unassessed gaps; own regional engines |
| `server/services/report-os/render/render.ts` | Reconciled/superseded | `5f2ca5d3538d` / `d0eb163b1820` | `728f6364f`; one readiness evaluator; explicit unassessed gaps; own regional engines |
| `server/services/report-os/render/types.ts` | Exact stash bytes at HEAD | `e0207959d4b1` / `e0207959d4b1` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/report-engine.ts` | Reconciled/superseded | `a6f0bc99a7df` / `5e6296ea474b` | `728f6364f`; one readiness evaluator; explicit unassessed gaps; own regional engines |
| `server/services/report-os/research-compliance-report-providers.ts` | Exact at 728f; later amended | `4910714f8141` / `821b08cb475a` | `9ba668a7e`; retain later plan/PDF/research safeguards |
| `server/services/report-os/scheduling/__tests__/scheduling.test.ts` | Reconciled/superseded | `3237dc973151` / `6c403c319f83` | `728f6364f`; shared dispatcher, persistent delivery, timezone/creator/scope checks |
| `server/services/report-os/scheduling/__tests__/subscription-service.test.ts` | Exact stash bytes at HEAD | `501c16e63d47` / `501c16e63d47` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/scheduling/cadence.ts` | Reconciled/superseded | `301c5edaa3b5` / `1bb1e8245a94` | `728f6364f`; shared dispatcher, persistent delivery, timezone/creator/scope checks |
| `server/services/report-os/scheduling/subscription-service.ts` | Reconciled/superseded | `961d1c259ec5` / `bb1744909811` | `728f6364f`; shared dispatcher, persistent delivery, timezone/creator/scope checks |
| `server/services/report-os/scheduling/types.ts` | Exact stash bytes at HEAD | `9b1214776ce6` / `9b1214776ce6` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/scheduling/worker-register.ts` | Reconciled/superseded | `5bc31474d833` / `f766f8a95f80` | `dfb3fd368`; shared dispatcher, persistent delivery, timezone/creator/scope checks |
| `server/services/report-os/scheduling/worker.ts` | Reconciled/superseded | `eec7f69b1cd8` / `3f7a37ddc9be` | `728f6364f`; shared dispatcher, persistent delivery, timezone/creator/scope checks |
| `server/services/report-os/segment.ts` | Exact stash bytes at HEAD | `ebc83315b83a` / `ebc83315b83a` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/taxonomy-global.ts` | Exact stash bytes at HEAD | `04d8e29562cd` / `04d8e29562cd` | `728f6364f`; incorporated, no replay |
| `server/services/report-os/taxonomy.ts` | Exact stash bytes at HEAD | `f936a2a57534` / `f936a2a57534` | `728f6364f`; incorporated, no replay |
| `server/services/research-compliance/compliance-briefing.ts` | Exact stash bytes at HEAD | `1ce7a860db51` / `1ce7a860db51` | `728f6364f`; incorporated, no replay |
| `server/types/pdfkit.d.ts` | Exact stash bytes at HEAD | `89bacda64625` / `89bacda64625` | `728f6364f`; incorporated, no replay |
| `shared/constants/ui-surface-registry.ui-v2.ts` | Reconciled/superseded | `065d504dcc2a` / `1b2463315969` | `f03138b21`; existing Insights launch claims, including reachable bundles |
| `shared/schema/report-os.ts` | Reconciled/superseded | `f3bac4aef04e` / `81de0f3945c9` | `0e4ccf46f`; canonical dispatch/persistence, current access and retained downloads |
| `tests/ops/report-os-foundation.test.mjs` | Base unchanged; residual | `f1393e6feadd` / `7eb10e2c2797` | `e14fa01da`; obsolete provider assertion, bounded repair authorized separately |

## Exact untracked-parent inventory (33)

`absent` is absence from HEAD, not deletion from the retained stash. Historical binaries/logs are preserved in `stash^3` without being republished as current proof.

| File | Disposition | Stash / HEAD blob | Evidence / reason |
| --- | --- | --- | --- |
| `client/reporting-browser-review.html` | Absent; retained historical bytes | `3bb9aaadd348` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/reporting-browser-review.tsx` | Absent; retained historical bytes | `457d0c9c3860` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/src/concept2cure/v2/__tests__/reportSchedules.test.tsx` | Absent; retained historical bytes | `4a501bc0f06e` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/src/concept2cure/v2/__tests__/reportingWorkspace.test.tsx` | Absent; retained historical bytes | `4d60bb09c0ca` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/src/concept2cure/v2/styles/reporting-workspace.css` | Absent; retained historical bytes | `18d2042bfa05` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/src/concept2cure/v2/surfaces/ReportSchedules.tsx` | Absent; retained historical bytes | `9d0c359de51a` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `client/src/concept2cure/v2/surfaces/ReportingWorkspace.tsx` | Absent; retained historical bytes | `8bcc8dd8eee5` / `absent` | alternate workspace/review harness; existing Insights + Catalog/Runs/Schedules panels are the reachable replacement |
| `docs/design/REPORTING_EXPORT_FIDELITY_2026-10-10.md` | Reconciled/continued at HEAD | `676ee72c906e` / `65f2be7eb3ce` | later export fidelity contract |
| `docs/design/REPORTING_REMEDIATION_2026-10-10.md` | Absent; retained historical bytes | `4f4a841dc621` / `absent` | historical planning contract; implemented/reconciled in current reporting/schedule/export design docs, not a runtime file |
| `docs/evidence/D2-REPORTING/2026-10-10/browser/catalog-dark-mobile.png` | Absent; retained historical bytes | `4be217626e9c` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/browser/catalog-desktop.png` | Absent; retained historical bytes | `3c5149776929` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/browser/catalog-mobile.png` | Absent; retained historical bytes | `9e6550802008` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/browser/result.json` | Absent; retained historical bytes | `362b52c29bba` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/browser/saved-desktop.png` | Absent; retained historical bytes | `8203282e319b` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/exports/focused-tests.txt` | Absent; retained historical bytes | `22454fa36e64` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/exports/multilingual-charts.pdf` | Absent; retained historical bytes | `00d7561a7588` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `docs/evidence/D2-REPORTING/2026-10-10/exports/multilingual-charts.png` | Absent; retained historical bytes | `fa251fc7ad6b` / `absent` | old proof only; preserved in stash, not evidence for current sources; newer 2026-10-13/14 proof is separate |
| `server/services/audit/compliance-reports/snapshot-export.ts` | Exact stash bytes at HEAD | `6a2741e2547e` / `6a2741e2547e` | incorporated via 728f |
| `server/services/report-os/__tests__/domain-project-sql.test.ts` | Exact stash bytes at HEAD | `da44bfd69b9b` / `da44bfd69b9b` | incorporated via 728f |
| `server/services/report-os/__tests__/domain-provenance.test.ts` | Exact stash bytes at HEAD | `b19262821d4d` / `b19262821d4d` | incorporated via 728f |
| `server/services/report-os/__tests__/persistence.test.ts` | Reconciled/continued at HEAD | `8ed5d1da278f` / `1adc518c1666` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/__tests__/run-history.test.ts` | Reconciled/continued at HEAD | `4523308a9e0a` / `17d42ab2a358` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/client-scope.ts` | Exact stash bytes at HEAD | `8d9801c72313` / `8d9801c72313` | incorporated via 728f |
| `server/services/report-os/pdf/bidi-js.d.ts` | Reconciled/continued at HEAD | `89bb48ffb421` / `c521179fc3dd` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/persistence.ts` | Reconciled/continued at HEAD | `e2c6984a4f69` / `151f3b25f072` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/registry-context.ts` | Exact stash bytes at HEAD | `7da1b1aa1352` / `7da1b1aa1352` | incorporated via 728f |
| `server/services/report-os/run-history.ts` | Reconciled/continued at HEAD | `7b62398872f2` / `86b31931403d` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/scheduling/__tests__/configuration.test.ts` | Reconciled/continued at HEAD | `871794c41176` / `d02f23be3919` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/scheduling/__tests__/generate-deliver.pglite.test.ts` | Reconciled/continued at HEAD | `7ed1df21b8c0` / `77f734941b19` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/scheduling/__tests__/generate-deliver.test.ts` | Reconciled/continued at HEAD | `cd529122f7a1` / `eb6d5833c092` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/scheduling/__tests__/worker-register.test.ts` | Exact stash bytes at HEAD | `2dff342a90af` / `2dff342a90af` | incorporated via 728f |
| `server/services/report-os/scheduling/configuration.ts` | Reconciled/continued at HEAD | `a415a8ff1828` / `91fb88e35791` | same service retained with current scope/lifecycle safeguards |
| `server/services/report-os/scheduling/generate-deliver.ts` | Reconciled/continued at HEAD | `3aa95b380132` / `2dc033160840` | same service retained with current scope/lifecycle safeguards |

## Reproduction (read-only inventory)

The census used `git diff --name-only <stash>^1 <stash>`, `git ls-tree -r --name-only <stash>^3`, exact `git rev-parse <ref>:<path>` blob comparisons against HEAD and 728f, per-path reachable `git log`, targeted `git diff <stash> <reconciliation-or-HEAD> -- <paths>`, and source reads. It did not execute SQL found inside source files. Full stash/index/untracked commit objects remain retained. The original old proof remains historical; current source and acceptance evidence require their own checks.

## Authorized bounded repair after inventory

The follow-up source-contract run used actual Node v22.22.0: unchanged foundation file **12 passed / 1 failed**, with the obsolete provider assertion as the sole failure. Only that assertion was replaced by negative duplicate-provider and positive canonical-provider checks. All 13 cases and all other existing assertions remain; GREEN **13/13, zero skips**, exit0. Orchestrator SHA-256 stayed unchanged across RED/GREEN. Evidence is `docs/evidence/D2-WORKFLOW-CONTINUATION/2026-10-16/reporting-stash-reconcile/`. This repairs the identified test mismatch; it does not extend the source-only inventory into full reporting qualification. The retained stash and parents remain untouched.
