# Concept2Cure.RI — Whole-Product Audit & Reporting/Prediction Implementation Spec

**Date:** 2026-06-15
**Author:** Cross-functional review (global device/IVD regulatory, UX, PM, data/ML)
**Method:** Direct reconciliation against live code on branch `claude/medical-device-audit-spec-9w994x`. Every "state" claim below was checked against a file, not a prior audit doc.
**Status:** Assessment + implementation spec. **No code written — design only.**

---

## Part 0 — How to read this

You asked two things:

1. An **end-to-end audit** of the product — effectiveness, UX, full workflow for global submissions, PM features, where we stand, gaps, moats — with specific attention to **reporting** (user / enterprise / project), **prediction/modeling**, and our **analytics & AI (AnA)** depth.
2. **One implementation spec** in a specific shape: what's missing, what it does, who it's for / not for, what success looks like, what's out of scope, then a step-by-step build with the key decisions and my defaults at each step.

Parts 1–4 are the audit. **Part 5 is the spec.** The spec is scoped to the **Reporting & Prediction Intelligence layer**, because that is simultaneously (a) the thing you asked most about, (b) the single highest-leverage gap in the product, and (c) where the most finished-but-trapped value already sits. I explain that choice in Part 4.

---

## Part 1 — What this product actually is (so the audit is grounded)

**Concept2Cure.RI / "AnA 1.0 RI"** is an enterprise regulatory-intelligence platform for life sciences (biotech, pharma, medtech, IVD, CRO). React 18 + Vite single-page client (`client/src/concept2cure/`, shell `ZenApp.tsx`), Node/TypeScript server (~300 route files, ~200 services), Postgres + pgvector, Drizzle ORM. The pitch is "what Harvey did for law, C2C does for life sciences," delivered chat-first through the **AnA** assistant that sits on top of a proprietary **RIM** (Regulatory Intelligence Model).

It is genuinely **broad**: regulatory authoring, eCTD assembly, 510(k)/PMA/De Novo/IND/NDA-BLA, EU MDR CER + IVDR, pharmacovigilance, CMC, biostatistics, quality, collaboration/tasks, and a deep IVD knowledge base. Competitor analyses in the repo position it as ~10× the scope of Artos AI and Weave Bio, who each do one thing (IND/document authoring) very well.

**The recurring structural truth of the codebase** (confirmed by `GA_GAP_AUDIT_2026-06-10.md` and re-verified here): **strong, tested backends with little or no UI wired to them.** The engineering depth is real; the productization is the gap. This pattern is the single most important fact for any planning decision, and it is exactly what dominates the reporting/prediction layer.

---

## Part 2 — Audit verdict by dimension

Scoring is deliberately blunt: **Strong / Real-but-trapped / Thin / Missing.**

### 2.1 Effectiveness for global regulatory submissions

| Capability | State | Evidence |
|---|---|---|
| eCTD assembly (ICH backbone + FDA/EMA/PMDA regional XML, MD5 index, ZIP, DTD bundling, PDF/A gate) | **Strong (backend)** | `server/services/submission-gateways/regional-packager.ts`, `server/services/ectd/{dtd-bundler,pdfa-readiness}.ts` |
| Region/agency profiles | **Strong (backend)** | `region-profiles/region-profile-service.ts`, `ectd/ectd-regional-rules.ts` — FDA, EMA, PMDA heavily modeled; NMPA, MFDS, TGA present |
| IND / NDA / BLA / ANDA (pharma, via eCTD) | **Strong (backend)** | no separate engine — all use the eCTD pathway; IND lifecycle schema is real |
| **510(k) / De Novo (eSTAR)** | **Thin — mapper only** | `pathway-engines/estar/estar-mapper.ts` maps leaves → eSTAR slots + computes readiness; **no eSTAR form/PDF assembly.** This is a *device* pathway and weaker than the pharma side |
| **PMA (FDA device)** | **Missing (stub)** | declared in UI/constants; no pathway engine, no assembly |
| EU MDR / IVDR technical file | **Partial** | `pathway-engines/mdr-ivdr/{tech-doc-assembler,technical-file-packager}.ts` map to Annex sections + readiness; **ZIP emission not tested end-to-end** |
| EU MDR CER | **Strong** | `server/services/cer/index.ts` (generate+validate, fail-closed), MEDDEV/GSPR validator |
| IVD/IVDR **knowledge** (classification, performance eval, companion Dx, global pathway readiness) | **Strong (backend, deep, read-only)** | `server/services/ivd-knowledge/**` + `regulatory/{ivd-assessments,ivdr-classification,ivdr-performance-evaluation,companion-diagnostics}.ts`, `global-pathways.ts` readiness assessors |
| Live submission gateways (FDA ESG, EMA CESP/EUDAMED, PMDA) | **Real but credential-gated** | wire-level AS2/SFTP/REST/HMAC clients exist and are tested; transmit returns `transmitted:false, gateway_not_configured` without creds — **honest, never fabricates ACKs** |
| Global agencies **beyond FDA/EMA/PMDA** (Health Canada, NMPA, ANVISA, TGA, MFDS, MHRA, Swissmedic, India) | **Knowledge-only — no gateway/assembly** | rich knowledge corpus + readiness scoring; **no transmission gateway, no submission assembly** for any of them |
| External eValidator (LORENZ) dry-run gate | **Missing (specced)** | internal validators only; `EVALIDATOR_INTEGRATION_SPEC.md` defines the seam; licensed engine not integrated |
| Licensed eCTD DTDs | **Missing (procurement)** | bundling code + self-containment gate done; `.dtd` files not vendored |

**Verdict (corrected after global-coverage review):** The submission engine is **production-grade for pharma eCTD in exactly three regions — FDA, EMA, PMDA** (full assembly, regional XML, validation, lifecycle, credential-gated real transmission, 15 test files). But the **device/IVD assembly you specialize in is the weaker half of the platform:** eSTAR (510(k)/De Novo) is a mapper without form/PDF generation, PMA is a stub, MDR/IVDR ZIP is untested end-to-end, and every agency outside the big three is knowledge-corpus only. The deep IVD strength today is **advisory** (classification, performance-evaluation, companion-Dx, readiness, shadow-review lenses incl. `nb_mdr`/`nb_ivdr`) — not packaging/transmission. This is an important caveat for an IVD-led GTM: we can *advise* globally and *submit* pharma to three regions, but we cannot yet *assemble and transmit a device/IVD submission* to most markets. Remaining pharma blockers are procurement/integration (eValidator, DTDs, ESG creds/UAT, Veeva); device gaps are genuine engineering.

### 2.2 User experience

- **Design system is a genuine asset.** Reviewer-grade, calm, Anthropic-inspired (cream canvas, terracotta accent, serif long-form), 28 governed components, strict tokens, motion discipline, WCAG 2.2 AA enforcement skill, microcopy-tone skill, 21 CFR Part 11 UX skill. This is real differentiation and rare in regulatory software.
- **The UX risk is the inverse of the design quality:** because so many backends have no UI, the surfaces that *do* exist sometimes render **fixtures** rather than live data (see 2.3). A reviewer-grade shell over mock data is a trust risk in a regulated tool — it must be governed so it never ships looking final while being placeholder.
- **Chat-first is coherent** (`AnaPersistentPanel`, persistent 400px rail, context cards, "Ask AnA about this" chips) but means almost every capability funnels through one composer; discoverability of the deep backends depends on AnA knowing they exist.

### 2.3 Reporting (your headline question)

This is the most important finding in the audit, so it gets the most detail.

**There are two parallel reporting systems that do not meet.**

**System A — REPORT_OS (the real engine, no UI):**
- Schema: `shared/schema/report-os.ts` + `migrations/0014_report_os_foundation.sql` — `report_type_registry`, `report_runs`, `report_snapshots`, `report_run_dependencies`, `report_program_groups (+projects, +snapshots)`. Scope enum: `account | program | project | study | submission | document`.
- Services: `server/services/report-os/{orchestrator,scope-model,taxonomy,research-compliance-report-providers}.ts`. The orchestrator runs a real provider graph (`artifact_state`, `submission_readiness` via `regulatory/readinessEvaluator`, `compliance_audit`), computes blockers + confidence + freshness, and registers a governed immutable artifact.
- Routes: `server/routes/report-os.ts` — full surface: scopes, taxonomy seed/list, program-groups CRUD + snapshots, **runs** (create/list/dependencies/`export.pdf`), **bundles** (+`export.pdf`), **deliveries**, **correspondence/capture**, health.
- **This is ~80% of the March `REPORT_OS_ARCHITECTURE` plan, built and tested — with no client UI pointed at it.**

**System B — the Reports surface the user actually sees (UI, but mock):**
- `client/src/concept2cure/intelligence/surfaces/Reports.tsx` renders KPIs, readiness bars, precedent-likelihood "models," and a timeline forecast table.
- It is driven by `useReports()` (`intelligence/hooks.ts`), which calls `GET /api/intelligence/reports` but **falls back to hardcoded fixtures** (`REPORT_KPIS`, `REPORT_BARS`, `FORECAST`, `PRECEDENT_MODELS`) when the route returns nothing. The route (`server/routes/intelligence.ts`) only populates `forecast` from a `c2c_forecast_snapshots` table; `kpis/bars/models` are stubbed/empty in practice → the user sees fixtures.
- The "Export PDF" button does **not** call REPORT_OS's `runs/:id/export.pdf`; it sends a chat string to AnA ("Export the timeline forecast as a PDF").

**Other reporting assets (real, no UI):** `intelligent-report-engine.ts` (21 report families, cryptographic seal, provenance atoms, drift detection, JSON/CSV/manifest/DOCX-ledger export — `/api/intelligent-reports/*`); IND lifecycle dashboards/cockpit/portfolio (`server/services/ind-lifecycle/*`, data-only); 16 Prometheus metric modules; `usage-metering.ts` + Stripe billing; tenant-export + attestation report services.

**Verdict on reporting:** *Real-but-trapped, and worse — split.* The platform has a governed, scope-aware report engine **and** a polished reporting UI, and they are wired to different backends. The visible one is mock. This is the gap to close, and it is mostly integration + UI, not greenfield.

**Scheduled / recurring reports, generalized portfolio analytics, "enterprise" cross-org rollups:** **Missing** as generalized features. Portfolio rollup exists only for IND (`ind-portfolio.ts`). No digest/scheduler engine.

### 2.4 Prediction & modeling (your second headline question)

This is genuinely strong and more real than typical "AI regulatory" marketing:

| Asset | What it really is | State |
|---|---|---|
| **Risk model** (`intelligence/risk-model.ts`) | **Real logistic regression** for RTF / CRL / first-cycle-approval. Cold-start network prior < n=30, then blended trained model; gradient descent + L2, holdout AUC/Brier, activation gate refuses regressions. | Strong, tested |
| **RIM core** (`intelligence/rim.ts`, `readiness-scoring-engine.ts`, `judgment-framework.ts`) | Heuristic **orchestrator** blending readiness rules + pattern registry + the risk model + judgment reasoning. Versioned (1.1.0), signal persistence, audit per run. Not a single ML model — a composable judgment layer. | Strong, tested |
| **Submission-readiness twin** (`innovation/submission-readiness-twin-service.ts`) | Predicts approval probability, review-time days, deficiency count; per-domain readiness across 510(k)/PMA/IVD-510(k)/De Novo/CER/EU-IVDR. | Strong, UI-wired, tested |
| **Precedent engine** (`precedent-engine.ts`, `regulatory-precedent-intelligence/*`) | 510(k) predicate lineage, CRL trigger patterns, RTF triggers, EMA Day-120/180 patterns, advisory-committee risk. Semantic + structured search. | Strong (corpus is data-starved — see 2.6) |
| **RIM-lite registration grid** (`services/rim/*`) | Deterministic country×market registration + label-currency tracking. Replaces low-end Veeva-RIM use case. | Strong, tested |
| **Federated learning** (`cognitive-ecosystem/federated-learning.service.ts`) | MELLODDY-style FL with differential privacy (Laplace), secure aggregation, privacy budgets. | Architecturally complete, **not live** (no participants) |
| **Bayesian device design** (`stats/bayesian-device.ts`) | Exact Beta-Binomial posterior, OC curves, sample-size, interim predictive prob — per FDA 2010 device guidance. | Strong, pure-math, tested |

**Verdict on prediction:** Strong and honest (the code is transparent about ML vs heuristic vs rules, and degrades honestly rather than fabricating). **But almost none of it is surfaced as a *report or insight a buyer can read and act on*.** Predictions live inside AnA tool calls and validation paths, not in a portfolio-level decision surface. That is the moat being left on the table.

### 2.5 Analytics & AI (AnA) depth

- **AnA / AI gateway** (`ai-gateway/gateway.ts`): multi-provider router (Claude flagship + GPT-4o + Kimi long-context fallback), task-based routing, health tracking, policy enforcement, **audit on every call**, deterministic test mode, model cards + approved-model registry governance.
- **3-layer memory** (working / project / client) with a real orchestrator (`memory-orchestrator.ts`, `memory-context-assembler.ts`): parallel retrieval, unified cross-layer ranking, forgetting policy, dedup. pgvector embeddings via abstracted provider (supports on-prem/air-gapped local embeddings).
- **~100+ governed AnA tools** (`ana/AnaToolDefinitions.ts`) incl. ClinicalTrials.gov, CMS coverage, connected repositories, study-design advisors, submission-twin and precedent calls. Tool telemetry persisted.

**Verdict:** AnA is a real, governed agentic layer — a genuine strength. It is the right delivery vehicle for the reporting/prediction layer (generate-by-conversation, then pin as a governed artifact).

### 2.6 Data & corpus

- The precedent/benchmark intelligence is only as good as the corpus, and **the corpus tables are near-empty** until someone runs the (now-runnable) ingestion sweep (`scripts/ingest-corpus.ts`, `docs/runbooks/corpus-ingestion.md`). This is data-ops, not engineering — but it directly gates the credibility of predictions and precedent reports.

### 2.7 Project-management features

- Collaboration/Communication Center (tasks, threads, presence, mentions, review pulse) exists; unified project hierarchy (`projects` self-referential program/project/study/sub-project) exists; IND cockpit/portfolio exists.
- **Gap:** no generalized cross-program PM rollup (timeline/milestone/risk portfolio across *all* pathways and devices) — only IND has it. This is the natural home for "project reporting" and "enterprise reporting."

---

## Part 3 — Gap register (prioritized, reporting/prediction-weighted)

**P0 — blocks a credible reporting/insights GA**
1. **Reporting is split and the visible surface is mock.** Reports.tsx renders fixtures; REPORT_OS (the real engine) has no UI. *Close by wiring the UI to REPORT_OS, not by building new backend.*
2. **No prediction is surfaced as a decision artifact.** Risk model, twin, precedent, RIM all run, but no portfolio/program surface shows "approval probability, predicted review time, top CRL/RTF risks, what to fix" as a governed, exportable report.
3. **Truthfulness governance for reports/UI.** Fixtures must be visibly labeled as sample data and never exportable as governed artifacts; REPORT_OS already computes confidence/blockers — the UI must show them.

**P1 — completeness / "enterprise"**
4. **Scheduled & subscribed reports** (weekly exec digest, drift-triggered reruns) — missing engine.
5. **Generalized portfolio analytics** across all pathways/devices (not just IND) — missing.
6. **Enterprise/cross-org reporting & export** for multi-account customers (CROs, holding cos) — partial (tenant-export exists; no aggregate UI).
7. **PDF/A export wiring end-to-end** from the UI (REPORT_OS has `export.pdf`; UI doesn't call it).

**P2 — moat / depth**
8. Corpus ingestion sweep (data-ops) to make precedent/risk credible.
9. eValidator + DTD + ESG procurement to make pharma submissions real.
10. **Device/IVD submission assembly** — eSTAR form/PDF generation, PMA pathway engine, MDR/IVDR ZIP end-to-end (genuine engineering, and directly relevant to an IVD-led GTM; today IVD support is advisory, not packaging/transmission).
11. Federated-learning go-live (needs design partners).

---

## Part 4 — Why the spec targets the Reporting & Prediction Intelligence layer

Three reasons, in priority order:

1. **It's what you asked about** — user/enterprise/project reporting, prediction reports/modeling, AnA analytics — all four are the same layer.
2. **Highest leverage, lowest risk.** The backends (REPORT_OS orchestrator + governed export, risk model, twin, precedent, RIM, billing/usage) are built and tested. The work is integration + UI + a thin scheduling/portfolio addition — the cheapest path to the most visible value, and it directly fixes the "polished shell over mock data" trust risk.
3. **It's the differentiated moat.** Anyone can draft an IND (Weave/Artos do). Almost no one ships a **governed, scope-aware, prediction-backed regulatory decision surface** — "here is your portfolio's approval probability, predicted review timeline, top filing risks with precedent, and the exact gaps to close, sealed and exportable for the board." That is RIM's reason to exist, and it's currently invisible.

### Moat ideas (called out separately, per your ask)
- **The Regulatory Forecast Report** — portfolio-level "approval probability × predicted review time × deficiency forecast," precedent-cited, sealed. The flagship artifact. No competitor surfaces this.
- **CRL/RTF Pre-Mortem** — before submission, the top historical refuse-to-file / complete-response triggers this dossier matches, with the fix list. Sells itself to RA leads.
- **Board/Diligence Pack** — one sealed, provenance-backed PDF for investors/acquirers: portfolio readiness, risk, timeline, evidence gaps. A diligence accelerator.
- **Drift-triggered reruns** — when a dependency changes (new guidance signal, artifact edit, readiness drop), the relevant report reruns and notifies — "living reports," not static exports.
- **Confidence-as-a-feature** — every number carries its denominator, freshness, and confidence. In a regulated tool, *honest uncertainty* is a trust moat against competitors that overstate.

---

# Part 5 — IMPLEMENTATION SPEC: Reporting & Prediction Intelligence Layer ("Report OS GA")

> This is the deliverable. It is design only. Nothing here is built yet.

## 5.1 What's missing (the one-paragraph problem statement)

The platform has a governed, scope-aware report engine (REPORT_OS) and a set of real prediction models (risk/twin/precedent/RIM), but the only reporting *surface a user sees* is wired to a different, fixture-backed endpoint and shows no predictions. There is no UI that lets a regulatory leader pick a scope, run a governed report, read the prediction-backed insight, see confidence and what's blocking it, and export or schedule it. We need to **unify the two reporting systems behind one Report Workspace, surface the predictions as readable insight, and add the thin missing pieces (scheduling, portfolio rollup, end-to-end PDF/A export).**

## 5.2 What it does

A single **Report Workspace** where a user:
1. **Picks a scope** (account / program / project / study / submission / document) — or a saved **program group**.
2. **Picks a report type** from the governed taxonomy (Exec/Board, RA Lead, QA/Audit, CMC, Medical Writing, Investor/Diligence, plus the new **Regulatory Forecast** and **CRL/RTF Pre-Mortem**).
3. **Runs it** — the REPORT_OS orchestrator executes the provider graph, now including **prediction providers** (risk model, submission twin, precedent), and returns blockers, confidence, freshness, and a governed immutable artifact.
4. **Reads the insight** — readiness, predicted approval probability / review time / deficiency count, top risks with precedent citations, the prioritized fix list — each value annotated with confidence + freshness + source.
5. **Exports** to PDF/A (sealed) or DOCX-ledger, or **schedules** it (weekly digest / drift-triggered rerun) and **subscribes** recipients.
6. Optionally **invokes the whole thing from AnA** ("Run the board pack for the cardio program") and pins the result.

## 5.3 Who it's for

- **Regulatory Affairs leads / heads of reg** — readiness, risk, fix lists, agency-response packs. Primary.
- **Program / project managers** — portfolio timelines, milestones, blockers across pathways. Primary.
- **Executives / boards / investors** — the sealed forecast and diligence packs. Primary buyer-economic.
- **QA / audit** — provenance, compliance, signature, audit-trail reports. Primary for Part 11 credibility.
- **CRO account leads** — multi-client/enterprise rollups.

## 5.4 Who it's NOT for (explicit non-users)

- **Document authors mid-draft** — they live in the editor; reporting is read-only decision support, not an authoring surface. (REPORT_OS is already "drives decisions, not edits.")
- **Patients / external public** — no consumer reporting.
- **Real-time operational dashboards / BI replacement** — this is governed periodic/triggered reporting, not a Grafana/Looker substitute. Ops metrics stay in Prometheus.
- **Data scientists wanting raw model access** — model internals stay in the prediction services; this layer surfaces *outputs*, not a notebook.

## 5.5 What success looks like

- **Functional:** A user runs any of the 8 report types at any valid scope, gets a governed artifact with correct blockers/confidence/freshness, exports a sealed PDF/A, and schedules a recurring run — with **zero fixture data** reaching a governed export.
- **Trust:** Every number in every report traces to a provider with a freshness timestamp and confidence; "final-ready" is blocked when dependencies are missing (truthfulness policy enforced and tested).
- **Adoption (design-partner):** ≥1 program runs the Exec/Board + RA Lead + QA/Audit packs end-to-end; ≥1 scheduled digest delivered; the Regulatory Forecast is shown to a real decision-maker.
- **Moat:** The Regulatory Forecast and CRL/RTF Pre-Mortem are demoable on real (ingested) corpus data with honest confidence.
- **Non-regression:** No new `Math.random()` in regulated output; tenant isolation contract tests pass; Part 11 audit on every report run, seal, and export.

## 5.6 Out of scope (for this spec)

- New prediction models or model retraining (we surface existing ones).
- Corpus ingestion sweep (data-ops; a *dependency*, tracked separately).
- eValidator / DTD / ESG procurement (submission send, not reporting).
- Federated-learning go-live.
- A general BI / ad-hoc query builder.
- Real-time streaming dashboards.
- Replacing the editor's inline inspectors (they stay; they become *providers*).

## 5.7 Build steps — each with the key decisions and my default

> Ordered so each slice is shippable and the riskiest integration (proving REPORT_OS drives a real UI) comes first. "Default" = what I'd do absent a reason to deviate.

### Step 1 — Reconcile the two reporting systems (decide the single source of truth)
- **Key decision:** Keep the fixture-backed `/api/intelligence/reports` + `Reports.tsx`, or retire it in favor of REPORT_OS?
- **Default:** **Retire System B as the source of truth; REPORT_OS is canonical.** Re-skin `Reports.tsx` into the new Report Workspace shell, but point every data path at `/api/report-os/*`. Keep the design-system components; drop the fixtures from any governed path.
- **Decision:** What happens to fixtures? **Default:** demote to an explicit `sampleData: true` empty-state preview only, visibly labeled "Sample — run a report to see live data," never exportable.
- **Decision:** One workspace or per-persona surfaces? **Default:** one workspace, persona-filtered report-type list (taxonomy already carries `allowedPersonas`).

### Step 2 — Wire the Report Workspace shell to live REPORT_OS reads (no new backend)
- Build scope selector + program-group picker + report-type list + runs/history list + a run detail view, all bound to existing endpoints (`/scopes`, `/taxonomy`, `/program-groups`, `/runs`, `/runs/:id/dependencies`).
- **Key decision:** Run synchronously or async with polling? **Default:** **async** — POST `/runs` returns a run id; poll/subscribe for completion (orchestrator already records status). Keeps UI responsive for portfolio-scale runs.
- **Key decision:** How to render confidence/blockers? **Default:** every section header shows a freshness chip + confidence band; blockers render as a "what's missing to make this final" list at the top, not buried. Reuse the calm status-pill vocabulary.
- **Decision:** Empty/degraded states? **Default:** show partial reports with explicit caveats (orchestrator already supports `partial`), never hide degradation.

### Step 3 — Add prediction providers to the orchestrator
- Extend the provider graph with adapters over existing services: `riskModelProvider` (RTF/CRL/approval), `submissionTwinProvider` (approval prob / review days / deficiency count), `precedentProvider` (predicate lineage, CRL/RTF triggers, advisory risk).
- **Key decision:** New providers or fold into existing readiness provider? **Default:** **separate providers** — keeps freshness/confidence per-source and lets report types opt in via the taxonomy `dataDependencies`.
- **Key decision:** What if the corpus is empty (cold-start)? **Default:** providers return the model's honest cold-start output (network prior / "insufficient data, confidence: low") — **never** a fabricated number. This is the truthfulness policy; add a test that asserts no high-confidence prediction when n < threshold.
- **Decision:** Where does prediction provenance live? **Default:** record model id + version + input hash in `report_run_dependencies`, so a sealed forecast is reproducible and auditable.

### Step 4 — Define the two flagship report types in the taxonomy
- Add `regulatory_forecast` and `crl_rtf_premortem` to `report_type_registry` with their dependency contracts, allowed scopes (program/project/submission), personas (RA lead, exec), export template, and truthfulness rules.
- **Key decision:** Seed taxonomy in migration or via the existing `/taxonomy/seed` route? **Default:** **idempotent seed route** run on deploy (already exists) — keeps taxonomy data-driven, not hardcoded in a migration.
- **Decision:** How prescriptive is the fix list? **Default:** prioritized, evidence-cited, and scoped to actions the platform can verify (don't invent regulatory advice the corpus can't support).

### Step 5 — End-to-end governed export (PDF/A + DOCX-ledger)
- Wire the workspace export button to `GET /runs/:id/export.pdf` and the `intelligent-report-engine` DOCX-ledger path. Embed the provenance/confidence appendix.
- **Key decision:** PDF or PDF/A? **Default:** **PDF/A** (reuse `pdfa-readiness.ts`) — these are regulatory artifacts; archival format is non-negotiable.
- **Key decision:** Seal on every export or on demand? **Default:** seal on "finalize," not on every draft export; drafts are watermarked "Draft — not sealed." Reuse `immutable_report_records` + seal events.
- **Decision:** Who can finalize/seal? **Default:** manager+ role, with Part 11 e-sign manifestation (`/signatures/:id/manifest` already exists) — and audit-log the export.

### Step 6 — Scheduling, subscriptions, and drift-triggered reruns (the thin new engine)
- Add a scheduler: cron-style recurring runs + a subscription model (recipients, cadence) + a drift trigger that reruns when a tracked dependency changes (artifact edit, readiness drop, new guidance signal from `intelligence/signal-capture.ts`).
- **Key decision:** Build a scheduler or reuse existing workers? **Default:** reuse the existing worker/queue infra (`workers/`) — add a `report_schedules` table + a job; don't introduce a new scheduling system.
- **Key decision:** Delivery channel? **Default:** in-app notification + the existing `/deliveries` route, email behind a flag (avoid email-deliverability scope creep at first).
- **Decision:** Drift sensitivity? **Default:** conservative — rerun on dependency *status* change, not every keystroke; debounce; let the user tune per subscription.

### Step 7 — Portfolio & enterprise rollup (generalize beyond IND)
- Generalize the IND portfolio pattern (`ind-portfolio.ts`) into a scope=`account`/`program` rollup that aggregates readiness/risk/timeline across all pathways and devices, preserving source scope IDs and per-provider freshness (no blind averaging — the orchestrator's aggregation rule already mandates this).
- **Key decision:** New aggregation service or extend orchestrator? **Default:** extend the orchestrator's account/program scope path; reuse its denominator/staleness disclosure rules.
- **Decision:** Cross-org (true enterprise/CRO) aggregation now or later? **Default:** **later** — ship single-org portfolio first; cross-org needs the multi-account permission model and is P1.

### Step 8 — AnA integration (generate-by-conversation, pin-as-artifact)
- Add AnA tools: `run_report(scope, type)`, `schedule_report(...)`, `explain_forecast(...)`. AnA invokes REPORT_OS and returns a link to the governed run; "pin" persists it.
- **Key decision:** Does AnA generate report *prose* or call the deterministic engine? **Default:** **call the engine** for all numbers/governed content; AnA only adds natural-language framing around engine outputs — never invents figures. Enforce via the existing AI-gateway audit + grounding eval.

### Step 9 — Truthfulness, governance, and tests (gate before GA)
- **Key decision:** What blocks a "final" report? **Default:** any missing required dependency, any stale-beyond-budget provider, or any prediction below confidence threshold → "final" disabled with the reason shown.
- Tests to add: fixture-never-exported test; tenant-isolation contract on all `/report-os` reads; truthfulness test (no high-confidence prediction at cold-start); seal/verify round-trip; Part 11 audit-on-export.
- **Decision:** Accessibility? **Default:** run the `accessibility-enforcement` skill on every new surface (ARIA live for async run status, keyboard-navigable scope tree, color-never-alone for confidence bands).

## 5.8 Suggested slicing (so it ships incrementally)

- **Slice 1 (P0, proves the thesis):** Steps 1–2 + Step 5 export — Report Workspace reads live REPORT_OS, runs the 3 existing report families (Exec/Board, RA Lead, QA/Audit), exports sealed PDF/A. Kills the mock-data trust risk.
- **Slice 2 (the moat):** Steps 3–4 — prediction providers + Regulatory Forecast + CRL/RTF Pre-Mortem.
- **Slice 3 (enterprise):** Steps 6–7 — scheduling/subscriptions + portfolio rollup.
- **Slice 4 (delight):** Step 8 AnA integration + Step 9 hardening throughout.

## 5.9 Dependencies & risks (call them now)

- **Corpus ingestion** must run for predictions/precedent to be credible — schedule the data-ops sweep in parallel with Slice 1 so Slice 2 lands on real data.
- **Confidence honesty is the whole game.** The biggest risk is shipping a beautiful forecast on a thin corpus that overstates certainty. The default everywhere is *degrade honestly*; back it with tests.
- **Don't let it become BI.** Hold the line on governed periodic/triggered reporting; resist ad-hoc query/dashboard scope creep.

---

## Appendix — Key evidence files (for re-verification)

- Reporting engine: `shared/schema/report-os.ts`, `migrations/0014_report_os_foundation.sql`, `server/services/report-os/{orchestrator,scope-model,taxonomy}.ts`, `server/routes/report-os.ts`
- Mock surface: `client/src/concept2cure/intelligence/surfaces/Reports.tsx`, `client/src/concept2cure/intelligence/hooks.ts`, `server/routes/intelligence.ts`
- Report engine (alt): `server/services/intelligent-report-engine.ts`, `server/routes/intelligent-reports.ts`
- Prediction: `server/services/intelligence/{rim,risk-model,readiness-scoring-engine,judgment-framework}.ts`, `server/services/innovation/submission-readiness-twin-service.ts`, `server/services/precedent-engine.ts`, `server/services/regulatory-precedent-intelligence/*`
- AnA: `server/services/ai-gateway/gateway.ts`, `server/services/memory-orchestrator.ts`, `server/services/ana/AnaToolDefinitions.ts`
- Submissions/global/IVD: `server/services/submission-gateways/regional-packager.ts`, `server/services/region-profiles/region-profile-service.ts`, `server/services/ivd-knowledge/**`, `server/services/cer/index.ts`
- Prior plan this supersedes/extends: `docs/plans/REPORT_OS_ARCHITECTURE_AND_IMPLEMENTATION_SLICE_2026-03-30.md`
- Prior whole-platform audit: `GA_GAP_AUDIT_2026-06-10.md`
</invoke>
