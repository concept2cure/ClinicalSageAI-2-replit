# Agent 05 — Apps, Swim Lanes, and Role Paths

**Date:** 2026-03-27

---

## 1. Apps Launcher Architecture

Apps is a **global destination page** at `layoutMode: 'apps'`.

### Three Groups

#### Strategy & Evidence

Tools for thinking, research, and justification.

| App | Source in Repo | Launch Behavior |
|-----|---------------|-----------------|
| **Deep Research** | `layoutMode: 'deep-research'` in ZenApp | Opens deep research mode with AnA |
| **Precedent Intelligence** | `PrecedentIntelligenceDashboard` lazy-loaded in ZenApp (line 195) | Opens 4-tab precedent dashboard |
| **Evidence Memo** | `SubmissionAppsPanel` app (targetDocType: `evidence_memo`, CTD 5.3) | Creates governed draft artifact in project |
| **Protocol Rationale** | `SubmissionAppsPanel` app (targetDocType: `protocol_rationale`, CTD 5.3.5) | Creates governed draft artifact in project |
| **Risk-Benefit Analysis** | `SubmissionAppsPanel` app (targetDocType: `risk_benefit_analysis`, CTD 2.5) | Creates governed draft artifact in project |

#### Builders

Structured deliverable generators.

| App | Source in Repo | Launch Behavior |
|-----|---------------|-----------------|
| **Clinical Overview** | `SubmissionAppsPanel` app (targetDocType: `clinical_overview`, CTD 2.5) | Creates governed draft artifact in project |
| **Module 3 Builder** | `SubmissionAppsPanel` app (targetDocType: `regulatory_document`, CTD 3.2.S) | Creates governed draft artifact in project |
| **Safety Narrative** | `SafetyNarrativePage` lazy-loaded in ZenApp (line 229) | Opens safety narrative builder |
| **510(k) Workspace** | `EmbeddedCERV2Page` at `/concept2cure/project/:id/510k` (ZenApp line 62) | Opens embedded 510(k) workspace |
| **PMA Workspace** | `EmbeddedPMAWorkspace` at `/concept2cure/project/:id/pma` (ZenApp line 64) | Opens embedded PMA workspace |
| **CER Generator** | External route `/cerv2?mode=cer` (ZenApp line 1902) | Opens CER generator |
| **Audit Report** | `SubmissionAppsPanel` app (targetDocType: `audit_report`, CTD 1.3) | Creates governed draft artifact in project |

#### Specialist Studios

Focused expert workbenches.

| App | Source in Repo | Launch Behavior |
|-----|---------------|-----------------|
| **CMC** | Concept exists in `ProjectWorkspaceShell` workbench system. Currently `cmc` layout mode demoted → `documents`. | Opens CMC-tuned Work view inside project |
| **Biostatistics** | `BiostatPlatformDashboard` + `AnaBiostatsPanel`. Layout mode `biostatistics` in ZenApp. | Opens biostat platform inside project |
| **Clinical** | Stub — no dedicated page yet. Clinical analysis via AnA chat + evidence tools. | Opens Work tab with clinical context |
| **Device** | Stub — no dedicated page yet. Device workflows via 510(k)/PMA/CER apps. | Opens Work tab with device context |

### App Launch Rules

1. If a project is active → app launches inside that project's context
2. If no project is active → show "Select or create a project first" prompt
3. Apps that create artifacts (Evidence Memo, Clinical Overview, etc.) → artifact appears in project's Work tab and Artifacts global page
4. Apps that open workspaces (510(k), PMA, Biostatistics) → navigate to that workspace within project shell

### Implementation

**New file:** `client/src/concept2cure/pages/AppsPage.tsx`

Reuse:
- `SubmissionAppCandidate` interface from `ctdHierarchy.ts`
- Card grid pattern from `SubmissionAppsPanel.tsx`
- `WorkspaceCanvas` + `PageTitleHeader` from workspace-primitives
- Icons and colors from existing app definitions

---

## 2. Persona Swim Lanes

### Regulatory Lead (Pharma/Biotech)

```
Projects → [select project] → Overview → Work → Review → Submit
                                  ↕
                              Apps → Strategy & Evidence (as needed)
```

**Primary tabs:** Overview, Work, Review, Submit
**Primary apps:** Evidence Memo, Protocol Rationale, Clinical Overview
**Key actions:** Author sections, review compliance, approve artifacts, export package

### Medical Writer

```
Projects → [select project] → Work → [Builders app if needed] → Review
```

**Primary tabs:** Work, Review
**Primary apps:** Clinical Overview, Module 3 Builder, Safety Narrative
**Key actions:** Draft documents, use templates, iterate with AnA, submit for review

### CMC Specialist

```
Projects → [select project] → Apps → CMC Studio → Work → Vault → Review
```

**Primary tabs:** Work, Vault, Review
**Primary apps:** CMC Studio, Module 3 Builder
**Key actions:** Author CMC sections, upload analytical data, link evidence, quality checks

### Biostatistician

```
Projects → [select project] → Apps → Biostatistics → Work → Review
```

**Primary tabs:** Work, Review
**Primary apps:** Biostatistics Studio
**Key actions:** Statistical analysis, power calculations, endpoint design, generate statistical sections

### Device / Diagnostics Lead

```
Projects → [select project] → Apps → 510(k)/PMA/CER → Vault → Review → Submit
```

**Primary tabs:** Overview, Work, Vault, Review, Submit
**Primary apps:** 510(k) Workspace, PMA Workspace, CER Generator, Risk-Benefit Analysis
**Key actions:** Predicate comparison, evidence compilation, device description, performance data, submission package

### QA / Reviewer

```
Projects → [select project] → Review → Submit
```

**Primary tabs:** Review, Submit
**Primary apps:** (rarely uses apps directly)
**Key actions:** Quality checks, compliance validation, audit trail review, approve/reject artifacts, verify readiness

### Executive / PM

```
Projects → Overview → Artifacts (global)
```

**Primary tabs:** Overview
**Primary apps:** (rarely uses apps)
**Key actions:** View readiness scores, check project status, review milestones, browse approved artifacts across projects

---

## 3. Track-Based App Defaults

### Pharma & Biotech Track

**Featured apps (shown first):**
- Clinical Overview
- Evidence Memo
- Protocol Rationale
- Module 3 Builder
- Safety Narrative
- Risk-Benefit Analysis

**De-emphasized:**
- 510(k) Workspace
- CER Generator

### Medical Device & Diagnostics Track

**Featured apps (shown first):**
- 510(k) Workspace
- PMA Workspace
- CER Generator
- Risk-Benefit Analysis
- Evidence Memo

**De-emphasized:**
- Clinical Overview
- Module 3 Builder
- Protocol Rationale

### Implementation

Track preference stored from onboarding (Step 2 client track selection). Apps page sorts groups by relevance to active track. All apps remain accessible regardless of track — just ordering changes.

---

## 4. Where Each Specialist Tool Belongs

| Tool | Apps Group | Project Tab | Notes |
|------|-----------|-------------|-------|
| CMC | Specialist Studios | Launches into Work | CMC-tuned templates and context |
| Biostatistics | Specialist Studios | Own workspace view | `BiostatPlatformDashboard` is substantial enough for its own view |
| 510(k) Workspace | Builders | Embedded module in project | Uses `EmbeddedCERV2Page` |
| PMA Workspace | Builders | Embedded module in project | Uses `EmbeddedPMAWorkspace` |
| CER Generator | Builders | External route | `/cerv2?mode=cer` |
| Deep Research | Strategy & Evidence | Opens in project context | AnA deep research mode |
| Precedent Intelligence | Strategy & Evidence | Opens as dashboard | `PrecedentIntelligenceDashboard` |
| Safety Narrative | Builders | Opens as page | `SafetyNarrativePage` |
| Report Generator | N/A (not in Apps) | Accessible from Review/Submit | `IntelligentReportGenerator` — invoked contextually, not as standalone app |
