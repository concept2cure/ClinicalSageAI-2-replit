# CMC (Module 3) — codebase findings + kit plan

> Grounded study of the **real** CMC code in `concept2cure/ClinicalSageAI-2-replit@concept2cure-v2`. The CMC backend is substantial and quality-by-design grade — the kit must surface what exists, not reinvent it.

## What exists (server/services/cmc/)

| File | Bytes | What it does |
|---|---|---|
| `qbd-analyzer.ts` | 12.8k | **Quality by Design engine.** Reads project quality data → derives `CqaItem` (Critical Quality Attributes) + `CppItem` (Critical Process Parameters). Each CQA: `name, materialType (drug_substance/drug_product), source (specification/method/…), ichBasis[], evidenceDetail`. CPPs: `name, processStep, acceptableRange, ichBasis[]`. |
| `qbd-helpers.ts` | 5.9k | QbD support utilities |
| `control-strategy-generator.ts` | 11.7k | **Deterministic ICH Q8/Q9/Q10/Q11 control-strategy builder.** Composes `ControlStrategyDocument`: CQA→control-element mapping, in-process controls (CPP→IPC), release tests + acceptance criteria, stability monitoring plan, raw-material controls, per-CQA risk-based justification, gap list (e.g. "No validated method linked to CQA X — ICH Q2(R1) gap"). Control types: `release_test \| in_process_control \| stability_monitoring \| raw_material_test \| process_parameter_range`. Scope: `drug_substance \| drug_product \| both`. |
| `ich-compliance-rules.ts` | 18.7k | **Per-guideline rule engine** — `checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D, checkQ6AandQ6B, checkQ8, checkQ9, checkQ10`. Emits `IchCheckFinding { guideline, status: pass\|warning\|fail\|not_applicable, … }`. |
| `ich-compliance-checker.ts` | 6.7k | Orchestrates the rules into `IchComplianceReport` with per-guideline rollup. Covers the guidelines "most commonly cited at FDA RTF." |
| `supac-classifier.ts` | 23k | **SUPAC change classification** — scale-up & post-approval change levels. |
| `aiInsights.ts` | 1.3k | `deriveInsights(issues, stages, dosageForm)` → AnA oversight cards: shelf-life claim risk (rule P8-003), missing microbial spec row (P5-007), lagging method validation. Each insight has `text, why (ruleId), action, ownerSuggestion`. |
| `readiness.ts` | 0.5k | `readinessScore({errors, warnings, overdueCriticalPath, highRisks})` — weighted penalty model (ERROR 2.5, WARN 1.0, OVERDUE 3.0, RISK 2.0). |

Control-strategy generator note: it "replaces the placeholder fallback at `server/api/cmc/playbookRoutes.ts`" and reads "the methods table, the stability program, and the CMC source-object store" — so there's a **CMC source-object store + methods table + stability program** in the schema, and routes under `server/api/cmc/`.

## The IND auto-flow + AI oversight (what the user built)

- **Auto data flow → Module 3**: CQAs/CPPs/specs/stability are derived from the project's real quality data via `qbd-analyzer`, then the control-strategy generator composes the structured 3.2.S/3.2.P control strategy with ICH citations. This is the "automatic data flow into Module 3" — data captured once flows into the control strategy + compliance report without re-entry.
- **AI oversight**: `aiInsights.deriveInsights` + `ich-compliance-checker` continuously flag gaps (shelf-life, microbial spec, method validation, ICH Q-series failures) with rule IDs, owners, and actions. `readiness.ts` rolls it into a single score.

## The full Module 3 backend (server/api/cmc/ — 30 files)

It's far larger than the services layer — a complete **Module 3 Operating System**:

- `module3OperatingSystemRoutes.ts` (31.6k) · `module3BuildStateRoutes.ts` · `module3ConvergenceRoutes.ts` · `cmcConvergenceMap.ts` — the build-state + convergence engine that assembles Module 3.
- `cmc-copilot.js` (21k) — the AI copilot.
- `change-impact-simulator.js` + `audit-risk-monitor.js` (32.8k) — change simulation + continuous audit risk.
- `batchRecordRoutes.ts` · `specificationRoutes.ts` · `stabilityRoutes.ts` · `blueprintRoutes.ts` · `documentRoutes.ts` · `workflowRoutes.ts` · `collaborationRoutes.ts` · `projectRoutes.ts` (22.9k) · `templateService.ts` · `global-compliance.js` (23.4k) · `manufacturing-tuner.js` · `preclinical-translator.js` · `regulatoryIR.ts` · `regulatory_aiDraft.ts` · `portfolio.ts`.

### Canonical type surface (`server/api/cmc/types.js`, zod)

- **molecularStructure** — moleculeName, molecularFormula, smiles, inchi, MW, synthesisPathway, analyticalMethods[], formulation.
- **formulation** — dosageForm, route, ingredients[{name, function, amount}].
- **processData** — processType (batch|continuous), processSteps[{name, parameters[{name,value,units,controlRange}], equipment[], materials[{name,function,grade}], criticalParameters[]}], controlStrategy, validationApproach.
- **analyticalMethod** — methodName, methodType (HPLC|GC|MS|NMR|IR|UV|DSC|XRD|Other), parameters[], validationStatus (validated|verification|development|technology-transfer), purpose.
- **documentType** — the full **CTD §3.2 section enum**: drug substance `s.1`–`s.7` (incl. s.2.1–s.2.6, s.4.1–s.4.5), drug product `p.1`–`p.8`.
- **changeType** — api_supplier_change, process_scale_up, excipient_replacement, analytical_method_change, facility_change, equipment_change, process_parameter_change, specification_change, packaging_change, stability_protocol_change.
- **regulatoryMarket** — fda, ema, pmda, nmpa, anvisa, health_canada, uk_mhra, who.
- **manufacturingData** — batchRecords[{batchNumber, parameters[{name,value,spec,deviation}], outcomes{yield,purity,success}}].
- **complianceDocument** — baseRegion (ich|fda|ema|pmda), targetRegions[], format prefs (localTerminology, regionalAnnexes, standardizeUnits).

### Portfolio metrics (`portfolio.ts`) — the CMC overview row per submission

`GET /overview` returns per submission: **RPI** (Regulatory Performance Index, via `services/reg/rpi`), `ir_open/ir_overdue` (information requests = HAQs from `reg_questions`), `obligations_open/overdue` (`reg_obligations`), `stability_cov_m` (stability coverage months), `m3_missing` (Module 3 missing sections), `preflight_critical`, `qc_alerts`, `playbook_open`. Plus `GET /rpi-trend`, `POST /snapshot/save` (writes `reg_rpi_snapshots`), `GET /export.csv`.

Tables in play: `reg_submissions`, `reg_questions`, `reg_obligations`, `reg_rpi_snapshots` (+ the CMC source-object store, methods, stability, specifications behind the services layer).

## Kit plan v2 — `ui_kits/cmc/` mapped to the real surface

The kit fronts the **Module 3 Operating System**. AnA-first, then data, then the build-state dashboards:
1. **Greeting + RPI** — "BX-301 Module 3 · RPI 64 · 2 IR overdue · M3 missing 3 sections · stability 12/24 mo."
2. **Composer + paperclip** — drop a batch record / spec / method validation / stability pull → files to project, QbD re-derives. Starters: generate control strategy · run ICH compliance check · simulate this change (SUPAC) · what's blocking my shelf-life claim · translate §3.2.P for EMA.
3. **Today queue** — `aiInsights` cards + overdue IRs + M3-missing sections.
4. **Module 3 build state (collapsible):** §3.2.S `s.1–s.7` / §3.2.P `p.1–p.8` section grid with per-section convergence/build status; CQA + CPP tables (QbD); control strategy with ICH citations + gaps; ICH compliance chips (Q1A…Q10); stability program; batch records; SUPAC change simulator; global-compliance market matrix.
5. **RPI score** + trend.

Every section routes into Authoring (the §3.2 doc) + the e-sign/approval chain. Change simulator + ICH checker are the AI-oversight surface.

## Still to confirm (pull next session)

## Kit plan — `ui_kits/cmc/` (AnA-first, per the standing rule)

**Recommendation: (a) UI over an already-rich backend.** The QbD + control-strategy + ICH-compliance + readiness engines are built. The kit is a front door, not new logic.

Surface structure (AnA-first → data entry/upload → dashboards):
1. **Greeting + state** — "BX-301 Module 3 · readiness 64 · 2 ICH gaps, 1 method validation lagging."
2. **Composer + paperclip** — drop a method validation report / spec / batch record → files to the project, QbD analyzer re-derives CQAs. Starters: "Generate the control strategy for drug substance", "Run the ICH compliance check", "What's blocking my shelf-life claim?", "Classify this manufacturing change (SUPAC)".
3. **Today queue** — the `aiInsights` cards (shelf-life risk, missing micro spec, lagging method validation) as actionable rows.
4. **Working data (collapsible dashboards):**
   - **3.2.S / 3.2.P structure** — CQA table (attribute · material · ICH basis · linked method · acceptance) + CPP table (parameter · step · range · ICH basis).
   - **Control strategy** — generated control elements grouped by type, each with ICH citation + justification + gap flags.
   - **ICH compliance report** — per-guideline status chips (Q1A/Q2/Q3A-B/Q3D/Q6A-B/Q8/Q9/Q10) with findings.
   - **Stability program** — conditions, timepoints, % complete (already in intelligence kit's STABILITY fixture).
   - **SUPAC change classifier** — change → level → filing requirement.
5. **Readiness score** — the weighted model, with the penalty breakdown.

Every CQA/control/finding row routes into Authoring (the §3.2 sections) and the e-sign/approval chain. Reuses the biopharma/submission chassis CSS.
