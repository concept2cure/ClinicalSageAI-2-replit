# Concept2Cure.RI Product Vision Roadmap

## From Consolidation to Cognitive Regulatory Ecosystem

**Document ID:** VISION-2026-001  
**Version:** 1.0.0  
**Date:** January 24, 2026  
**Status:** Strategic Plan

---

## Executive Summary

Concept2Cure.RI has evolved from a regulatory documentation platform into a comprehensive **Cognitive Regulatory Ecosystem**. This roadmap aligns our recent codebase consolidation with the strategic vision for 2026-2030.

### Current State Assessment

| Metric | Before Consolidation | After Consolidation | Target 2026 |
|--------|---------------------|---------------------|-------------|
| Root level files | 303+ | ~30 | <25 |
| Route files | 345 | ~300 | ~100 |
| Service files | 227 | ~200 | ~150 |
| Documentation at root | 70 | 0 | 0 |
| Scripts at root | 233 | 0 | 0 |
| Migration directories | 4 | 1 | 1 |

---

## Vision: The Cognitive Regulatory Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COGNITIVE REGULATORY ECOSYSTEM (2026)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      REGULATORY INTELLIGENCE LAYER                       ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   ││
│  │  │  Regulatory  │ │  Epistemic   │ │   Causal     │ │    Self      │   ││
│  │  │  Intuition   │ │ Intelligence │ │  Inference   │ │  Evolving    │   ││
│  │  │   Engine     │ │    Engine    │ │   Engine     │ │Intelligence  │   ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────────┐│
│  │                        CORTEX PRIME UNIFIED BRAIN                        ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ││
│  │  │   Atoms   │ │  Threads  │ │  Agents   │ │  Memory   │ │ Knowledge │ ││
│  │  │  (Facts)  │ │  (Conv)   │ │   (AI)    │ │  (Long)   │ │   Graph   │ ││
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────────┐│
│  │                     DOMAIN-SPECIFIC APPLICATIONS                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      ││
│  │  │ CER/MDR  │ │ 510(k)   │ │   eCTD   │ │   CMC    │ │  IND     │      ││
│  │  │Generator │ │ eSTAR    │ │ CoAuthor │ │ Platform │ │ Wizard   │      ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────────┐│
│  │                      21 CFR PART 11 COMPLIANCE LAYER                     ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   ││
│  │  │ Audit Trail  │ │ E-Signatures │ │Access Control│ │Data Integrity│   ││
│  │  │ (Immutable)  │ │  (SHA-256)   │ │(RBAC + RLS)  │ │(Hash Chains) │   ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Strategic Pillars

### Pillar 1: Unified AI Brain (Cortex Prime)
**Status:** ✅ 90% Complete

| Component | Status | Migration |
|-----------|--------|-----------|
| Knowledge Atoms | ✅ Deployed | 073 |
| Thread Management | ✅ Deployed | 073 |
| Agent Runtime | ✅ Deployed | 063, 073 |
| Dual Embeddings | ✅ Deployed | 059, 073 |
| Regulatory Intuition | ✅ Deployed | 074 |
| Epistemic Intelligence | ✅ Deployed | 075 |
| Causal Inference | ✅ Deployed | 076 |
| Self-Evolving AI | ✅ Deployed | 077 |
| Cross-Domain Transfer | ✅ Deployed | 078 |

### Pillar 2: Cognitive Ecosystem (LangGraph)
**Status:** ⏳ 70% Complete

| Component | Status | Priority |
|-----------|--------|----------|
| LangGraph Orchestrator | ✅ Implemented | - |
| Agent Runtime Service | ✅ Implemented | - |
| Checkpoint Manager | ✅ Implemented | - |
| Route Integration | ✅ Implemented | - |
| Human-in-the-Loop | 🔄 Partial | HIGH |
| State Persistence | 🔄 Partial | HIGH |
| Multi-Agent Coordination | ⏳ Planned | MEDIUM |

### Pillar 3: Global Regulatory Compliance
**Status:** ⏳ 75% Complete

| Component | Status | Standard |
|-----------|--------|----------|
| FDA 21 CFR Part 11 | ✅ Complete | Migration 080 |
| EU Annex 11 | ✅ Complete | Aligned |
| HIPAA Security | ✅ Assessed | CSRA-001 |
| ISO 14971 Risk | ✅ Complete | RA-001 |
| FHIR R4 Integration | ✅ Deployed | Migration 058 |
| eCTD 4.0 Support | 🔄 Partial | Migration 050, 052 |
| Accumulus Synergy | ⏳ Planned | - |

### Pillar 4: Manufacturing Integration
**Status:** ⏳ 60% Complete

| Component | Status | Migration |
|-----------|--------|-----------|
| Digital Twin Schema | ✅ Deployed | 066 |
| ISA-95 Equipment | ✅ Schema Ready | 066 |
| OPC UA Connector | ⏳ Planned | - |
| Real-time Monitoring | ⏳ Planned | - |

### Pillar 5: Federated Learning
**Status:** ⏳ 50% Complete

| Component | Status | Migration |
|-----------|--------|-----------|
| FL Schema | ✅ Deployed | 067 |
| Differential Privacy | ✅ Schema Ready | 067 |
| Secure Aggregation | ⏳ Planned | - |
| Multi-org Training | ⏳ Planned | - |

---

## 2026 Roadmap

### Q1 2026 (Jan-Mar) - CONSOLIDATION & STABILIZATION

**Theme:** Clean Foundation

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Codebase Consolidation | ✅ Root cleanup, script organization |
| 3-4 | Route Consolidation | 🔄 Reduce 345 → 150 routes |
| 5-6 | Service Consolidation | Execute deprecation plan |
| 7-8 | Documentation | Unified docs structure |
| 9-10 | Testing | Full test coverage |
| 11-12 | GA Hardening | Production readiness |

### Q2 2026 (Apr-Jun) - COGNITIVE ECOSYSTEM GA

**Theme:** LangGraph Production

| Milestone | Target | Dependencies |
|-----------|--------|--------------|
| Cognitive Routes GA | Apr 15 | Consolidation complete |
| Human-in-the-Loop | May 1 | Agent runtime stable |
| Multi-Agent Workflows | May 15 | Checkpoint manager |
| Streaming Responses | Jun 1 | LangGraph 1.0 |
| Production Deploy | Jun 30 | All Q2 milestones |

### Q3 2026 (Jul-Sep) - GLOBAL EXPANSION

**Theme:** Multi-Region Compliance

| Milestone | Target | Regions |
|-----------|--------|---------|
| EU MDR Wizard | Jul 15 | EU |
| PMDA Support | Aug 1 | Japan |
| Health Canada | Aug 15 | Canada |
| NMPA Integration | Sep 1 | China |
| Accumulus Pilot | Sep 30 | Global |

### Q4 2026 (Oct-Dec) - ENTERPRISE SCALE

**Theme:** Manufacturing & Federation

| Milestone | Target | Technology |
|-----------|--------|------------|
| OPC UA Connector | Oct 15 | ISA-95 |
| Digital Twin GA | Nov 1 | Manufacturing |
| FL Pilot | Nov 15 | MELLODDY-style |
| Enterprise GA | Dec 15 | Full platform |

---

## Module Inventory & Status

### Production-Ready Modules ✅

| Module | Primary Service | Routes |
|--------|-----------------|--------|
| CER Generator | `cerGenerationService.ts` | `cer-final.js`, `cerRoutes.ts` |
| 510(k) eSTAR | `fda510kService.ts` | `510kRoutes.ts` |
| eCTD CoAuthor | `ectdService.ts` | `coauthor.js` |
| CMC Platform | `cmcService.ts` | `cmc.js`, `cmc-dashboard.js` |
| Stability Studies | `stabilityService.ts` | `stability-routes.ts` |
| Audit Trail | `cortexComplianceService.ts` | `audit.js` |

### Under Development 🔄

| Module | Service | Status |
|--------|---------|--------|
| Cognitive Ecosystem | `cognitive-ecosystem/` | Routes wired |
| AI Provider Router | `aiProviderRouter.js` | Deployed |
| Manufacturing | `manufacturingService.ts` | Schema only |
| Federated Learning | `federatedLearningService.ts` | Schema only |

### Planned ⏳

| Module | Target | Dependencies |
|--------|--------|--------------|
| PMDA Module | Q3 2026 | Global expansion |
| Accumulus Sync | Q3 2026 | Global dossier |
| Real-time MFG | Q4 2026 | OPC UA |

---

## Key Performance Indicators

### Technical KPIs

| KPI | Current | Q2 Target | Q4 Target |
|-----|---------|-----------|-----------|
| Route count | 324 | 150 | 100 |
| Service count | 225 | 175 | 150 |
| Test coverage | ~40% | 70% | 85% |
| Build time | ~120s | <60s | <30s |
| API response (p95) | 500ms | 200ms | 100ms |

### Business KPIs

| KPI | Current | Q2 Target | Q4 Target |
|-----|---------|-----------|-----------|
| Regulatory modules | 6 | 8 | 12 |
| Region support | 2 | 4 | 6 |
| Enterprise customers | - | 5 | 25 |
| Uptime SLA | 99.5% | 99.9% | 99.95% |

---

## Risk Registry

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration conflicts | Medium | High | `migrations_manifest.json` |
| Route breaking changes | Medium | High | Deprecated folder approach |
| AI provider outage | Low | High | Multi-provider router |
| Compliance audit failure | Low | Critical | Part 11 compliance layer |
| Performance degradation | Medium | Medium | Performance monitoring |

---

## Architecture Decision Records

### ADR-001: AI Provider Abstraction
**Decision:** Create `aiProviderRouter.js` to abstract AI providers  
**Status:** ✅ Implemented  
**Rationale:** Original "openaiService.js" was actually Kimi AI (moonshot.cn). Multi-provider support enables failover and vendor flexibility.

### ADR-002: Migration Manifest vs Renumbering
**Decision:** Use `migrations_manifest.json` metadata approach  
**Status:** ✅ Implemented  
**Rationale:** Renumbering 98 migrations would break audit trails and deployment scripts. Manifest provides execution order without file changes.

### ADR-003: Deprecated Folder Pattern
**Decision:** Move deprecated files to `_deprecated/` folders  
**Status:** ✅ Implemented  
**Rationale:** Allows rollback, prevents broken imports during transition, enables 30-day monitoring before deletion.

### ADR-004: Cognitive Ecosystem Integration
**Decision:** Wire LangGraph orchestrator via `/api/cognitive/*` routes  
**Status:** ✅ Implemented  
**Rationale:** Next-gen agent system ready for production without disrupting existing multi-agent-council.

---

## Appendix: File Organization

### Project Structure (Target State)

```
Concept2Cure.RI/
├── client/                    # Frontend (React)
│   └── src/
│       ├── components/        # UI components
│       ├── pages/             # Route pages
│       ├── services/          # API clients
│       └── hooks/             # React hooks
├── server/                    # Backend (Express)
│   ├── routes/                # API routes (~100 files)
│   ├── services/              # Business logic (~150 files)
│   │   ├── cognitive-ecosystem/  # LangGraph services
│   │   └── _deprecated/       # Archived services
│   └── middleware/            # Express middleware
├── db/
│   └── migrations/            # All migrations (single directory)
├── shared/                    # Shared code
│   └── schema/                # Drizzle schemas
├── docs/                      # All documentation
│   ├── architecture/          # Technical docs
│   ├── compliance/            # Audit & validation
│   ├── deployment/            # Deploy guides
│   └── modules/               # Module-specific
├── scripts/                   # All scripts
│   ├── automation/            # Run/fix scripts
│   ├── build/                 # Build scripts
│   ├── deploy/                # Deploy scripts
│   ├── import/                # Data import
│   ├── test/                  # Test scripts
│   └── verification/          # Verification scripts
├── backend/                   # Python services
│   ├── services/              # Python business logic
│   └── utils/                 # Python utilities
└── _archive/                  # Archived code
    ├── src-legacy-*/          # Old frontend
    └── test-artifacts/        # Test outputs
```

---

## Conclusion

The Concept2Cure.RI platform is 70% complete toward the Cognitive Regulatory Ecosystem vision. The consolidation effort has:

1. **Reduced root clutter** from 303+ files to ~30
2. **Organized 233+ scripts** into logical directories
3. **Structured 70+ docs** into categorized folders
4. **Identified 50+ deprecated routes** for removal
5. **Created unified AI provider** abstraction
6. **Wired cognitive ecosystem** to production routes
7. **Documented architecture** for team alignment

The remaining 30% focuses on:
- Deep route consolidation (345 → 100)
- Service deduplication (225 → 150)
- Manufacturing & federated learning activation
- Global regulatory expansion

**The path from code consolidation to cognitive ecosystem is clear.**

---

*Document End*
