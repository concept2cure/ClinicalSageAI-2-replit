# Report-engine continuation: current connections and open work

This inventory requalifies the October 14 F22 evidence against canonical HEAD `36ecb3776a3fd2caf6440dfde8255f3ea336efd9` and the October 17 continuation. The live taxonomy still defines **61 types: 23 engine-backed, five unavailable predictions and 33 without a computation**. Completing the existing lifecycle report and preserving generic columns does not increase those counts. The [machine-readable inventory](report-capability-inventory.json) records each type, actual engine, scope, dependency, availability state and qualification limit.

The mounted launch reporting path is `InsightsCanvas` → `/api/report-os/runs` → `computeRunForType` → the canonical engine → structured renderer → existing Insights report document/PDF exporter. The retained protocol-analysis `ReportEngine.tsx` is not an additional launch reporting surface.

## Completed connections

1. `lifecycle.obligation_calendar` now carries actual obligation and persisted recurrence rows through the existing domain engine, renderer, Insights and PDF. It reuses the existing deterministic urgency and calendar summary functions. Obligations and occurrences have separate counts; no dates, recurrence events, agency acknowledgements or legal findings are manufactured. Null dates retain fixed columns and explicit unknown-date gaps. More than 500 admitted rows per source refuses generation instead of silently truncating.
2. Every generic domain table derives scalar columns from all returned rows. A nullable first row no longer hides a later recorded date, identifier or other scalar field. Nested objects remain outside scalar tables.

Detailed lifecycle reads require the real current actor and explicit executor supplied by the manual request or subscription producer. Actual SQL admits organization-owned unlinked/product records and only submission-linked records whose live same-tenant program has a unique admitted project. Canonical access is rechecked after source reads. A current actor/write-role/source check also runs on the existing persistence transaction before commit, including empty calendars. Saved reads, history before pagination, bundle manifests and each scheduled recipient honor contributing source project IDs. Unrelated admitted program identifiers are explicitly redacted from retained SQL parameters. Malformed present source evidence refuses access. The [contract](report-engine-continuation-contract.md) records these broader necessary boundaries.

The cross-domain research briefing retains its old aggregate-only lifecycle dependency through an explicit internal option. No report request or subscription can select that option. Label-currency behavior and its mandatory unknown-legal-currency finalization block remain unchanged. Recorded lifecycle dates also retain a critical legal-assessment blocker, so they cannot authorize a final report.

## Current unresolved types

These types remain honestly unavailable; this continuation does not substitute readiness or an unrelated service under their names.

| Type | Current gap |
| --- | --- |
| `compliance.audit_assurance_pack` | No canonical report computation at the declared scope. |
| `usa_fda.pma_submission_readiness` | No canonical report computation at the declared scope. |
| `usa_fda.estar_510k_equivalence_matrix` | No canonical report computation at the declared scope. |
| `usa_fda.deficiency_response_intelligence` | No canonical report computation at the declared scope. |
| `ema.rmp_psur_signal_alignment` | No canonical report computation at the declared scope. |
| `china_nmpa.ctd_module_gap_analysis` | No canonical report computation at the declared scope. |
| `china_nmpa.registration_dossier_readiness` | No canonical report computation at the declared scope. |
| `china_nmpa.deficiency_letter_root_cause_pack` | No canonical report computation at the declared scope. |
| `usa_fda.crl_response_intelligence` | No canonical report computation at the declared scope. |
| `usa_fda.type_bcd_meeting_brief` | No canonical report computation at the declared scope. |
| `usa_fda.de_novo_classification_pack` | No canonical report computation at the declared scope. |
| `ema.maa_loq_response_pack` | No canonical report computation at the declared scope. |
| `ema.variation_readiness` | No canonical report computation at the declared scope. |
| `ema.psur_pbrer_pack` | No canonical report computation at the declared scope. |
| `ema.scientific_advice_brief` | No canonical report computation at the declared scope. |
| `eu_mdr.technical_documentation_readiness` | No canonical report computation at the declared scope. |
| `eu_mdr.cer_per_completeness` | No canonical report computation at the declared scope. |
| `eu_ivdr.performance_evaluation_readiness` | No canonical report computation at the declared scope. |
| `japan_pmda.consultation_brief` | No canonical report computation at the declared scope. |
| `japan_pmda.reexamination_pack` | No canonical report computation at the declared scope. |
| `canada_hc.nds_snds_readiness` | No canonical report computation at the declared scope. |
| `canada_hc.device_licence_readiness` | No canonical report computation at the declared scope. |
| `uk_mhra.maa_readiness` | No canonical report computation at the declared scope. |
| `uk_mhra.ilap_pathway_brief` | No canonical report computation at the declared scope. |
| `australia_tga.prescription_medicine_readiness` | No canonical report computation at the declared scope. |
| `australia_tga.artg_device_inclusion_readiness` | No canonical report computation at the declared scope. |
| `korea_mfds.drug_registration_readiness` | No canonical report computation at the declared scope. |
| `switzerland_swissmedic.maa_readiness` | No canonical report computation at the declared scope. |
| `brazil_anvisa.registration_dossier_readiness` | No canonical report computation at the declared scope. |
| `global.cross_region_submission_comparison` | No canonical report computation at the declared scope. |
| `global.harmonization_gap_matrix` | No canonical report computation at the declared scope. |
| `pv.dsur_readiness` | No canonical report computation at the declared scope. |
| `pv.signal_management_report` | No canonical report computation at the declared scope. |

The regional comparison helper requires per-market filing/readiness evidence that canonical program data does not produce; automatically wiring it would invent a comparison. PSUR/DSUR services provide report structure without actual tenant safety data and cannot supply the missing clinical assessment. The audit-assurance adapter needs an explicit validated period/subject mapping; an organization-wide audit interval is not a faithful substitute. The eTMF lifecycle summary and document-verification completeness stores are distinct; lifecycle counts do not establish a verified complete TMF.

| Prediction type | Current state |
| --- | --- |
| `prediction.regulatory_forecast` | Prediction unavailable; not a report run. |
| `prediction.crl_rtf_premortem` | Prediction unavailable; not a report run. |
| `prediction.deficiency_risk` | Prediction unavailable; not a report run. |
| `prediction.readiness_trajectory` | Prediction unavailable; not a report run. |
| `prediction.trial_pos` | Prediction unavailable; not a report run. |

## Qualification and limits

Focused evidence exercises migration-backed lifecycle SQL, actual canonical sharing, private/foreign/deleted/ambiguous parents, mid-read revocation, source overflow/unreadability, malformed saved scope evidence, manual and scheduled producer identities, recipient revocation before persistence/delivery, saved-history filtering before totals/pages, the actual renderer, actual PDF text and mounted launch Insights. Unchanged label-currency, regional/readiness rendering, shared dispatch and catalog tests remain part of the regression batch. A controlled comparison with the canonical HEAD renderer proves the old null-first column loss and the remedied output.

The independently identified raw project-memory bypass for reserved `report_os_state` manifests is tracked with the parallel Report-OS memory-boundary remedy; this connection must land with that exclusion. Report-internal guarded manifest readers remain available. Whole-project TypeScript, repository-wide CI, native database validation, publication and exact landed revision are coordinated by the root task; local focused tests do not claim deployed qualification or production data correctness.

Local qualification on Node 22.23.3: the final main batch passed **189/189 tests across 19 files**. The subsequently added source-project union case passed with its four-case dispatcher companion; the latest combined receipts therefore cover **197 distinct passing tests across 20 files**, including seven actual bundle-producer companion cases, with no skips or failures. Scoped ESLint covered **20 changed TypeScript/TSX files: zero errors, 11 warnings**. Evidence is retained at `/workspace/audit/oct17-report-green-final.json`, `/workspace/audit/oct17-report-source-union.json`, `/workspace/audit/oct17-report-bundle-source.json`, `/workspace/audit/oct17-report-lint-final.json` and `/workspace/audit/oct17-report-render-control.json`. Source hashes and the exact distinct-test manifest are recorded in `/workspace/audit/oct17-report-acceptance.json`. These are local source-qualification receipts, not a deployment claim.

The bundle companion exercises the actual route and Drizzle transaction against recorded driver bindings, proving that account-calendar contributing IDs survive each reserved manifest copy. The generic-memory exclusion companion qualifies raw SQL independently. This is complementary producer/reader evidence, not a claim of one native end-to-end bundle/memory fixture.
