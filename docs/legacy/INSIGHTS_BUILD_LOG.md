# Insights Build Log

Tracks execution of `INSIGHTS_REPORTING_IMPLEMENTATION_SPEC.md`. Sponsor approved all
four §8 decisions on 2026-06-15:

- Module: new `insights` left-rail module; retire the fixture surface.
- v1 breadth: 3 beachhead types (executive readiness digest, compliance/audit pack, prediction report).
- External delivery: e-sign only on sealed/final reports; draft exports watermarked.
- Calibration: full disclosure in-report; detailed Brier/quality view to admins.

## Step status

| Step | Title | Status |
|---|---|---|
| 0 | Foundations, guardrails, truthfulness contract | Foundation landed (gate built + tested); criticalBlockers now severity-tagged through orchestrator → run → render; run-lifecycle finalize wiring pending DB-backed test |
| 1 | Canonical insight/aggregation layer (read model) | Registry + pure helpers + DB-backed core providers (artifact_state, submission_readiness, compliance_audit) + registerCoreProviders landed; tested (compute() is DB-coupled, typecheck-only) |
| 2 | Report content/render model | Pure model + renderer landed + tested; live read endpoint GET /runs/:id/rendered wired (typecheck-only, needs DB-backed CI test) |
| 3 | Governed visualization system | 6 governed charts + ChartBlock dispatcher + reduced-motion/data-table a11y landed (typecheck-clean; needs browser/design QA) |
| 4 | Insights UI surface (chat-first, scope-aware) | Surface landed (ScopeSwitcher, ReportCatalog, ReportView, ReportBlockView with provenance + disclosure + truthfulness banner, InsightsSurface, Ask-AnA affordance); typecheck-clean, needs browser/design QA + mount into ZenApp layoutMode |
| 5 | Prediction reports (package the honest models) | Assembler + 3 prediction report types (registered in seed) + POST /api/insights/predictions endpoint landed; real model-service inputs next |
| 6 | Scheduling, subscriptions, delivery | Core logic + report_subscriptions table/migration + subscription-service (CRUD, listDueSubscriptions, markRun) landed; Bull worker registration next (Redis) |
| 7 | Enterprise / portfolio rollup reporting | Pure aggregator (board pack) + cross-region/harmonization engine landed + tested; DB-backed member fetch next |
| 8 | Governance, audit, e-sign, Part 11 for reports | Sealing core + POST /runs/:id/finalize endpoint (gate-enforced: 409 unless final-eligible; seals report, marks run final, persists seal to snapshot) landed; full immutableReportRecords row + e-sign capture next |
| 9 | Observability, quality, rollout | Quality core + GET /api/insights/quality (admin-gated) landed; metrics/observability wiring next |

## Notes

- **Step 0 security prerequisite already satisfied.** The RCE the spec/GA-audit flagged at
  `server/routes/analytics-routes.ts:128,148` is already remediated: the file uses `execFile`
  (argv, no shell) exclusively, with input truncation and buffer/timeout limits. No shell `exec`
  remains. No further action required for that item.

## Global market coverage (per sponsor directive: "think for all global markets")

`taxonomy-global.ts` adds 30 regulatorily-accurate report types with no typeId collision
against the existing seed: USA FDA drug/bio (IND, NDA/BLA, CRL response, Type A/B/C meeting
brief, De Novo), EU EMA (MAA Day-120/180 LoQ, variations, PSUR/PBRER, scientific advice),
EU devices (MDR tech doc, MDR CER, IVDR PER), Japan PMDA (J-NDA/Shonin, consultation,
re-examination), Health Canada (NDS/SNDS, device licence), UK MHRA (MAA, ILAP), Australia
TGA (prescription, device ARTG), Korea MFDS, Switzerland Swissmedic, Brazil ANVISA,
cross-region comparison + ICH harmonization gap matrix + label-currency matrix, and global
PV (DSUR, signal management). CRL/LoQ packs set `allowPartial:false` + `forbidFinalIfMissingCritical`.

## AnA 1.0 RI reporting expertise (per directive: "expand AnA expertise")

`ana/report-tools.ts` defines 7 reviewer-grade conversational tools (list_report_types,
generate_report, explain_blockers, portfolio_readiness, regional_gap_analysis, compare_regions,
get_prediction) with zod-validated args and the hard guardrail `ANA_REPORTING_GUARDRAIL`:
AnA narrates and explains report outputs but never originates a metric, score, or probability.

## Increment history

- _2026-06-15_ — Build log created; Step 0/1 backend foundations started.
- _2026-06-15_ — Steps 0/1/2/5 backend pure-logic landed + tested (gate, providers, render, prediction).
- _2026-06-15_ — Global-markets taxonomy (30 types) + AnA reporting tools (7) landed + tested.
