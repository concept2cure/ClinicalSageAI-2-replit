# Backend-to-UI Gap Analysis Report
**Date**: 2026-04-02
**Method**: 5 parallel domain audit agents

---

## Executive Summary

The backend is **significantly more capable than what users see**. Across 5 major
domains, we found **~150 backend endpoints** of which only **~40% have UI consumers**.
The remaining 60% represent sophisticated capabilities that are computed, persisted,
and available via API — but invisible to users.

---

## Gap Matrix (All Domains)

### Status Legend
- **(A)** Fully wired — endpoint + hook + UI component
- **(B)** Partially wired — endpoint exists, UI incomplete
- **(C)** Endpoint exists, no UI consumer
- **(D)** Backend service exists, no endpoint exposed

### RIM Intelligence (40% surfaced)
| Capability | Status | Impact |
|-----------|--------|--------|
| Judgment Framework (6 scoring models) | **D** | Users can't see WHY submission is risky |
| Evidence Confidence Model | **D** | No transparency into AI confidence |
| Pattern Registry (16 patterns) | **C** | Pattern matches computed but hidden |
| Signal Capture & Trends | **C** | Signal history invisible |
| Cross-Module Intelligence | **B** | Fetched but buried |
| Recommendation Engine | **A** | Working |
| Readiness Scoring | **A** | Working |

### Kernel / Governance (35% surfaced)
| Capability | Status | Impact |
|-----------|--------|--------|
| Kernel Decision Records | **C** | Users can't audit AI routing choices |
| Adaptive Policy | **C** | Learned behavior invisible |
| Control Plane | **D** | Security/governance kernel unexposed |
| Goal Planner | **B** | Plans persisted but never rendered |
| Governance Escalation | **B** | Works silently, no UI visibility |
| DecisionLineageMap | **B** | Component built but orphaned |
| Authoring-Actions (34 endpoints) | **B** | Only 3-4 of 34 endpoints called |
| AnA RI Orchestration | **A** | Working |
| Slash Commands | **A** | Working |

### Submission / Regulatory (46% surfaced)
| Capability | Status | Impact |
|-----------|--------|--------|
| Policy Engine (5 CRUD endpoints) | **C** | No policy admin UI |
| Automation Runner | **C** | No UI to trigger/monitor |
| Blockers (read + resolve) | **C** | Hooks exist, zero UI |
| Milestones & Gates | **C** | Hooks exist, zero UI |
| Approval Bottlenecks | **C** | Hooks exist, zero UI |
| Workload Distribution | **C** | Hooks exist, zero UI |
| Risk Hotspots | **C** | Hooks exist, zero UI |
| Package Publishing | **D** | Endpoint unwired |
| Correspondence Intake | **B** | Hardcoded, no hooks |
| Response Package Tracking | **B** | Create only, no read/update |
| Submission Twin Dashboard | **A** | Working |
| Packages CRUD | **A** | Working |
| Digests | **A** | Working |
| Readiness | **A** | Working |

### CORTEX / Memory (30% surfaced)
| Capability | Status | Impact |
|-----------|--------|--------|
| 3-Layer Memory Assembly | **C** | Users never see memory diagnostics |
| Memory Semantic Search | **C** | Endpoints ready, zero client |
| Shared Memory Pool | **C** | Endpoint ready, never called |
| Memory Verification | **C** | No UI to mark entries verified |
| Epistemic Intelligence (2 endpoints) | **D** | Uncertainty/knowledge gaps hidden |
| Causal Intelligence (3 endpoints) | **D** | Counterfactual reasoning unused |
| Self-Evolution (4 endpoints) | **D** | Experience capture invisible |
| Cross-Domain Transfer (3 endpoints) | **D** | Transfer learning hidden |
| Graph Traversal | **B** | Hook exists, no visualization |
| Regulatory Signals | **B** | Hook exists, no display |
| Health & Status | **A** | Working |
| Semantic Search | **A** | Working |
| Chat Threading | **A** | Working |
| Project Memory View | **A** | Working |

### Foresight / Analytics (55% surfaced)
| Capability | Status | Impact |
|-----------|--------|--------|
| Regulatory Precedent Intelligence | **C** | Routes NOT REGISTERED — page returns 404s |
| Report Drift Detection | **C** | Endpoint exists, no UI |
| Report Attestation Management | **C** | Minimal UI |
| Foresight Knowledge Graph | **C** | No visualization |
| Dose Escalation | **A** | Fully wired |
| Cross-Species PK/PD | **A** | Fully wired |
| Clinical Protocol Generation | **A** | Fully wired |
| Precedent Engine (search/compare/risk) | **A** | Fully wired |
| Report Generation & Sealing | **A** | Fully wired |
| CMC Contradiction Detection | **A** | Fully wired |

---

## Top 10 Highest-Impact Gaps to Close

### 1. CRITICAL: Register Regulatory Precedent Intelligence Routes
**Effort**: 5 min | **Impact**: Unblocks entire page that already exists
- Routes file exists but NOT registered in bootstrap
- UI page exists but all API calls return 404
- Fix: Add route registration in bootstrap

### 2. HIGH: Surface RIM Judgment Scores in Readiness Dashboard
**Effort**: 2-3 hours | **Impact**: Users see WHY submission is risky
- 6 judgment models computed but hidden
- Add judgment summary cards to ProjectReadinessDashboard

### 3. HIGH: Wire Submission Blockers + Milestones to UI
**Effort**: 1-2 hours | **Impact**: Hooks already exist, just need components
- useBlockers(), useMilestones() hooks ready
- Need BlockerList and MilestoneTimeline components

### 4. HIGH: Surface Kernel Decision Records
**Effort**: 2 hours | **Impact**: AI transparency / audit trail
- Decision records logged but never displayed
- Add "AI Decisions" tab to intelligence panel

### 5. HIGH: Wire Governance Escalation Visibility
**Effort**: 2 hours | **Impact**: Users see why actions were blocked
- Authoring-actions has promotion-blockers endpoint
- Need escalation status in document editor toolbar

### 6. MEDIUM: Wire Approval Bottlenecks + Workload + Hotspots
**Effort**: 2 hours | **Impact**: Operational intelligence
- 3 hooks exist (useApprovalBottlenecks, useWorkload, useHotspots)
- Need command center cards

### 7. MEDIUM: Surface Pattern Matches + Signal Trends
**Effort**: 3 hours | **Impact**: Intelligence transparency
- Pattern matches and signals accumulated server-side
- Need PatternAlerts panel + SignalTrend chart

### 8. MEDIUM: Wire Memory Context Diagnostics
**Effort**: 2 hours | **Impact**: AI transparency
- 3-layer memory assembly has diagnostics endpoint
- Surface what AI "remembers" about the project

### 9. MEDIUM: Wire Policy Engine Admin
**Effort**: 3 hours | **Impact**: Governance configuration
- Full CRUD backend exists
- Need PolicyAdmin panel for managing submission policies

### 10. LOW: Mount Orphaned DecisionLineageMap Component
**Effort**: 30 min | **Impact**: Compliance audit trail
- Component fully built but not mounted anywhere
- Add to document detail or audit views

---

## Architecture Note

Per CLAUDE.md chat-first design principles, new capabilities should surface
through AnA conversation or inline panels — NOT new dashboard pages. The fixes
should add data to existing intelligence panels, readiness views, and the
command center rather than creating new routes.
