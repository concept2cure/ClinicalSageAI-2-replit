# Concept2Cure Insights — Reporting, Analytics & Prediction Layer

**Implementation specification (build-ready, not built)**
**Date:** 2026-06-15
**Status:** Draft for approval — no code written, this is the plan
**Audience:** Product, engineering, design, regulatory affairs, and the exec sponsor

> This spec is the deliverable of an end-to-end audit of Concept2Cure.RI / ClinicalSageAI as a
> global regulatory-submission platform, conducted from the combined viewpoints of pharma/medtech
> regulatory leads, CRO consultants, biostatisticians, and program managers. It is scoped to the
> one capability the audit found most under-productized relative to its backend depth:
> **reporting, analytics, and prediction.** Everything below is grounded in the code as it exists
> on 2026-06-15, with file paths so engineering can verify each claim.

---

## 0. Where we stand (the audit, in one page)

The recurring finding across every prior audit (`GA_GAP_AUDIT_2026-06-10.md`,
`reports/ga-readiness-audit-2026-06-14/`) is **"strong, tested backends with no UI wired to them."**
Reporting and analytics is the sharpest instance of that pattern. We are not missing the engine; we
are missing the product.

**What already exists and is genuinely strong:**

- **Report-OS** — a production-grade reporting backbone that the rest of the product has not caught
  up to. `server/routes/report-os.ts` (1,627 lines), `shared/schema/report-os.ts`, and
  `server/services/report-os/` give us: six report **scopes** (`account`, `program`, `project`,
  `study`, `submission`, `document`), a **report type registry** (`reportTypeRegistry`, 25+ seeded
  types in `taxonomy.ts`) carrying `allowedScopes`, `allowedPersonas`, `dataDependencies`,
  `artifactDependencies`, `governanceRequirements`, and **`truthfulnessRules`**; **report runs**,
  **versioned snapshots**, per-run **dependency tracking**, **program groups** with point-in-time
  **snapshots** (`projectSetHash`), report **bundles**, **deliveries**, and correspondence capture.
- **A deterministic run computation engine** — `server/services/report-os/orchestrator.ts` evaluates
  real DB evidence (`concept2cureArtifacts`, `sections`, `projects`) through five providers
  (`artifact_state`, `submission_readiness`, `compliance_audit`, `regional_registry_readiness`,
  `regional_package_manifest`) and emits **confidence (clamped 25–95)** and an explicit **blocker
  list**. This is honest, evidence-grounded, and Part-11-shaped.
- **Immutable, sealed report records** — `server/services/intelligent-report-engine.ts` +
  `immutableReportRecords` / `reportAtomProvenance` / `reportSealEvents` /
  `indemnificationAttestations`: SHA-256 hash chains, Merkle roots, atom-level provenance with
  confidence and drift detection, AI-disclosure fields, multi-signature workflow, 17 regulatory
  bodies. 21 CFR Part 11-grade.
- **Persona report generation** — `server/services/report-generator-service.ts` (investor,
  regulatory, biostats, CEO, ops) with an anti-fabrication rule that returns "unavailable" rather
  than inventing metrics.
- **Multi-format export** — PDF (`pdf-lib`/`pdfkit`/`jspdf`), DOCX (`docx`), XLSX (`exceljs`),
  PPTX (`server/services/pptxGenerator.ts`), ZIP submission packs (`cerv2-export-routes.ts`).
- **A real (and honest) prediction layer** — logistic-regression **risk model** for RTF/CRL/first-
  cycle approval with cold-start network priors (`server/services/intelligence/risk-model.ts`);
  Monte-Carlo **trial simulator** that refuses to run without evidence
  (`server/services/study-design/trial-simulator.ts`); **submission-readiness twin** with
  gap-based scoring (`server/services/innovation/submission-readiness-twin-service.ts`); AI-driven
  **submission twin** for claims/drift/challenges (`server/services/submission-twin-service.ts`);
  precedent intelligence with **Brier calibration**
  (`server/services/regulatory-precedent-intelligence/confidence-calibration-service.ts`).
- **Project/portfolio aggregation** — `server/services/project-rollup-service.ts` (weighted
  progress, budget, worst-risk, task rollup) and `server/services/ind-lifecycle/ind-portfolio.ts`
  (CRO/PM-grade IND roll-up).

**What is missing — the gap this spec closes:**

1. **No reporting UI.** The only "Reports" surface today
   (`client/src/concept2cure/intelligence/surfaces/Reports.tsx`) renders **static fixtures**
   (`REPORT_KPIS = { programs: 14, ready_avg: 76 … }`, hardcoded "+4 vs last week") via a
   `live ?? fixture` pattern whose `/api/intelligence/reports` endpoint **does not exist**. None of
   Report-OS, the report engine, persona reports, rollups, or the prediction services are surfaced to
   a user.
2. **No charting.** `recharts` is imported in **exactly one file** in the entire client
   (`client/src/components/ui/chart.tsx`). There is no governed chart vocabulary, no
   visualization-to-export parity.
3. **No rendered report body.** Report-OS computes providers, confidence, and blockers — but there is
   no **content/section model** that turns a run into a readable, provenance-linked report a regulator
   or exec would accept.
4. **No scheduling or delivery.** Subscriptions are **stubs** (`POST /api/reports/subscribe` returns
   success but persists nothing). The Bull/Redis scheduler exists
   (`server/services/automation/scheduled-jobs.ts`) but no report job is registered. No email/webhook
   delivery, no cadence, no digest.
5. **Prediction outputs are not packaged as reports.** The risk model, trial sim, and readiness twin
   produce numbers but are not assembled into governed, disclosed, exportable **prediction reports**.
6. **A safety blocker sits in the analytics path.** `server/routes/analytics-routes.ts:128,148` is a
   **post-auth OS command-injection / RCE** (PDF text → `child_process.exec`). Any reporting work that
   touches this file must close it first.

**Bottom line:** we have ~70% of a category-defining reporting product already written and tested,
trapped behind missing UI, a missing content/render model, missing visualization, and missing
scheduling. This spec turns that into a shipped capability.

---

## 1. What this capability is (the product)

**Concept2Cure Insights** is the platform's unified reporting, analytics, and prediction layer. One
surface, three jobs, all scoped from a single document up to an entire enterprise portfolio:

1. **Reporting** — generate governed, provenance-linked, exportable reports at any scope
   (document → study → submission → project → program → account), driven by the existing Report-OS
   type registry and run engine. Reports are versioned, snapshot-able, and — when marked final —
   immutably sealed under 21 CFR Part 11.
2. **Analytics** — live, interactive dashboards that aggregate the same evidence the reports draw on
   (readiness, artifact lifecycle, audit/compliance posture, submission status, review throughput,
   PV signals) across whatever scope the user selects, with drill-down to the underlying records.
3. **Prediction** — packaged, clearly-disclosed forecast reports built on the existing honest models
   (RTF/CRL risk, approval probability, predicted review time, trial probability-of-success,
   readiness trajectory), every figure labeled with its method, confidence, and validation status.

The layer is **AnA-native**: every report and chart carries an "Ask AnA about this" affordance, AnA
can generate the narrative layer over the deterministic providers (never the numbers themselves), and
a user can request a report conversationally ("Give me the board-pack readiness digest for the
cardio program as of last Friday"). AnA narrates; the providers compute; provenance binds the two.

**One-line positioning:** *the reporting and forecasting cockpit a regulatory program needs to walk
into an FDA meeting, a board meeting, or an audit — with every number traceable to its source.*

---

## 2. Who it is for / who it is not for

**For:**

- **Regulatory affairs leads** — submission-readiness digests, deficiency-risk forecasts, gap
  registers, agency-specific readiness packs (FDA PMA/510(k), EMA MAA, etc. — already seeded in
  `taxonomy.ts`).
- **Program / project managers (and CRO PMs)** — portfolio rollups, milestone/timeline forecasts,
  status-by-program, budget/risk rollups across a sponsor's programs.
- **Executives / sponsors / investors** — the executive readiness digest and board pack
  (`readiness.executive_digest`, `exportTemplate: executive-board-pack`), strategic risk synthesis.
- **QA / auditors** — the compliance & audit assurance pack, evidence/provenance trace reports,
  signature-chain reports.
- **Biostatisticians** — design probability-of-success and power reports from the real simulators.
- **CRO account teams serving multiple sponsors** — `clientWorkspace`-scoped reporting so each
  client sees only their program.

**Not for (explicitly out of this audience):**

- **Patients / external public.** No patient-facing reporting; this is a professional regulatory tool.
- **Ad-hoc BI / self-serve SQL analysts.** This is not Looker/Tableau. We do not ship a freeform
  query builder or let users author arbitrary metrics; reports are governed types with truthfulness
  rules. (A constrained "custom view" may come later — see Out of Scope.)
- **Real-time operational dashboards** (e.g., manufacturing SCADA/RTRT live telemetry). The
  digital-twin/RTRT runtime exists but its prediction logic is a stub
  (`cognitive-ecosystem/digital-twin-runtime.service.ts`); manufacturing real-time analytics is a
  separate program.
- **Users in tenants without the data.** A report over an empty corpus must say so honestly, not
  fabricate — but those orgs are not the target until ingestion is run.

---

## 3. What success looks like

**Product/usage outcomes (the real goal):**

- A regulatory lead can produce a **board-ready, provenance-linked readiness pack for any scope in
  under 60 seconds**, export it to PDF/PPTX, and defend every number to its source record.
- An exec opens **one portfolio dashboard** and sees readiness, risk, and timeline across all
  programs without asking anyone for a status update.
- A QA lead can pull a **compliance & audit assurance pack** that an FDA investigator would accept,
  with an intact signature chain and immutable seal.
- Scheduled **weekly digests** land in inboxes without anyone clicking "generate."

**Hard acceptance criteria (definition of done):**

- The static fixture surface (`Reports.tsx`) is **deleted** and replaced by a surface bound to live
  endpoints; zero hardcoded KPIs remain.
- Every report type's numbers are **traceable**: each rendered figure resolves to a provider result
  and, where applicable, an `immutableReportRecords` atom with provenance.
- **No report can be marked "final" while critical blockers exist** (enforces
  `truthfulnessRules.forbidFinalIfMissingCritical`), and final reports are sealed (hash chain + HMAC).
- Every **prediction figure carries a disclosure** (method, confidence, validated-vs-illustrative),
  matching the honesty already in `regulatory-digital-twin.ts` and the readiness twin.
- **Tenant isolation holds**: a cross-tenant `scopeId`/`runId`/`reportId` returns 404, never another
  org's data (the report-engine route already models this in `intelligent-reports.ts`; the new
  surface must preserve it). The `analytics-routes.ts` RCE is closed.
- **Visualization-to-export parity**: every chart on screen renders equivalently in the PDF/PPTX
  export (no "screen-only" numbers).
- Scheduled report runs execute on the Bull scheduler with delivery + an **audit record per send**.

**Quantitative targets (first GA quarter):**

- p95 interactive dashboard load < 2.5s at portfolio scope; report run (cached providers) < 5s,
  cold < 30s.
- Report export (PDF) p95 < 10s for a standard digest.
- Prediction calibration surfaced: Brier score per model visible in an admin quality view (the
  calibration plumbing already exists in `confidence-calibration-service.ts`).

---

## 4. Out of scope (for this build)

- **A freeform/self-serve report builder** (drag-drop metrics, custom SQL). Governed types only in v1.
- **New predictive models.** We surface and package the **existing** honest models; we do not train
  new ML on historical deficiency letters, build deep-document NLP, or automate outcome ingestion.
  Those are a separate "prediction maturity" track noted in §6 moat ideas.
- **Manufacturing/RTRT real-time analytics** (digital-twin runtime prediction logic is a stub).
- **New regulatory agency gateways.** Reporting will *cover* all declared regions, but standing up
  Health Canada / MHRA / TGA / NMPA / MFDS transmission is the submissions track, not this one.
- **The five-store audit consolidation.** Reports will read from the **canonical** sealed sink; fixing
  the broader audit fragmentation (`GA_GAP_AUDIT` Tier-2 #7) is a prerequisite tracked elsewhere, not
  owned here.
- **Mobile-native app.** Responsive web only, per the existing design system.
- **Translation/localization of report content.** English first; i18n later.

---

## 5. How we build it — steps, decisions, and defaults

Each step states the key decisions and **what I would default to** if no one overrides. Steps are
ordered by dependency; Steps 0–4 are the critical path to a usable v1, 5–9 complete the product.

### Step 0 — Foundations, guardrails, and the truthfulness contract

**Goal:** make the existing backbone safe to build on and lock the rules before any rendering exists.

- **Decision: Close the analytics-path RCE first.** `analytics-routes.ts:128,148` interpolates
  PDF-extracted text into `child_process.exec`.
  **Default:** replace with `execFile`/argv (no shell), add an input-shape test, before any reporting
  feature touches that file. Non-negotiable gate.
- **Decision: One tenant-scoping helper for all report reads/writes.**
  **Default:** reuse the pattern already in `intelligent-reports.ts` (`orgScope()` + `loadOwnedReport()`,
  org sourced only from the verified JWT, cross-tenant → 404). Every new Report-OS read/write adopts
  it; no `organizationId` ever read from params/body/query.
- **Decision: Where does "truth" live?** Reports must never out-run their evidence.
  **Default:** the `truthfulnessRules` on each `reportTypeRegistry` row are **enforced server-side at
  run-finalization**, not in the UI. Implement a single `evaluateTruthfulness(run, type)` gate that
  reads `allowPartial`, `requireBlockers`, `requireConfidence`, `forbidFinalIfMissingCritical`,
  `requireExplicitGaps` and decides whether a run may be `draft`, `partial`, or `final`.
- **Decision: AnA's role in numbers.**
  **Default:** AnA may generate **narrative and explanation** over provider outputs; it may **never**
  originate a metric, score, or probability. Numbers come only from deterministic providers/models.
  This is the single most important guardrail and is encoded as a code-level contract (providers
  return numbers; the LLM receives them as read-only context).

**Exit criteria:** RCE closed and tested; scoping helper adopted by all report routes; truthfulness
gate merged with unit tests over the five rule flags.

### Step 1 — The canonical insight/aggregation layer (read model)

**Goal:** one place that computes every metric a report or dashboard shows, so the same number can't
disagree between a chart and a PDF.

- **Decision: Build on the existing provider pattern, don't reinvent.** The orchestrator already has
  `artifact_state`, `submission_readiness`, `compliance_audit`, `regional_registry_readiness`,
  `regional_package_manifest`.
  **Default:** generalize these into a registered **InsightProvider** interface
  (`{ id, scopes, compute(scope, asOf) → { value, status, confidence, blockers, atoms[] } }`) and
  register the existing five plus new ones (review-throughput, PV-signal, timeline-forecast,
  budget-rollup pulling from `project-rollup-service.ts`). Reports and dashboards both consume
  providers; neither computes its own numbers.
- **Decision: Live vs. snapshot.**
  **Default:** dashboards call providers **live** (with short-TTL caching, see below); reports
  **freeze** provider outputs into a `reportSnapshots` row at run time so a report is reproducible and
  a later "as of" query returns identical numbers. Program-group reports use the
  `reportProgramGroupSnapshots.projectSetHash` already in schema.
- **Decision: Caching.** Providers hit Postgres aggregates; portfolio scope fans out across projects.
  **Default:** per-(org, scope, provider) cache with a **60-second TTL** for interactive use and
  explicit invalidation on governed mutations (artifact approve/lock, section status change). Start
  in-process; promote to Redis only if p95 misses target. Do **not** prematurely build a materialized
  read store.
- **Decision: Freshness honesty.** `reportRuns.freshness` exists.
  **Default:** every provider stamps `observedAt`; the UI and exports show "as of HH:MM" and flag any
  provider older than its freshness budget. Stale data is labeled, never hidden.

**Exit criteria:** provider registry with ≥8 providers; deterministic snapshot freeze proven by a test
that re-runs a frozen report and gets identical output; live path cached and invalidated on mutation.

### Step 2 — The report content/render model

**Goal:** turn a run (providers + blockers + confidence) into a structured, provenance-linked report
**body** — the thing that's missing between "we computed readiness" and "here is a report."

- **Decision: Report = ordered sections of typed blocks.**
  **Default:** a report renders to a normalized document model: `ReportSection[]`, each containing
  typed blocks (`summary`, `metric`, `chart`, `table`, `gap-list`, `blocker-list`, `provenance-note`,
  `disclosure`, `narrative`). The model is **render-target-agnostic** so the same tree drives the web
  view, PDF, PPTX, and DOCX (export parity by construction). This mirrors the `exportTemplate` already
  named per type (`executive-board-pack`, `evidence-provenance-pack`, `qa-audit-pack`, …).
- **Decision: Provenance binding.** The design system already mandates `data-prov` hooks
  (README "Provenance on hover"). The report engine already has `reportAtomProvenance`.
  **Default:** every `metric`/`table` block carries atom references; hovering reveals source table,
  field, confidence, transformation type, and audit id — the same contract the immutable engine
  stores. No number renders without a provenance handle.
- **Decision: Narrative generation.**
  **Default:** AnA writes the `summary`/`narrative` blocks from the structured providers as
  read-only inputs, with the AI-disclosure fields (`aiDisclosure`, model + promptHash) recorded on the
  sealed record. Narrative is clearly demarcated from computed blocks in the UI.
- **Decision: Truthfulness applied to the body.**
  **Default:** if `forbidFinalIfMissingCritical` and a critical blocker exists, the report renders with
  a prominent "Draft — blocking gaps" banner and cannot be sealed/sent. `requireExplicitGaps` forces a
  gap-list section even when empty ("No gaps detected as of …").

**Exit criteria:** one report type (`readiness.executive_digest`) renders end-to-end from live data to
a structured body with provenance on every metric, and the truthfulness banner behaves correctly when
a blocker is injected.

### Step 3 — The governed visualization system

**Goal:** a small, on-brand chart vocabulary that works identically on screen and in export.

- **Decision: Charting library.** Only `recharts` is present today (one file), and `d3` is available.
  **Default:** standardize on **recharts** for interactive web charts (already a dependency, React-
  native, accessible), and render the **same chart spec** to static SVG/PNG for PDF/PPTX via a
  server-side render path (or a headless snapshot) so exports match the screen. Avoid introducing a
  second charting lib.
- **Decision: A governed chart set, not freeform.** The design system forbids raw primitives and
  mandates the component registry.
  **Default:** ship a fixed set — **readiness ring, horizontal bar (by program), trend line
  (readiness/timeline), stacked bar (artifact lifecycle), forecast band (P50/P90), calibration plot**
  — each as a registered, token-styled component (warm cream canvas, earthy status colors, no
  saturated neon, `prefers-reduced-motion` respected, WCAG-AA contrast, color-never-alone). No
  arbitrary chart types in v1.
- **Decision: Numbers-over-decoration.** Per the brand voice ("numbers over adjectives").
  **Default:** every chart has a precise data table behind a "view data" toggle, and screen-reader
  output reads the values, not just "a chart." Accessibility is a gate, not a polish item.

**Exit criteria:** six governed chart components in the registry; a chart renders identically in web
and PDF for the same `chart` block; axe/contrast checks pass.

### Step 4 — The Insights UI surface (chat-first, scope-aware)

**Goal:** the actual product users open. Replaces the fixture surface.

- **Decision: Surface shape.** The app is a `layoutMode` state machine with an AnA right rail.
  **Default:** add an `insights` (or reuse/retire `report-engine`) layoutMode with the canonical
  three-zone pattern from the README's System-Aware Artifact Architecture: **scope/catalog tree
  (left) · live dashboard or report viewer (center, 65%) · AnA rail (right, 35%)**. No second sidebar.
- **Decision: Scope switcher is the primary control.**
  **Default:** a single switcher drives everything (account ▸ program ▸ project ▸ study ▸ submission ▸
  document), backed by `report_program_groups` for the program tier. The catalog filters report types
  by `allowedScopes` + `allowedPersonas` for the current user (role-gated: viewer/member/manager/admin).
- **Decision: Two modes in one surface.**
  **Default:** **Dashboard mode** (live providers, interactive charts, drill-down) and **Report mode**
  (pick a type → run → structured body → version/snapshot → export/seal/send). Same data, different
  packaging. The "Ask AnA about this" chip is present on every metric, row, and chart.
- **Decision: Delete the lie.**
  **Default:** remove the static `REPORT_KPIS/REPORT_BARS/FORECAST/PRECEDENT_MODELS` fixtures and the
  `Reports.tsx` fixture surface; bind to the real `/api/report-os/*` and provider endpoints. Keep the
  `live ?? fixture` *fallback shape* only as a typed empty-state, never as fabricated numbers.
- **Decision: Empty/edge states.**
  **Default:** honest empty states that name what will appear and why it's empty (e.g., "No approved
  artifacts in this scope yet — readiness will populate as sections are approved"), per microcopy rules
  (no "Nothing here yet!").

**Exit criteria:** a user can switch scope, see a live dashboard, run the executive digest, view its
provenance-linked body, and export a PDF — all from real data; fixtures deleted.

### Step 5 — Prediction reports (package the honest models)

**Goal:** turn the existing forecast services into governed, disclosed report types.

- **Decision: Which models ship as reports in v1.**
  **Default:** (a) **Submission deficiency-risk report** from `intelligence/risk-model.ts`
  (RTF/CRL/first-cycle approval, with cold-start/network-prior status shown); (b) **Readiness
  trajectory report** from the readiness twin (score, predicted review time, predicted deficiency
  count, trend); (c) **Trial probability-of-success report** from `trial-simulator.ts` (POS, power,
  sensitivity, assumptions ledger). Defer the AI-driven submission-twin (claims/drift) to v1.1 since
  its content analysis is partially unimplemented.
- **Decision: Disclosure is mandatory and structural.**
  **Default:** every prediction block renders a `disclosure` block stating method (logistic regression
  / Monte-Carlo / heuristic gap-score), confidence/interval, sample-size regime (cold-start vs
  trained), and **validated-vs-illustrative** status — reusing the exact honesty already in
  `regulatory-digital-twin.ts` (`predictive:false, validatedAgainstHistoricalDecisions:false`). A
  prediction without a disclosure block cannot render. This is the moat *and* the liability shield.
- **Decision: Calibration visible.**
  **Default:** surface the Brier score / calibration bucket from
  `confidence-calibration-service.ts` and `risk_predictions` in the report and in an admin quality
  view, so confidence claims are themselves auditable.
- **Decision: Never present a simulation as a guarantee.**
  **Default:** the reviewer-simulation / "digital twin" stays labeled illustrative; it is offered as a
  what-if explorer, not a "final" sealable prediction report.

**Exit criteria:** three prediction report types render with mandatory disclosures and visible
calibration; injecting a cold-start org shows the network-prior label, not a false precise number.

### Step 6 — Scheduling, subscriptions, and delivery

**Goal:** reports that arrive without anyone clicking generate — the subscription stubs made real.

- **Decision: Reuse the scheduler that already exists.** `automation/scheduled-jobs.ts` is Bull/Redis-
  backed with cron, org/project scoping, and metrics.
  **Default:** register a `report_subscription` job type rather than building a new scheduler.
  Persist subscriptions (currently a stub in `reports/subscriptions-routes.ts`) to a
  `report_subscriptions` table (type, scope, cadence cron, recipients, format, persona, governance).
- **Decision: Cadence + default content.**
  **Default:** weekly digest (Monday 07:00 tenant tz) as the default cadence; the default subscribed
  report is the **executive readiness digest** at the user's highest accessible scope. Cadence,
  scope, and type are user-editable.
- **Decision: Delivery channels.**
  **Default:** in-app notification + emailed PDF in v1; webhook out in v1.1. **No external send of a
  governed/sealed report without an e-signature** on the delivery (reuse Part-11 e-sign;
  `report-os.ts` already models `platform_send` vs `external_pdf_export` deliveries). Every send writes
  a delivery audit row.
- **Decision: Failure honesty.**
  **Default:** a scheduled run that hits blockers does **not** silently send a misleading report — it
  sends the digest with the blocker banner, or holds and notifies the owner, per the type's
  truthfulness rules. Bull jobs get retry + dead-letter (closing the reliability gap noted in the GA
  audit).

**Exit criteria:** a weekly subscription persists, fires on the scheduler, renders, and delivers an
emailed PDF with a delivery audit record; a blocked run delivers a labeled draft, never a false final.

### Step 7 — Enterprise / portfolio rollup reporting

**Goal:** the exec and CRO-PM view across many programs.

- **Decision: Reuse program groups + rollup service.** `report_program_groups` and
  `project-rollup-service.ts` already aggregate progress/budget/risk/tasks; `ind-portfolio.ts` is a
  real IND roll-up.
  **Default:** the portfolio dashboard is a `program`-scope view over a program group, composing the
  rollup service and the readiness providers; the **executive board pack** is its sealed report form
  (`exportTemplate: executive-board-pack`).
- **Decision: Point-in-time integrity.**
  **Default:** board packs always run against a `reportProgramGroupSnapshots` snapshot (frozen project
  set + `projectSetHash`) so "the portfolio as of the board date" is reproducible and defensible.
- **Decision: CRO multi-client isolation.**
  **Default:** `clientWorkspaceId` scoping (already on the Report-OS tables) ensures a CRO account
  team's portfolio view and each sponsor's view never bleed across clients.

**Exit criteria:** a program group rolls up into a live portfolio dashboard and a sealed board pack
bound to a snapshot; client-workspace isolation verified by a cross-client test.

### Step 8 — Governance, audit, e-sign, and Part 11 for reports

**Goal:** make "final" reports regulator-grade.

- **Decision: Final = sealed.**
  **Default:** finalizing a report writes an `immutableReportRecords` row (content hash, hash chain,
  Merkle root, atom provenance, AI disclosure) via the existing `intelligent-report-engine.ts`; the
  `reportSnapshots.artifactRecordId` FK already exists to bind a snapshot to its sealed record.
- **Decision: Read from the canonical sealed sink only.**
  **Default:** reports never read the in-memory/volatile audit array (`auditLogger.ts`, GA blocker
  Compliance B-3); compliance/audit packs read the hash-chained, HMAC-sealed canonical store. If the
  seal is skipped, integrity verification **fails closed** (not the `ok:true` bug, Compliance B-4).
- **Decision: Indemnification attestation.**
  **Default:** keep the existing `indemnificationAttestations` tiers (full_audit_trail / partial /
  advisory_only); a prediction report defaults to `advisory_only`, a sealed compliance pack to
  `full_audit_trail`. The tier is shown on the report.
- **Decision: Role gating.**
  **Default:** generate = member+, seal/send externally = manager+, manage subscriptions for others =
  admin; viewers can read shared snapshots only. Section-level perms honored.

**Exit criteria:** a finalized compliance pack is sealed, its integrity verifies (and fails closed when
tampered), and external send requires e-sign + writes audit.

### Step 9 — Observability, quality, and rollout

**Goal:** know the reports are right and the layer is healthy.

- **Decision: Report QA surface.**
  **Default:** an admin view shows provider freshness, run success/fail rates, prediction calibration
  (Brier), and "reports blocked from final" counts — making the truthfulness machinery observable.
- **Decision: Metrics + tracing.**
  **Default:** instrument run latency by provider, export latency by format, cache hit-rate, and
  delivery success; wire to the existing Sentry/observability stack. Add `/readyz` dependency checks
  for Redis (scheduler) and the export workers.
- **Decision: Rollout.**
  **Default:** feature-flag `insights` per-tenant (`featureToggles`); ship to **design-partner/beta**
  tenants first (the GA audit's honest current posture), behind the flag, with the executive digest +
  portfolio dashboard as the beachhead, then expand report types. Locked modules show an upgrade CTA,
  not a dead button.

**Exit criteria:** QA view live; metrics dashboards green; flag-gated beta enabled for design partners.

---

## 6. Moat ideas surfaced by the audit (beyond v1)

These are deliberately **out of v1 scope** but are where the durable advantage compounds:

1. **Provenance-native reporting as the wedge.** Most regulatory reporting tools produce a PDF you
   then have to defend manually. Concept2Cure can ship the only reporting layer where **every figure
   hovers to its source record, model, and audit id** — already half-built in `reportAtomProvenance`
   and the `data-prov` design contract. Lead with this; it is genuinely hard to copy and exactly what
   survives an inspection.
2. **Honest, calibrated prediction as a trust moat.** The code's built-in honesty (refusing to run
   without evidence, disclosing illustrative vs validated, Brier calibration) is a *feature*, not a
   limitation. A competitor's "AI approval predictor" that fabricates confidence is a liability;
   ours that shows its calibration and cold-start state is defensible — and becomes a flywheel as
   real outcomes accrue and the risk model trains up.
3. **Automated outcome ingestion → self-improving forecasts.** Today outcome ingestion is manual
   (`ingestOutcomeAsPrecedent`). Wiring agency decisions back in (and the DP-anonymized cross-tenant
   network prior already in `risk-model.ts`) turns the install base into a **federated regulatory
   benchmark no single sponsor could build alone** — the strongest long-term moat.
4. **Report-OS as a platform primitive.** The type registry with `dataDependencies` /
   `truthfulnessRules` is effectively a governed report SDK. Exposing it so new report types are
   *configured*, not coded, lets regulatory SMEs extend coverage to new regions/pathways without
   engineering — turning breadth of global agency coverage into a content problem, not a code problem.
5. **The constrained "custom view."** A later, safe answer to self-serve BI: let users compose a
   dashboard from the **governed provider set** (not arbitrary SQL), preserving truthfulness and
   provenance while giving power users flexibility.

---

## 7. Dependencies, risks, and sequencing notes

- **Hard prerequisite:** the `analytics-routes.ts` RCE and the report-engine tenant-scoping must be
  closed before the surface ships (Step 0). Do not build UI over an exploitable path.
- **Data dependency:** several reports are only as good as the corpus; the ingestion sweep
  (`scripts/ingest-corpus.ts`, GA gap #2) should run in parallel so precedent/benchmark reports aren't
  empty. Until then, those report types honestly show "insufficient data."
- **Audit consolidation:** compliance packs depend on reading the canonical sealed sink; if the
  five-store consolidation slips, scope compliance reports to the canonical store only and flag the
  rest as unavailable rather than reading a mutable sink.
- **Design ownership:** the surface, chart set, and provenance-hover are design-led and should run off
  the existing design system and the `HANDOFF_TO_DESIGN_*` pattern; this spec is the engineering/
  product contract that sits underneath it.
- **Critical-path estimate:** Steps 0–4 (safe, usable v1: exec digest + portfolio dashboard, live
  data, provenance, PDF export) are the beachhead; Steps 5–9 complete the product. Mostly
  integration and UI, not greenfield backend — consistent with the platform's overall GA posture.

---

## 8. Open decisions for the sponsor (need a ruling)

1. **Name + placement:** ship as a new `insights` left-rail module, or fold into the existing
   `report-engine`/intelligence cluster? (Default above: new `insights` module, retire the fixture
   surface.)
2. **v1 report-type breadth:** lead with the 3 readiness/compliance/prediction types, or include the
   agency-specific packs (FDA PMA, EMA MAA) already seeded? (Default: 3 beachhead types first.)
3. **External delivery posture:** require e-sign on *every* external send, or only on sealed/final
   reports? (Default: only sealed/final require e-sign; draft exports are watermarked.)
4. **Calibration exposure:** show prediction calibration to all users, or admins only? (Default: full
   disclosure in-report; detailed Brier/quality view to admins.)

— End of specification. Nothing in this document has been built; it is the plan and the decisions.
