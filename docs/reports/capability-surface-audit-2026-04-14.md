# Capability Surface Audit — 2026-04-14

**Branch:** `concept2cure-v2`
**Purpose:** Inventory every built capability and identify which are reachable from the client-facing home vs. hidden.
**Feeds:** WO-8 (home reference parity, shipped as `abe405a`) and the next sprint (apps expansion + intelligence-engine exposure).

---

## 1. Apps (AppsPage registry)

`client/src/concept2cure/pages/AppsPage.tsx` currently shows **8 apps** in 3 categories:

| Category | Apps |
|---|---|
| Strategy & Evidence | Deep Research · Precedent Intelligence |
| Builders | Device & Diagnostics Workbench · 510(k) Workspace · PMA Workspace · CER Generator · Safety Narrative |
| Specialist Studios | Biostatistics |

`server/routes/concept2cure.ts` `KNOWN_APP_IDS` supports **24 canonical IDs + 12 legacy aliases**:

- `deep-research`
- `precedent-intelligence`
- `device-strategy`
- `medical-device`
- `ind-authoring`
- `cmc`
- `safety-narrative`
- `report-engine`
- `regulatory-intelligence`
- `csr-intelligence`
- `biostatistics`
- `protocol-designer`
- `device-engineering`
- `dossier-navigator`
- `ectd-navigator`
- `document-vault`
- `sop-management`
- `capa-management`
- `post-market`
- `inspection-readiness`
- `compliance-monitor`
- `evidence-engine`
- + 2 more in legacy aliases

**Gap:** 16 backend-ready apps not surfaced. Biggest absentees from UI — `csr-intelligence`, `regulatory-intelligence` (RIM), `protocol-designer`, `sop-management`, `capa-management`, `post-market`, `inspection-readiness`, `compliance-monitor`, `evidence-engine`, `dossier-navigator`, `ectd-navigator`, `cmc`, `ind-authoring`, `report-engine`, `device-engineering`, `document-vault`.

## 2. Slash commands

`client/src/concept2cure/components/chat/SlashCommandMenu.tsx` — **13 editor-local commands** in 3 groups:

- AI Actions (6): AI Rewrite · AI Expand · AI Summarize · Regulatory Tone · Add References · AI Generate Table
- Insert (3): Table · Checklist · Link to Source
- Format (4): Heading 1 · Heading 2 · Heading 3

Editor-only (RichTextEditor context). Not available in the AnA chat composer. No "43-command" chat registry exists. The prior CLAUDE.md reference to 43 slash + 39 operational commands was inaccurate and has been corrected.

## 3. `@-mention` apps

**Not implemented.** No autocomplete, no handler, no config. The prior CLAUDE.md reference to 10 `@app` mentions (deep-research, precedent, 510k, pma, cer, safety, biostats, vault, ectd, protocol) was aspirational and has been corrected.

## 4. Domain prompts — "Browse all capabilities"

`config/domain-prompts.ts` — **106 prompts in 19 domain groups**:

| Group | Count | Representative prompts |
|---|---|---|
| Project Status | 6 | status, readiness, blockers, workflow, assessment |
| Risk & Foresight | 8 | risk profile, reviewer challenges, signals, deficiency patterns, twin analysis, consistency, contradictions, drift |
| Recommendations | 4 | priority actions, next steps, checklist, preflight |
| Document Authoring | 9 | draft, audit, scan, amend, review, claims, lock-check, CTD reqs, next-step |
| Document Lifecycle | 5 | freeze, sign, submit, checklist, export |
| Biostatistics | 5 | SAP, power calc, dose escalation, defensibility, trial design |
| CMC | 5 | evaluation, change impact, comparability, module 3, workplan |
| Safety | 6 | narrative, ISS, DSUR, benefit-risk, RMP, cross-study |
| Clinical | 6 | CSR, ISE, IB, trial design, endpoints, insights |
| Device | 5 | 510(k), predicate, PMA, De Novo, CER |
| Diagnostics | 5 | intended use, analytical validation, clinical validation, cutoff, CDx |
| CMS & Reimbursement | 5 | coding, coverage, payment, HEOR, policy mapping |
| Regulatory Strategy | 11 | strategy note, memo, brief, precedent, pathway comparison, jurisdictions, HAQ, agency deficiency, multi-region timeline, ICH compliance, PV readiness |
| Multi-Agency Strategy | 8 | EMA advice, PMDA bridging, Health Canada, China MRCT, TGA, cross-jurisdiction, pediatric PIP, global labeling |
| Labeling | 3 | USPI, SmPC, eCTD |
| Dossier | 7 | map, missing, eCTD, readiness, workflow, fragility, predict |
| Knowledge | 4 | show all, search, decisions, cross-doc |
| Context & Transparency | 7 | memory, sources, grounding, enrichment, freshness, CTD guidance, confidence |
| Reports | 3 | full report, export, audit trail |

Context-aware mapping (`CONTEXT_DOMAIN_MAP`) surfaces 3–5 primary domains + "More" expansion per navigation context. **No "Browse all capabilities" overlay is actually rendered anywhere.** Prompts are reachable only through AnA chat as suggested actions, and discovery requires user initiative.

## 5. Chat modes

`AnaPersistentPanel.tsx` — **3 modes**:

- `standard` — default regulatory Q&A
- `deep-research` — expanded external data sources (ClinicalTrials.gov, PubMed, FDA, EMA, etc.)
- `nano-banana` — image/infographic/presentation generation

Intent lens (`IntentLens`) modulates RI orchestration: `auto | audit | compare | strategy`.

## 6. Workspace views / embedded modules

`zen-app-constants.ts` defines **60+ LayoutModes** and **10 ToolPanels**:

Tool panels (10) — project-scoped drawer:
1. `ectd` — eCTD Navigator
2. `protocol` — Protocol Designer
3. `sop` — SOP Management
4. `capa` — CAPA Management
5. `pms` — Post-Market Surveillance
6. `inspection` — Inspection Readiness
7. `intelligence` — Regulatory Intelligence
8. `vault` — Document Vault
9. `doc-editor` — Document Editor
10. `ana-biostats` — AnA Biostats

Active LayoutModes (directly reachable):
- Global: `projects`, `apps`, `artifacts-center`, `setup`
- Project tabs: `project-home`, `documents`, `vault`, `review`, `submissions`, `dossier-map`, `section-workspace`, `csr-workflow`, `ind-checklist`, `template-library`
- Specialists (from Apps): `deep-research`, `precedent-intelligence`, `biostatistics`, `review-readiness`, `report-engine`, `safety-narrative`, `device-diagnostics-workbench`, `vault-workspace`
- Editor: `regulatory-workspace`, `editor`

Demoted/redirected (27 modes → `zenRouteNormalization.ts`): `mission-control`, `snowglobe`, `rules`, `ectd-coauthor`, `cmc`, `document-vault`, `clinical-trial`, `templates`, `sherpa`, `analytics`, `timeline`, `audit`, `enablement-center`, `platform-admin`, `biologics-dashboard`, `ctd-onboarding`, `client-intelligence`, `collaboration-hub`, `user-inbox`, `client-branding`, `training-center`, `client-onboarding`, `knowledge-base`, `project-knowledge`, `artifacts`, `ana-platform-control`, `integrations`.

## 7. ZenSidebar global destinations (post-WO-8)

7 global items on the icon rail: Home · Search · New · Apps · Artifacts · Intelligence · Settings. (Plus an Editor shortcut when project-scoped.)

## 8. Hidden intelligence engines

| Engine | Route files | UI status |
|---|---|---|
| RIM (Regulatory Intelligence Module) | `server/routes/ana-ri.ts`, `ana-ri-endpoints.ts`, `ana-ri-inline-routes.ts` | Chat-only via AnA RI mode; not a clickable app |
| CORTEX Prime | `ana-cortex.ts`, `ana-cortex-ft.ts`, `cortex-unified.ts`, `cortexRoutes.ts`, `cortexAdvisoryRoutes.ts`, `cortexManagementRoutes.ts`, `cortexQueryRoutes.ts` | Chat-only |
| Foresight | `foresight-ai-advanced.ts`, `foresight-api.ts`, `foresight-feedback.ts` | Chat-only; not in AppsPage |
| Precedent Intelligence | `precedent-engine.ts`, `regulatory-precedent-intelligence.ts` | Exists as an app; partially surfaced |
| CSR Intelligence | `csr-intelligence-routes.ts`, `csr-builder-routes.ts`, `csr-analytics.ts` | App ID exists in `KNOWN_APP_IDS` but missing from AppsPage |
| Biostatistics | `ana-biostats.ts`, `biostatPlatform.ts` | Exists as an app |
| Predicate Intelligence | `predicate-intelligence.ts` | Aliased to `device-strategy`; no direct entry |
| 510(k) Ecosystem | `510k-*.ts` (5 files) | Exists as an app (`510k-workspace`) |
| CER Analytics | `cer-analytics-routes.ts`, `cer-routes.ts`, `cerv2-ai-routes.ts` | Exists as an app (`cer-generator`) |

## 9. Top 10 hidden capabilities (built but invisible on the home)

1. **CORTEX Prime** — multi-expert knowledge synthesis; chat-only.
2. **RIM (Regulatory Intelligence Module)** — reviewer deficiency pattern learning; chat-only.
3. **Foresight AI** — submission outcome prediction; chat-only.
4. **CSR Intelligence** — CSR analysis + auto-completion; known in `KNOWN_APP_IDS` only.
5. **Predicate Intelligence Engine** — device predicate matching; aliased.
6. **Protocol Designer** (Protocol ToolPanel) — clinical trial protocol authoring; no launcher.
7. **SOP Management** — Standard Operating Procedure governance; no launcher.
8. **CAPA Management** — Corrective & Preventive Action workflow; no launcher.
9. **Post-Market Surveillance** — pharmacovigilance & signal tracking; no launcher.
10. **Inspection Readiness** — FDA/EMA inspection preparedness; no launcher.

## Summary numbers

- **8 apps** reachable via AppsPage · **0 apps** linked directly from sidebar (pre-WO-8) · **Apps icon** added in WO-8 icon rail but AppsPage contents unchanged — next sprint expands to 24.
- **13 slash commands** — editor-only.
- **0 `@`-mentions** — not implemented.
- **106 domain prompts** — chat-only, context-aware; no full browser overlay.
- **7 global sidebar destinations** (WO-8).
- **19 intelligence engines** in backend; **2 fully visible** as apps (Biostatistics, Precedent) + 1 partially (510(k)); the rest are chat-only or not surfaced.

The gap between "built" and "discoverable from the home" is the central problem WO-8 began addressing (visual parity + icon rail) and the next sprint continues (apps expansion + intelligence-engine promotion).
