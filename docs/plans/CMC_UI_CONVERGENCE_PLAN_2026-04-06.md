# CMC UI Convergence Plan

**Date:** 2026-04-06  
**Status:** Proposed  
**Goal:** Eliminate all CMC surface redundancies. One canonical CMC experience.

---

## 1. Current State: The Redundancy Map

The CMC module has accumulated **3 competing UI surfaces**, **6 route aliases**, **16 entry points**, and **54+ component files** across two directories. This plan collapses them to a single governed surface.

### Surface A: ComprehensiveCMCPlatformClean.jsx (Legacy Wizard)
- **Location:** `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx`
- **Size:** 675 KB / 26,553 lines (monolith)
- **Tech:** Loose JSX, no TypeScript, inline fetch calls
- **Routes:** `/cmc-wizard`, `/cmc-blueprint`, `/cmc`, `/cmc-module` (all alias here)
- **Features:** 12 tabs, 81 API endpoints, 45 sub-components
- **Capabilities:**
  - Analytical methods (CRUD, validation, gaps)
  - Process validation (parameters, digital twin)
  - Stability studies (OOT surveillance, P8 export)
  - Quality control (batch release, deviations, OOS, micro tests)
  - Document authoring (Tiptap editor + AI suggestions)
  - Manufacturing excellence (sites, equipment, KPIs, stepper)
  - Supply chain (suppliers, shipments, inventory)
  - Task management & workflow templates
  - Portfolio analytics
  - Risk management & CAPA tracking
  - Real-time monitoring dashboards
  - Regulatory submission tracking
  - AI-powered compliance analysis

### Surface B: CMCHub.tsx + CMCCommandCenter.tsx (Governed TS)
- **Location:** `client/src/concept2cure/components/cmc/`
- **Size:** ~1,300 lines total
- **Tech:** Strict TypeScript, governed components, `apiRequest()`, TanStack Query
- **Routes:** None (orphaned — never mounted)
- **Features:** 8 tabs, 3 API endpoints + Module 3 OS endpoints
- **Capabilities:**
  - Drug Substance data entry (3.2.S structured forms)
  - Drug Product data entry (3.2.P structured forms)
  - Module 3 Command Center (compile, contradict, approve, export gate)
  - ICH compliance overview
  - Specifications view
  - Stability view
  - Impurities view
  - Module 3 document generation

### Surface C: CMCModule.jsx + CMCPage.jsx (Landing Page)
- **Location:** `client/src/modules/CMCModule.jsx`, `client/src/pages/cmc/CMCPage.jsx`
- **Size:** Small
- **Tech:** JSX
- **Routes:** `/cmc-classic`
- **Role:** Quick-launch page that navigates TO `/cmc-wizard`
- **Own features:** CMCReportsTab (Module 3 draft generation)

### Supporting Layer: useCMC.ts + cmcService.ts (Orphaned Service Layer)
- **Location:** `client/src/concept2cure/hooks/useCMC.ts`, `client/src/concept2cure/services/cmcService.ts`
- **Size:** ~1,050 lines
- **Tech:** TanStack Query hooks, proper types, cache invalidation
- **Status:** Fully implemented, zero imports — orphaned
- **Capabilities:** 20+ hooks covering specifications, impurities, stability, batch records, ICH compliance, wizard state machine

---

## 2. Redundancy Matrix

| Capability | Surface A (Legacy) | Surface B (Hub) | Surface C (Module) | Verdict |
|---|---|---|---|---|
| Drug Substance data entry | Inline forms (loose) | Structured 3.2.S forms (governed) | No | Hub wins |
| Drug Product data entry | Inline forms (loose) | Structured 3.2.P forms (governed) | No | Hub wins |
| Module 3 Command Center | No | Full (compile/contradict/approve/export) | No | Hub only |
| Module 3 Generation | Partial | Full | Partial (reports tab) | Hub wins |
| Analytical Methods | Full (44KB component) | No | No | Legacy only |
| Process Validation | Full (56KB component) | No | No | Legacy only |
| Stability Studies | Full (OOT, P8 export) | Basic view | No | Legacy richer |
| Quality Control | Full (release, OOS, deviations) | No | No | Legacy only |
| Document Authoring | Full (Tiptap, 130KB) | No | No | Legacy only |
| Manufacturing Excellence | Full (107KB component) | No | No | Legacy only |
| Supply Chain | Full (18KB) | No | No | Legacy only |
| Task Management | Full (70KB) | No | No | Legacy only |
| Portfolio Analytics | Full (20KB) | No | No | Legacy only |
| Risk Management | Full (15KB) | No | No | Legacy only |
| Real-time Monitoring | Full (11KB) | No | No | Legacy only |
| AI Intelligence Hub | Full (23KB) | No | No | Legacy only |
| CAPA/Deviations | Full | No | No | Legacy only |
| ICH Guardrails | No | Full (Q1-Q6 checking) | No | Hub only |
| Specification CRUD | Basic | Wired to useCMC hooks | No | Hub better typed |
| Impurity Profiling | Basic | Wired to useCMC hooks | No | Hub better typed |
| Batch Records | Basic | Wired to useCMC hooks | No | Hub better typed |

---

## 3. Architectural Decision

### The Problem

Surface A (legacy wizard) has **12x more features** than Surface B (Hub). Replacing it outright would cause massive capability loss — a violation of the Zero Capability Loss rule.

Surface B (Hub) has **better architecture** — TypeScript strict, governed components, TanStack Query, Module 3 OS integration. But it only covers data entry + Module 3 operations.

### The Decision: **Hub as Shell, Legacy Components as Panels**

**CMCHub.tsx becomes the canonical CMC entry point.** But instead of reimplementing 45 legacy components, we progressively migrate the best legacy sub-components INTO the Hub as embedded panels, converting them to governed TypeScript over time.

```
CANONICAL: CMCHub.tsx (shell + routing + Module 3 OS)
  ├── Tab: Command Center ← CMCCommandCenter.tsx (already integrated)
  ├── Tab: Drug Substance ← CMCHub drug-substance forms (already built)
  ├── Tab: Drug Product   ← CMCHub drug-product forms (already built)
  ├── Tab: Analytical     ← AnalyticalMethodsTab.jsx (migrate to TS, embed)
  ├── Tab: Process        ← ProcessTab.jsx (migrate to TS, embed)
  ├── Tab: Stability      ← CMCHub stability + legacy OOT/P8 (merge)
  ├── Tab: Quality        ← QualityTab.tsx (already TS, embed)
  ├── Tab: Manufacturing  ← ManufacturingProcessPanel.jsx (embed)
  ├── Tab: Documents      ← DocumentAuthoringFixed.jsx (embed)
  ├── Tab: Specifications ← CMCHub specifications (useCMC hooks)
  ├── Tab: Impurities     ← CMCHub impurities (useCMC hooks)
  └── Tab: Generate M3    ← CMCHub Module 3 generation (already built)
```

### What Gets Deleted

| Surface | Action | When |
|---------|--------|------|
| `ComprehensiveCMCPlatformClean.jsx` (675KB monolith) | **Demoted → blocked** | After all sub-components are embedded in Hub |
| `ComprehensiveCMCPlatform.jsx` (54KB alt version) | **Delete** | Phase 1 — it's an older duplicate |
| `CMCModule.jsx` (landing page) | **Redirect** to Hub | Phase 1 |
| `CMCPage.jsx` | **Redirect** to Hub | Phase 1 |
| `CMCBlueprintGenerator.jsx` (309B stub) | **Delete** | Phase 1 — it's a stub |
| `/cmc-wizard` route | **Redirect** to Hub | Phase 2 |
| `/cmc-blueprint` route | **Redirect** to Hub | Phase 2 |
| `/cmc-classic` route | **Delete** | Phase 1 |

### What Gets Preserved (Embedded in Hub)

These legacy sub-components have real value and NO equivalent in Hub. They get embedded as tab panels:

| Component | Size | Migrate To |
|-----------|------|------------|
| `AnalyticalMethodsTab.jsx` | 44 KB | Hub tab: Analytical |
| `ProcessTab.jsx` | 56 KB | Hub tab: Process |
| `QualityTab.tsx` | 11 KB | Hub tab: Quality (already TS) |
| `ManufacturingProcessPanel.jsx` | 107 KB | Hub tab: Manufacturing |
| `DocumentAuthoringFixed.jsx` | 130 KB | Hub tab: Documents |
| `AISuggestionEngine.tsx` | 24 KB | Embedded in Documents tab (already TS) |
| `TaskManagementSystem.jsx` | 70 KB | Hub tab: Tasks |
| `SmartWorkflowsInterface.jsx` | 24 KB | Hub tab: Workflows |

**Total preserved:** ~466 KB of real functionality migrated into the governed shell.

### What Gets Deprioritized (Phase 3+)

These features exist in the legacy platform but are lower priority for convergence:

| Component | Size | Status |
|-----------|------|--------|
| `PortfolioDashboard.jsx` | 20 KB | Defer — multi-program view, not core CMC |
| `CMCSupplyChain.jsx` | 18 KB | Defer — supply chain is a separate concern |
| `CMCRiskManagement.jsx` | 15 KB | Defer — merge into RIM intelligence |
| `RealTimeMonitoringDashboard.jsx` | 11 KB | Defer — operational monitoring |
| `CMCIntelligenceHub.jsx` | 23 KB | Defer — merge into AnA intelligence |
| `CMCAuditAndDocumentation.jsx` | 18 KB | Defer — audit trail available via provenance |
| `DigitalTwinCanvas.jsx` | Varies | Defer — advanced manufacturing |
| `DeviationCapaBoard.jsx` | Varies | Defer — quality management |

---

## 4. Route Convergence Plan

### Phase 1: Mount Hub + Redirect Aliases

| Route | Current Target | New Target |
|-------|---------------|------------|
| `/cmc` | Redirect → `/cmc-wizard` | **Redirect → CMCHub** |
| `/cmc-module` | Redirect → `/cmc-wizard` | **Redirect → CMCHub** |
| `/cmc-wizard` | ComprehensiveCMCPlatformClean | **Keep as-is temporarily** |
| `/cmc-hub` | (new) | **CMCHub.tsx** |
| `/cmc-classic` | CMCPage | **Delete route** |
| `/cmc-blueprint` | ComprehensiveCMCPlatformClean | **Redirect → CMCHub generate tab** |
| Workspace `cmc` workbench | section-workspace | **Render CMCHub** |

### Phase 2: Replace Wizard Route

After sub-component embedding is complete:

| Route | Action |
|-------|--------|
| `/cmc-wizard` | **Redirect → CMCHub** |
| All 16 entry points | Point to CMCHub |

### Phase 3: Delete Legacy

| Action | Condition |
|--------|-----------|
| Delete `ComprehensiveCMCPlatformClean.jsx` | All embedded sub-components verified working in Hub |
| Delete `ComprehensiveCMCPlatform.jsx` | Immediate — duplicate |
| Delete `CMCModule.jsx` | After redirect verified |
| Delete `CMCPage.jsx` | After redirect verified |
| Clean `client/src/components/cmc/` directory | Only keep sub-components still imported by Hub |

---

## 5. Service Layer Convergence

### Current State

| Layer | Location | Used By |
|-------|----------|---------|
| `cmcService.ts` | `concept2cure/services/` | Nothing (orphaned) |
| `useCMC.ts` | `concept2cure/hooks/` | Nothing (orphaned) |
| Inline `fetch()` calls | Inside ComprehensiveCMCPlatformClean | Legacy wizard only |

### Convergence

1. **`cmcService.ts` + `useCMC.ts` become canonical** — all CMC API access goes through these
2. **All embedded sub-components** migrate from inline `fetch()` to `useCMC` hooks
3. **Query keys** from `useCMC.ts` register in the global `queryKeys.ts` registry
4. **Module 3 build-state invalidation** (already in useCMC) ensures sub-components auto-refresh

---

## 6. Implementation Phases

### Phase 0: Preparation (This Sprint)
- [ ] Mount CMCHub.tsx in ZenApp routing at `/cmc-hub`
- [ ] Wire useCMC hooks into CMCHub tabs
- [ ] Redirect `/cmc`, `/cmc-module` to `/cmc-hub`
- [ ] Delete `/cmc-classic` route
- [ ] Delete `ComprehensiveCMCPlatform.jsx` (older duplicate)
- [ ] Delete `CMCBlueprintGenerator.jsx` (stub)
- [ ] Update `config/ui-surface-registry.json`

### Phase 1: Embed Core Sub-Components
- [ ] Embed QualityTab.tsx in Hub (already TypeScript)
- [ ] Embed AnalyticalMethodsTab.jsx in Hub (wrap in TS adapter)
- [ ] Embed ProcessTab.jsx in Hub (wrap in TS adapter)
- [ ] Embed DocumentAuthoringFixed.jsx + AISuggestionEngine.tsx in Hub
- [ ] Migrate each to use `useCMC` hooks instead of inline fetch
- [ ] Verify all 81 API endpoints still reachable through Hub

### Phase 2: Embed Secondary Components
- [ ] Embed ManufacturingProcessPanel.jsx in Hub
- [ ] Embed TaskManagementSystem.jsx in Hub
- [ ] Embed SmartWorkflowsInterface.jsx in Hub
- [ ] Redirect `/cmc-wizard` → `/cmc-hub`
- [ ] Mark ComprehensiveCMCPlatformClean.jsx as `blocked` in registry

### Phase 3: Delete Legacy + Polish
- [ ] Delete ComprehensiveCMCPlatformClean.jsx
- [ ] Delete all unused sub-components from `client/src/components/cmc/`
- [ ] Convert remaining JSX sub-components to TypeScript
- [ ] Final route cleanup — all aliases point to single canonical path
- [ ] Write convergence proof report

---

## 7. Governance Compliance

### UI Surface Registry Updates

```json
{
  "cmc-hub": {
    "status": "active",
    "canonical": true,
    "path": "client/src/concept2cure/components/cmc/CMCHub.tsx",
    "route": "/cmc-hub"
  },
  "cmc-wizard": {
    "status": "demoted",
    "canonical": false,
    "path": "client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx",
    "supersededBy": "cmc-hub",
    "removalPhase": 3
  },
  "cmc-module-page": {
    "status": "redirected",
    "redirectTo": "/cmc-hub"
  },
  "cmc-classic": {
    "status": "deleted"
  },
  "cmc-blueprint-generator-stub": {
    "status": "deleted"
  },
  "cmc-platform-alt": {
    "status": "deleted",
    "note": "ComprehensiveCMCPlatform.jsx — older duplicate"
  }
}
```

### Zero Capability Loss Verification

Before deleting any surface, verify these outcomes remain reachable:

| Outcome | Current Path | Hub Path |
|---------|-------------|----------|
| Create analytical method | Legacy wizard → Analytical tab | Hub → Analytical tab (embedded) |
| Run process validation | Legacy wizard → Process tab | Hub → Process tab (embedded) |
| Enter stability data | Legacy wizard → Stability tab | Hub → Stability tab |
| Release batch | Legacy wizard → QC tab | Hub → Quality tab (embedded) |
| Author CMC document | Legacy wizard → Documents tab | Hub → Documents tab (embedded) |
| Compile Module 3 | Not available in legacy | Hub → Command Center |
| Detect contradictions | Not available in legacy | Hub → Command Center |
| Check ICH compliance | Not available in legacy | Hub → Overview |
| Enter drug substance data | Legacy wizard → inline form | Hub → Drug Substance tab |
| Generate Module 3 docs | Legacy wizard → partial | Hub → Generate tab |
| Manage manufacturing | Legacy wizard → Manufacturing tab | Hub → Manufacturing tab (embedded) |
| Track tasks | Legacy wizard → Task Management | Hub → Tasks tab (embedded) |
| Run workflows | Legacy wizard → Workflows tab | Hub → Workflows tab (embedded) |

**Net gain:** Hub adds Module 3 Command Center, ICH guardrails, contradiction detection, and export gating — capabilities that don't exist in legacy.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Feature regression during embedding | Medium | High | Verify each sub-component works in Hub before deleting legacy route |
| 81 API endpoints break during migration | Low | High | Sub-components keep their own API calls initially; migrate to useCMC incrementally |
| User confusion during transition | Low | Medium | `/cmc-wizard` stays active until Phase 2 completion |
| Hub performance with embedded panels | Low | Medium | Lazy-load each tab panel; only mount active tab |
| Legacy sub-components break in new shell | Medium | Medium | Wrap in error boundaries; test each embedding |

---

## 9. Success Criteria

Phase is complete when:
- [ ] CMCHub.tsx is the single canonical CMC surface
- [ ] All 16 entry points resolve to CMCHub
- [ ] All features from legacy wizard are reachable through Hub
- [ ] `config/ui-surface-registry.json` shows one `active` CMC surface
- [ ] ComprehensiveCMCPlatformClean.jsx is deleted
- [ ] No orphaned components remain in `client/src/components/cmc/`
- [ ] Proof report written to `docs/reports/cmc-convergence-proof-YYYY-MM-DD.md`
