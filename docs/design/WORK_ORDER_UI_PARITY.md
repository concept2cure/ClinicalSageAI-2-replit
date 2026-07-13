# Work Order — Bring ui-v2 to parity with the backend

**To:** Claude Design
**From:** Engineering (Concept2Cure.RI)
**Re:** Expose the ~90 already-built backend capabilities that the shipped ui-v2 client does not yet surface
**Companion doc:** `docs/design/BACKEND_UI_GAP_ANALYSIS.md` (the audit this Work Order is built from — every capability, endpoint, and `file:line` citation lives there)

---

## 1. Objective

The ui-v2 replacement shipped and is on by default. It is **visually complete but functionally shallow**: most surfaces render fixtures, and a large, real, governed backend sits behind them unexposed. This Work Order brings the UI to **parity with the backend** — every non-excluded backend capability reachable from a surface that consumes its real endpoints, with no fabricated data.

**Definition of parity (the acceptance bar for this whole order):**
1. Every capability listed in the gap analysis (WIRE + BUILD, excluding the documented EXCLUDED set) is reachable in the UI and consumes its real REST endpoints via the `live ?? fixture` contract.
2. No surface presents **fabricated numbers or records** as if real — data is either live, or shown behind the `SampleTag` "Sample data" pill.
3. Every governed mutation routes through reason-for-change (and e-sign where the endpoint requires it); there are no silent writes and no no-op "governed" dialogs.
4. Every new/changed surface passes the per-surface acceptance checklist in §7.

---

## 2. Ground rules (non-negotiable — carry over from the ui-v2 install spec)

These are how, not whether. Apply to every work package.

- **GAP RULE — never invent.** Every route, field, enum, tier, ID, and sample value comes from the real backend or a repo fixture. If a capability is missing a piece, surface the gap honestly (SampleTag / an explicit "not connected" state) — do not fake it. This is the #1 rule.
- **Honesty pattern.** All data is `live ?? fixture` via `useLive`/`liveGet` (`v2/dataConnect.tsx`), with the `SampleTag sample={…}` pill visible whenever data is fixture/degraded. Offline must degrade to honest sample, never to a blank or a lie.
- **Kill fabricated data first.** Where a surface today shows invented numbers (see §4 "Honesty wins"), replacing them with the live engine is P0 — those are actively misleading today.
- **Part 11 is UI-native.** Governed mutations open the reason-for-change modal (≥8-char reason); high-impact actions open the e-sign gate. Reuse the shared governed-action component (WP-0). No silent writes. **Do not wire the e-sign *meaning* dropdown to a live signature until the backend validator lands** — until then it renders as a demonstration, clearly marked.
- **No model-vendor branding on screen** — no "Claude / Anthropic / Sonnet / Opus". AnA modes render as Balanced / Maximum / Instant. **No emoji. Sentence case** for all UI copy.
- **Build inside the existing system.** `.c2c-v2` CSS scoping; `import { I } from '../icons'` for all icons; typed imports only (no `window.*` bridges); fixtures under `v2/fixtures/`; surfaces registered in `surfaceViews.ts`; **each file ≤ 500 lines** (CI gate); no duplicate basenames.
- **Accessibility + tone.** WCAG 2.1 AA (keyboard, focus rings, ARIA); follow the `regulatory-compliance-ux`, `microcopy-tone`, and `accessibility-enforcement` conventions already in the repo.

---

## 3. Sequencing — four waves

Do them in this order; Wave 0 unblocks everything after it.

| Wave | Theme | Nature | Why this order |
|---|---|---|---|
| **0** | Shared foundation | Build once | The governed-action component + live-wire pattern are reused by ~40 packages |
| **1** | Honesty & parity — WIRE | Turn existing fixture shells live | Fastest value; kills fabricated data; the surfaces already exist |
| **2** | Net-new products — BUILD | New surfaces for dark capabilities | Real IA/design work; largest new value |
| **3** | Admin, settings & the long tail | Mixed | Lower-frequency, admin, and narrow capabilities |

---

## 4. Wave 0 — Shared foundation (build first)

**WP-0.1 — Governed Action component.** A reusable `GovernedAction` panel/modal extending the existing `GovernedActionModal`: reason-for-change capture (≥8 chars, validated), optional e-sign gate (demonstration until the backend validator lands), a submit that calls the governed endpoint, and an inline **audit-history** strip that reads the resulting provenance/version records. Every governed POST/PATCH across Waves 1–3 uses this — build it once, correctly.
*Acceptance:* used by ≥3 surfaces; blocks submit without a valid reason; renders returned audit entries.

**WP-0.2 — Live-wire kit.** A documented recipe + tiny helpers for the repeating "replace a fixture with a live load" move: `useLive(path, fixture)` for reads, the `SampleTag` placement rule, an error/empty/loading triad, and the authenticated blob-download helper (already exemplified in `Etmf.tsx`/`AdminSurfaces.tsx`). This is the template every WIRE package follows.
*Acceptance:* one reference surface fully converted using only the kit.

---

## 5. Wave 1 — Honesty & parity (WIRE existing shells)

Each package = "the surface shell already exists; replace its fixtures with live loads and route its actions through WP-0.1." Endpoints and `file:line` are in the gap analysis.

> **Honesty wins (do these first in Wave 1 — they show invented numbers today):**
> - **WP-1.1 Predictive & Network risk** → wire `PharmaIntel`/`shadow-review` to `/api/regulatory-intelligence` (`/score`, `/readiness`, `/network-insights`, `/calibration`, `/warnings`). Replaces fabricated `rtfRiskScore`/`crlRiskScore` fixtures.
> - **WP-1.2 Regulatory horizon** → wire `RegChange` to `/api/external-intelligence` (`/digest`, `/findings`, `/sources`, `POST /run`) + `/api/learning/horizon`. Replaces the inline `RCI_CHANGES` fixture.
> - **WP-1.3 Coverage analysis** → new-or-repointed surface to `/api/coverage-analysis`. Replaces `MarketAccess` static grid.

**WP-1.4 — Protocol authoring hub goes live.** `ProtocolDev` (`protocol-dev`) already has all 11 tabs. Replace `PDEV_DOC` with live loads and route each tab's add/edit + Finalize/Export through WP-0.1 to `/api/protocol-development|-soa|-risks|-milestones|-budget|-amendments|-deviations|-reviews|-consent|-export|-templates`. Add a template picker; surface the CT.gov PRS draft in Export. Point the `ResearchAdmin` Portfolio tab at `/api/protocol-portfolio/analytics`.

**WP-1.5 — Clinical Operations (CTMS).** Wire `ClinicalOps` off `RBM_*` fixtures to `/api/clinical-operations` (`/overview`, `/studies`, `/sites`, `/enrollment` + `/enrollment-forecast`, `/monitoring-visits`, `/deviations`, `/milestones`).

**WP-1.6 — Pharmacovigilance.** Point `safety-narrative`/`pharmacovigilance` at `/api/pharmacovigilance` (AE register + overdue, ICSR/E2B gen, periodic reports + scheduler, signals + screen, RMP, deadline calc, compliance matrix, MedDRA).

**WP-1.7 — Correspondence / HAQ OS.** Build out `communication-center` and wire `haq-manager` (off `fixtures/haq-data`) to `/api/regulatory-correspondence` (intake + governed issue parser, issue review, response-package assembler, timeline, M365 mailbox, deficiency analytics) and `/api/haq-manager`.

**WP-1.8 — IND lifecycle depth.** Expand `ind-lifecycle`/`nda-cockpit`/`dispatch-readiness` (readiness-only today) across `/api/ind-lifecycle` (65 endpoints — rendering, eCTD sequence filing, validate/manifest/diff, dispatch gate + snapshots, cockpit/dashboard/drift), plus per-section AI draft/assemble (`/api/ind-generation`, `/api/ind-sections`), master-data manager (`/api/ind-master-data`), and IND PDF export/import (`/api/ind-pdf`). `GET /api/ind-lifecycle/openapi.json` enumerates the surface.

**WP-1.9 — Submission Ops Command Center.** Extend the MDX seed (`/packages`,`/blockers`,`/workload`) into a full command-center surface over `/api/submission-ops` (readiness, milestones/gates, policy CRUD+resolve, automation runs) + a Release panel (`/packages/:id/{publish,assemble,preflight}`), and a **CTD Assembly Runner** over `/api/submission-orchestrator` (run launcher, builders, Gateway-Readiness `POST /validate/hardened`). Add the eCTD publish pane to `ectd-coauthor` over `/api/ectd` (preview → validate → preflight → ZIP).

**WP-1.10 — Study Design.** Extend `Biostatistics` (or new surface) to `/api/study-design` (validate, CSR-grounded synthetic-twin `simulate`, sample-size, persist, and the M11/SAP/registration/CRF projections as downloadable artifacts).

**WP-1.11 — Contradiction detection + resolution.** Wire `Inconsistency`/`Insights` to `/api/governed-intelligence` (`/contradictions/scan/:projectId`) then the `/api/resolution` workflow (plans → bundles → execute) with `BundleExecutionReceipt` + supersession audit.

**WP-1.12 — Section-workflow backbone.** Wire `regulatory-workspace` to `/api/project-sections` (tree, assign/deadline/status, comments, milestones, timeline — 21 endpoints).

**WP-1.13 — Source traceability + citation verify.** Swap the `source-tracer` verify handler from the `stVerify` fixture to `POST /api/citations/verify` (PubMed/CrossRef); wire sentence-level source links + a freshness strip to `/api/documents/:id/sources` + `/api/intelligent-docs`.

**WP-1.14 — Precedent intelligence.** Wire `precedent-intelligence` (cites the API in its eyebrow, never calls it) to `/api/precedent-engine` (`/search`, `/compare`, `/risk`, `/strategy`, `/check-claim`, pattern analyses); `/check-claim` also powers real-time claim checking in authoring.

**WP-1.15 — Remaining P2 wires.** `dossier-readiness` → `dossier`/`dossier-map`; `validate-completeness` → `ivd-completeness` + a filing-risk card; `authoring-pdf` QC → `authoring-engine`; `fda-forms` panel on device/IND; `510k-workflow`/`pma-workflow` persistence drawers; `corpus` → `vault`/`evidence-search`; `external-evidence` → `Evidence`; `content-assembly`/`content-plan` → authoring; `templates` → `template-library`; `knowledge-base` generation actions; `region-profiles` import into `submission-center`; `ivdr` binder/pack-builder extension; `ha-interactions` → `communication-center` meetings tab; `ai-claims` "add to binder" action; `harmonize` "check consistency" action.

---

## 6. Wave 2 — Net-new products (BUILD)

New surfaces / major surface groups for capabilities with no UI today.

**WP-2.1 — Program OS** (`/api/mission-control`). New surface (sibling to `program-journey`/`project-home`/`orchestration`): readiness-radar home + tabs for artifacts (lifecycle state machine), evidence graph + dependencies/staleness, decisions, review cycles, risks, and a **governed approval inbox** (decide/delegate). Include one-click IND/510k/NDA scaffolding.

**WP-2.2 — Research Administration group** (`registryModel.ts:612` group already exists). A new rail group of surfaces:
- `grants-management` (`/api/grants` full award lifecycle) + wire `grant-finder`.
- IACUC / IRB / IBC protocol workspaces (`/api/iacuc|irb|ibc`) feeding a live **Committees** section (`/api/committees` — wire the built-but-inert voting poll) + **CITI matrix** (`/api/citi-training`).
- FCOI (`/api/financial-disclosures`), Effort certification (`/api/effort-certification`), Other Support (`/api/other-support`), Research Security COI (`/api/research-security`), Research Personnel & Compliance foundation (`/api/research-compliance`).
- Invention disclosures / Tech transfer (`/api/invention-disclosures`), Research agreements MTA/DUA/CDA (`/api/research-agreements`), Controlled substances DEA (`/api/controlled-substances`), Export control ITAR/EAR/OFAC (`/api/export-control`), Inspection readiness BIMO/PAI (`/api/inspections`).
- NIH DMS Plan authoring (`/api/dmsp`), NIH Biosketch (`/api/biosketch`).

**WP-2.3 — Stability LIMS** (`/api/stability`, ~70 endpoints). Dedicated surface (or major `cmc` expansion): study setup (conditions/timepoints/schedule), sample management with **barcode + chain-of-custody**, results entry/review/sign-off, OOT surveillance, CAPA, 3.2.P.8 export. (Consolidate with `/api/cmc/stability` — flag to backend.)

**WP-2.4 — Manufacturing / EBR** (`/api/manufacturing`). ISA-95/FHIR MES workspace: equipment registry, electronic batch records + deviations + test results, AI batch review, batch-release gate.

**WP-2.5 — Innovation platform** (`/api/innovation`, 8 features). Surface group (Intelligence rail): Delta Radar, Evidence Heatmap, Readiness Twin, Auto-traceability, Reviewer Workspace, Template Learning, Negotiation Logbook, Guardrails SDK — one program-scoped panel each.

**WP-2.6 — Snow Globe stress-test** (`/api/snowglobe`). Run a full program stress-test (6 engines), scored findings by engine, remediation plan, delta-vs-baseline, findings-memo export.

**WP-2.7 — CDISC / SEND validation** (`/api/cdisc-validation`). Dataset metadata → conformance verdict + findings; Define-XML generate/download. Add a preclinical PDF ingest uploader (`/api/preclinical`, flag-aware).

**WP-2.8 — RIM + Lifecycle** (`/api/rim`, `/api/lifecycle`). Registration grid (product×country) + labeling engine behind `registrations`/`dossier-map`; post-approval obligation calendar behind `lifecycle-mgmt`.

**WP-2.9 — Remaining BUILD.** Biologics & combination products panel on `biopharma` (`/api/biologics`); global filing registry behind `filings-catalog` (`/api/regulatory`); CTD dossier-onboarding wizard (`/api/ctd`); knowledge corpora reference drawer (`/api/knowledge`); CSR library (`/api/csr-real-data`); universal export menu (`/api/packager`); Client Intelligence onboarding (`/api/client-intelligence` — ⚠ see backend fixes).

---

## 7. Wave 3 — Admin, settings & long tail

Roles & permissions manager (`/api/enterprise/rbac`) · Workspace settings tab (`/api/pm-settings`) · wire the **mocked** API-keys panel (`/api/api-keys`) · module enable/disable admin toggle (`/api/module-subscriptions`) · Governance/decision registry (`/api/operating-system`, scope to working endpoints) · notification preferences (`/api/users/me/notifications`) · AI-provider preference (`/api/platform`) · escalation recommender action (`/api/escalate`) · assessment-history strip (`/api/regulatory-assessments`, verify demand) · account-canon governance (`/api/account-intelligence`, verify demand).

---

## 8. Per-surface acceptance checklist (applies to every WP)

- [ ] Renders under its registry `layoutMode`; id matches `ui-surface-registry`.
- [ ] Reads via `useLive`/`liveGet`; loading / empty / error states wired; offline shows fixture behind the **Sample data** pill.
- [ ] **No fabricated data** — every number/record is live or explicitly sample.
- [ ] Governed mutations use the WP-0.1 component (reason-for-change; e-sign where required); no silent writes; no no-op dialogs.
- [ ] AnA rail context reflects the surface; governed components used (no raw button/input); PedigreeBadge on deterministic results.
- [ ] Keyboard nav, focus rings, ARIA (WCAG 2.1 AA); no console errors; tokens only (no hard-coded colors); no vendor branding; no emoji; sentence case.
- [ ] File ≤ 500 lines; no duplicate basenames; typecheck + lint clean.

---

## 9. Not in scope (do not build)

Excluded per the audit (internal/ops/webhook/deprecated/stub): `control-plane`, `field-sync`, `firecrawl(-webhooks)`, `nano-banana`, `demo`, `gcc` stubs, `enterprise` non-rbac, `notifications` (mock email), `cortex`/`ana-cortex`/`ai-assistance`/`foresight`/`foresight-feedback`/`biotech-rag` (superseded by `/api/ana-ri` or deprecated), `server/api/ai` + `phase3-routes` (stubs), `device-projects` (redundant), `regulatory-submissions` (legacy compat bridge), `test-assembly` (test-only), `leaves` (mock).

**Backend fixes owned by Engineering (do not block Design; flagged so the wired UI is honest):** `grdhe` e-sign password placeholder + IDOR gap; `client-intelligence` regex extraction mislabeled `extractedBy:'ai'`; `regulatory-intelligence` `/templates/prompt-hints` route shadowing; endpoint dedupe (`templates` vs `c2c/templates`, `stability` vs `cmc/stability`); make-real-before-wiring (`ind-autodraft`, `smart-blocks/generate`).

---

*Source of truth for every capability, endpoint, and current-UI state: `docs/design/BACKEND_UI_GAP_ANALYSIS.md`. Recon basis: 170 mounted `/api` prefixes, 335 route files, ~109 UI-consumed paths, 87 SURFACE_VIEWS ids.*
