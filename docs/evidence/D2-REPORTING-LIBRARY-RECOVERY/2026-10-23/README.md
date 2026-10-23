# Reporting library recovery evidence

W1 / D2. Base: `df869f2815533a2fb6c5174b87a02c21c8a28e87`, preserving the published reporting completion through `b3e5746f6`. This completes existing reporting controls; it adds no engine, surface, model approval, grant, dependency or schema.

## What already exists

- `client/src/concept2cure/v2/surfaces/insightsLibraryModel.ts` owns schedule creation/enablement and bundle creation. It currently accepts any successful HTTP envelope without matching the returned record, and collapses uncertain failures into definite failure copy.
- `InsightsSchedulesPanel.tsx` and `InsightsBundlesPanel.tsx` own the existing forms and lists. `Insights.tsx` owns the canonical account/context and report selections. Its existing `reportAccessCurrent` and session owner protect the canvas; library completion callbacks do not yet use the same ownership. State-only creation flags and unguarded toggle controls permit same-frame repeated dispatch.
- `apiCall.ts` normalizes status/body/transport errors, `lib/queryClient.ts#errorCodeOf` decodes existing error codes, and `mutationOutcome.ts#mutationUnconfirmed` is the canonical general write uncertainty classifier. These are reused. `apiErrorText` remains suitable for definite refusals; its transport sentence does not prove a sent write never arrived.
- `server/routes/report-os.ts#inTenantTransaction` owns enlisted bundle copies and audit persistence. `persistBundleRecord` wrongly maps callback, COMMIT and cleanup failures alike to `REPORT_BUNDLE_NOT_RECORDED`. The existing helper must distinguish phases; another transaction implementation is not introduced.
- `report-os/scheduling/subscription-service.ts` already atomically persists schedule rows and chained audit, with CAS on enablement. Generic failures remain unknown. No second schedule writer is needed.
- Existing bundle recording, subscription lifecycle/access and library component tests supply the regression boundaries. Existing authoring, audit and source-receipt code demonstrates commit-attempt and suspect-connection handling, but its domain writers are not imported into reporting.

Code/route/helper/table/tool searches and path-limited deleted-history searches found no retired implementation of these exact library outcome/ownership controls to restore. Broader history contains prior UI cleanup commits, which are not a second library implementation.

## Completed behavior

Schedule creation, schedule pause/resume and bundle creation now require a coherent matching receipt before announcing success. Missing/mismatched positive responses and transport/server failures stay unconfirmed. Bundle creation reports absence only after acknowledged pre-COMMIT rollback or the pre-write size refusal; COMMIT acknowledgement loss, failed rollback and post-COMMIT cleanup report an unknown outcome without a retry claim.

The existing canvas owner retains pending attempts, uncertain outcomes and minimal validated confirmations across library tabs. Ref guards prevent repeated dispatch in the same frame. Unknown writes preserve the attempted draft/selection and require a coherent fresh list plus a separate deliberate review before another request. Contradictory/malformed reads, duplicate identities and missing-store responses cannot release a hold. A new check synchronously invalidates older review eligibility. A confirmed save received after tab remount is consumed once, so a completed restored draft does not become a writable duplicate. Old-context completions cannot announce success or clear replacement selections.

Existing reporting layout, classes, entitlements, exports and signature ceremony are retained. The only notice layout adjustment groups existing notice content and wraps its review button. The full pre-implementation contract is in [the design](../../../design/REPORTING_LIBRARY_RECOVERY_2026_10_23.md).

## Observed verification

| Boundary | Observed result |
| --- | --- |
| Client product RED | 20 failed / 3 passed on unchanged runtime; separate stale-review race RED also retained |
| Client reporting integration before the later shared-helper merge | 323 passed across 32 files, including 46 recovery cases; 57.36 s |
| Final client integration after the shared API-helper merge | **335 passed across 33 files**, including those same 323 reporting cases and 12 API-helper cases; 76.46 s |
| Backend product RED | 5 failed / 17 passed, including actual committed SQL rows after acknowledgement loss |
| Backend reporting/subscription integration | **151 passed across eight files**; 59.90 s |
| Final formatting-only backend test successor | 52 passed in its one changed file; 18.14 s |
| Changed-file lint | Zero errors; seven existing client warnings and five existing backend warnings; none added |
| Final integrated production build | Exit 0; 36.427 s process, Vite 32.62 s; server and audit-chain verifier emitted |
| Final build source stability | All 10,293 selected source/configuration file hashes unchanged across build |
| Component layout observation | 12/12 passed: three serialized mounted artifact-pane states, two themes, two viewport widths |

Overlapping phases are not pooled. The [client packet](client/README.md) and [backend packet](backend/README.md) retain exact commands, meaningful RED, successful successors, replay source, phase-specific pins and lossless raw archives. [Release checks](release/checks.json) retain the merged build and synchronization record. The [mounted-DOM/browser observations](browser/README.md) are separately scoped; they are not live application acceptance or additional product-suite cases.

The canonical source was synchronized from `df869f2815533a2fb6c5174b87a02c21c8a28e87` through `5ff6d225274079e9a08444409471394d9963970c` and then `9f8cae7f06df2d1b4c9200bb33b949e7aa30aa50`, preserving concurrent selected-source Authoring starts, market identity refusal, stored extraction-basis backfill, eSTAR session continuity and company-document session continuity. The latter merge extended the shared API helper with an optional fourth owner callback. Reporting retains its existing three-argument calls; its refusal helper now names the canonical non-null `ApiResult<unknown>` type explicitly. The separately pinned post-merge integration verifies this compatibility. All 288 built public assets are byte-identical across that type-only annotation adjustment; the earlier layout observations retain their exact original pins. Final source pins match the final build and post-merge tests. Direct publication uses the normal pre-push gates, including the whole-tree zero-error TypeScript gate. No PR, force push, hook bypass or baseline increase is used.

## Evidence limits and remaining work

Client tests use bounded HTTP fixtures. PGlite exercises actual bundle inserts and COMMIT/rollback with an enlisted SQL audit marker; it does not qualify the cryptographic chain or native multi-connection PostgreSQL. Hosted CI for the preceding publication was still queued at the retained observation, and is not presented as passing.

Recovery knowledge remains in memory for the existing canvas/account owner; it is not a durable cross-reload/cross-device idempotency ledger. Live authenticated demo and approved-model acceptance, native concurrency qualification and global regulatory qualification remain separate. The confirmed single-report PDF post-render source/actor/entitlement revalidation gap and catalog filter empty-state wording are outside this bounded pass. This packet does not claim the whole reporting module or every jurisdiction/client workflow is complete.
