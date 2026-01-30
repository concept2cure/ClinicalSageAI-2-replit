# CONCEPT2CURE UNIFIED PROJECT ROADMAP - PART 1
> **Addendum Notice (Normative)**  
> *This roadmap is complemented by the Last‑Mile Automation & Enterprise Readiness addendum (`docs/roadmap/addenda/CONCEPT2CURE_ROADMAP_ADDENDUM_LAST_MILE_AUTOMATION.md`). The addendum defines critical features such as document branching ("Git for regulators"), change control board workflows, semantic search & institutional memory, training & competency management, AI governance & explainability, immutable provenance, regulatory horizon scanning & SOP auto‑drafting, regulator reply studio, cybersecurity/fraud guardrails & disaster recovery/business continuity, FOIA redaction, automated literature surveillance & signal detection, statistical analysis plan validation, and flexible packaging modes (ZIP → eCTD → RPS). These should be considered normative and override any conflicting guidance in this document.*


## Lumen Cortex AI System & Convergent Portal Architecture

**Version:** 1.0.0
**Date:** January 27, 2026
**Status:** AUTHORITATIVE - Implementation Ready

---

## 🎯 Executive Summary

This is the **SINGLE SOURCE OF TRUTH** for the Concept2Cure platform development. All previous roadmaps, planning documents, and implementation guides are superseded by this document.

### Vision Statement

> "Be the defacto go-to intelligence center outside of the actual FDA."

### Key Objectives

1. **Multi-tenant Modular Portal** - Single interface for CRO super-admins and biotech clients
2. **AI-Integrated Workspace** - Lumen Cortex AI with intent-driven navigation
3. **Regulated Domain Focus** - FDA, EMA, PMDA compliance across product types
4. **Modern UI & Design Cohesion** - Polymorphic layouts with warm luxe brand palette

---

## 📐 Architecture Principles

### 1. Polymorphic Layouts

The UI layout is flexible and context-aware. The portal shell and component panels morph based on user role and context (CRO admin vs biotech client) without requiring separate apps.

### 2. Cache-First AI Integration

Shared context and results are cached on the client to minimize redundant API calls. The portal maintains local context state for org/program/study selection and recent AI query results.

### 3. Intent Engine Routing

Navigation driven by user intent, not just clicks. The Intent Engine listens to natural language commands or contextual triggers to route users to the right module or page.

### 4. Warm Luxe Brand Palette

Consistent upscale visual style using warm, muted tones (deep blues, gold accents on ivory) with high-quality typography.

---

## 🧠 Lumen Cortex AI System

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COGNITIVE ADVISORY SERVICE                             │
│        (AI brain - project memory, risk analysis, suggestions)               │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ Project Memory  │  │  Risk Analyzer  │  │ Suggestion      │           │
│    │ (per-project    │  │ (pattern match  │  │ Generator       │           │
│    │  learning)      │  │  to taxonomy)   │  │ (GPT-4 powered) │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATORY INTELLIGENCE ENGINE                            │
│         (Rejection patterns, IND Pyramid, 510(k) taxonomy)                   │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ IND Pyramid     │  │ 510(k) Dossier  │  │ Rejection       │           │
│    │ (5 levels)      │  │ (5 sections)    │  │ Patterns        │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORTEX ORCHESTRATOR                                  │
│          (Master coordinator for all data farmer microservices)              │
│                 30-minute harvest cycles, health monitoring                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Enterprise Python Modules (Completed)

| Module                 | Lines | Purpose                                                   |
| ---------------------- | ----- | --------------------------------------------------------- |
| `core.py`              | 649   | EventBus, CircuitBreaker, Rate Limiting                   |
| `compliance.py`        | 882   | Merkle Trees, FIPS 186-5 Digital Signatures, WORM Storage |
| `extraction.py`        | 1,052 | PDF/Table Extraction, Schema Detection                    |
| `citation.py`          | 1,065 | Citation Parser, Evidence Linking, Claim Extraction       |
| `graphrag.py`          | 1,073 | Graph-RAG, Knowledge Graphs, Multi-hop Reasoning          |
| `api_bridge.py`        | 1,041 | FastAPI Bridge, Auth, Rate Limiting                       |
| `neo4j_connector.py`   | 770   | Neo4j Connection Pooling, Cypher Queries                  |
| `embeddings.py`        | 792   | Multi-Provider Embeddings, Caching, Similarity            |
| `llm_router.py`        | 795   | LLM Provider Routing, Fallback, Cost Tracking             |
| `validation_runner.py` | 1,005 | Compliance Validation, Part 11 Checks                     |

**Total: 14,700+ lines of enterprise-grade Python**

---

## 👥 User Roles & Permissions

### Role Definitions

| Role                | Description           | Module Access                                       |
| ------------------- | --------------------- | --------------------------------------------------- |
| `admin`             | Full system access    | All modules                                         |
| `regulatory_lead`   | Submission management | dashboard, vault, cer, 510k, ind, ectd, submissions |
| `clinical_ops`      | Trial management      | dashboard, vault, protocols, csr, analytics         |
| `medical_writer`    | Document authoring    | dashboard, vault, cer, coauthor, templates          |
| `biostatistician`   | Statistical analysis  | dashboard, vault, analytics, csr, protocols         |
| `quality_assurance` | Compliance oversight  | dashboard, vault, cer, compliance, audit            |
| `legal_counsel`     | Legal review          | dashboard, vault, compliance, contracts             |
| `executive`         | Strategic oversight   | dashboard, analytics, reports                       |
| `cmc_specialist`    | Manufacturing science | dashboard, vault, cmc, stability                    |
| `safety_officer`    | Pharmacovigilance     | dashboard, vault, safety                            |
| `project_manager`   | Program coordination  | dashboard, vault, projects, timeline                |
| `viewer`            | Read-only access      | dashboard, vault                                    |
| `external_partner`  | Limited collaboration | dashboard, vault (scoped)                           |

### Permission Structure

```typescript
interface Permission {
  resource: ResourceType; // 'documents', 'users', 'submissions'
  action: PermissionAction; // 'read', 'write', 'delete', 'approve', '*'
  scope: PermissionScope; // 'organization', 'project', 'document'
  conditions?: Record<string, unknown>;
}
```

---

## 📊 IND Pyramid Structure

```
                    ┌─────────────────┐
                    │  ADMINISTRATIVE │ Level 5 (10%)
                    │  Form 1571/1572 │
                    │  IB, Consent    │
                    ├─────────────────┤
                    │    CLINICAL     │ Level 4 (15%)
                    │ Protocol Design │
                    │ Endpoints, SAP  │
                ┌───┴─────────────────┴───┐
                │          CMC            │ Level 3 (20%)
                │  Drug Substance/Product │
                │  Specifications, Stab   │
            ┌───┴─────────────────────────┴───┐
            │        PRECLINICAL              │ Level 2 (25%)
            │   Toxicology, Safety Pharm      │
            │   PK/ADME, NOAEL, Margins       │
        ┌───┴─────────────────────────────────┴───┐
        │              FOUNDATION                  │ Level 1 (30%)
        │   Scientific Rationale, TPP, MOA         │
        │   Competitive Differentiation            │
        └─────────────────────────────────────────┘
```

### Common Failure Points by Level

| Level          | Weight | Top Rejection Reasons                                        |
| -------------- | ------ | ------------------------------------------------------------ |
| Foundation     | 30%    | Weak MOA, no TPP, poor differentiation                       |
| Preclinical    | 25%    | Insufficient tox duration, low margins, missing safety pharm |
| CMC            | 20%    | Unqualified impurities, insufficient stability               |
| Clinical       | 15%    | Non-meaningful endpoints, underpowered, no stopping rules    |
| Administrative | 10%    | Outdated IB, missing disclosures                             |

---

## 🏥 510(k) Dossier Structure

| Section                      | Weight | Focus Areas                                  |
| ---------------------------- | ------ | -------------------------------------------- |
| **Predicate Selection**      | 35%    | Same intended use, Same tech characteristics |
| **Performance Testing**      | 30%    | ISO 10993, IEC 62304, IEC 60601              |
| **Clinical & Human Factors** | 20%    | Clinical data, HF study, ISO 14971           |
| **Labeling & IFU**           | 15%    | Required elements, Warnings                  |

---

## 🔴 Rejection Pattern Categories

### IND Clinical Holds

| ID           | Pattern                                    | Severity |
| ------------ | ------------------------------------------ | -------- |
| FDA-HOLD-001 | Insufficient preclinical data for FIH dose | Critical |
| FDA-HOLD-002 | hERG/CV safety pharmacology incomplete     | Critical |
| FDA-HOLD-003 | Impurities not qualified (ICH Q3A)         | High     |
| FDA-HOLD-004 | Protocol safety monitoring inadequate      | High     |
| FDA-HOLD-005 | Toxicology duration insufficient (ICH M3)  | Critical |

### NDA/BLA Complete Response Letters

| ID          | Pattern                              | Severity |
| ----------- | ------------------------------------ | -------- |
| FDA-CRL-001 | Primary endpoint not met (p>0.05)    | Critical |
| FDA-CRL-002 | Single pivotal trial (need two)      | Critical |
| FDA-CRL-003 | Benefit-risk unfavorable (SAE rate)  | Critical |
| FDA-CRL-004 | Manufacturing GMP deficiencies (483) | Critical |

### 510(k) Not Substantially Equivalent

| ID               | Pattern                                   | Severity |
| ---------------- | ----------------------------------------- | -------- |
| FDA-510K-NSE-001 | Different technology raises new questions | Critical |
| FDA-510K-NSE-002 | Intended use differs from predicate       | Critical |
| FDA-510K-NSE-003 | Biocompat/software testing incomplete     | High     |

---

## 📁 File Structure

### Frontend (React/TypeScript)

```
client/src/
├── portal-v2/                    # NEW CLIENT PORTAL V2 (primary)
│   ├── core/
│   │   ├── portalTypes.ts        # Type definitions
│   │   ├── portalPolicy.ts       # Module policy & contracts
│   │   ├── portalContext.tsx     # React context provider
│   │   ├── moduleRegistry.ts     # Module registration
│   │   └── regulatoryCompliance.ts
│   ├── layouts/
│   │   ├── PortalShell.tsx       # Main layout wrapper
│   │   └── ModuleLayout.tsx
│   ├── components/
│   │   ├── client-portal/
│   │   │   ├── Dashboard.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── navigation/
│   │   │   ├── SideNav.tsx
│   │   │   └── TopHeader.tsx
│   │   └── shared/
│   ├── services/
│   │   ├── intentEngine.ts
│   │   └── authService.tsx
│   └── hooks/
│       ├── usePortalContext.ts
│       └── useSecurityContext.tsx
├── pages/
│   └── admin/
│       ├── UserManagementPage.tsx
│       └── RoleManagementPage.tsx
├── contexts/
│   └── UserContext.tsx           # User state propagation
├── hooks/
│   └── use-auth.jsx              # Authentication hook
└── components/
    └── LumenCortexChat.tsx       # AI chat interface
```

### Backend (Node.js/Express)

```
server/
├── routes/
│   ├── chat.ts                   # Lumen Cortex chat API
│   ├── users.ts                  # User management API
│   ├── auth.ts                   # Authentication API
│   ├── cortexRoutes.ts           # Cortex intelligence API
│   └── tenants.ts                # Multi-tenant API
└── services/
    ├── cognitiveAdvisoryService.ts
    └── cortexPrimeService.ts
```

### Lumen Cortex Enterprise (Python)

```
lumen_cortex/enterprise/
├── core.py                       # EventBus, CircuitBreaker
├── compliance.py                 # Part 11: Merkle, Signatures
├── graphrag.py                   # Knowledge graph reasoning
├── api_bridge.py                 # FastAPI integration
└── migrations/
```

---

## 🔗 API Endpoints

### Lumen Cortex Chat

```
POST /api/cortex/chat          # Send message to Lumen Cortex
GET  /api/cortex/threads       # List chat threads
GET  /api/cortex/threads/:id   # Get thread messages
DELETE /api/cortex/threads/:id # Delete thread
```

### Cognitive Advisory

```
GET  /api/cortex/advisory/:projectId   # Full advisory analysis
GET  /api/cortex/pyramid/:submissionType  # Structure definitions
GET  /api/cortex/patterns              # Query rejection patterns
GET  /api/cortex/guidance              # Query proactive guidance
POST /api/cortex/assess                # Assess specific action
POST /api/cortex/memory                # Record project event
GET  /api/cortex/stats                 # Intelligence statistics
GET  /api/cortex/similar-learnings     # Similar project learnings
```

### User Management

```
GET    /api/users              # List users
POST   /api/users/invite       # Invite new user
PATCH  /api/users/:id          # Update user
DELETE /api/users/:id          # Deactivate user
GET    /api/users/:id/permissions  # Get user permissions
```

---

**Continue to PART 2 for Implementation Phases →**
