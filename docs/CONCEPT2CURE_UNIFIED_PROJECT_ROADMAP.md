# CONCEPT2CURE UNIFIED PROJECT ROADMAP

## Enterprise Regulatory Intelligence Platform

**Version:** 1.0.0  
**Date:** January 27, 2026  
**Status:** AUTHORITATIVE - Implementation Ready  
**Branch:** concept2cure-v2

---

## Executive Summary

This document is the **SINGLE SOURCE OF TRUTH** for the Concept2Cure platform development. It consolidates:

1. **Lumen Cortex AI System** - Cognitive regulatory intelligence
2. **Lumen PM v2.0** - Predictive project management
3. **Convergent Portal** - Unified client portal UI
4. **Project Cortex** - Automated data harvesting
5. **21 CFR Part 11 Compliance** - Regulatory compliance layer

### Vision Statement
> "Be the defacto go-to intelligence center outside of the actual FDA."
> "Be the defacto go-to intelligence center outside of the actual FDA."
---
---
## Table of Contents
## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Lumen Cortex AI System](#2-lumen-cortex-ai-system)
3. [Lumen PM v2.0 Predictive Intelligence](#3-lumen-pm-v20-predictive-intelligence)
4. [Convergent Portal UI](#4-convergent-portal-ui)n-pm-v20-predictive-intelligence)
5. [Project Cortex Data Harvesting](#5-project-cortex-data-harvesting)
6. [Database Schema](#6-database-schema)roject-cortex-data-harvesting)
7. [21 CFR Part 11 Compliance](#7-21-cfr-part-11-compliance)
8. [10-Week Implementation Plan](#8-10-week-implementation-plan)
9. [File Structure Reference](#9-file-structure-reference)-plan)
10. [API Reference](#10-api-reference)structure-reference)
10. [API Reference](#10-api-reference)
---
---
## 1. Architecture Overview
## 1. Architecture Overview
### Core Principles

1. **Polymorphic Layouts** - UI morphs based on user role and context
2. **Cache-First AI Integration** - Local context caching for instant responses│
3. **Intent Engine Routing** - Natural language navigation
4. **Multi-Tenant Isolation** - Complete data separation per organization│
5. **Warm Luxe Brand Palette** - Premium visual experience
││
---

## 2. Lumen Cortex AI System










































































































































































































































**This is the SINGLE SOURCE OF TRUTH.**- `docs/client-portal-v2/*`- `docs/IMPLEMENTATION_CHECKLIST.md`- `docs/CLIENT_PORTAL_V2_PLAN.md`These documents are archived and should NOT be referenced:## 🚫 SUPERSEDED DOCUMENTS---**Owner:** TrialSage Engineering Team**Branch:** concept2cure-v2  **Last Updated:** January 27, 2026  ---| Test Coverage | > 70% || Risk Detection Accuracy | > 85% || AI Response Time | < 3s || Module Load Time | < 2s ||--------|--------|| Metric | Target |## Success Criteria---```GET    /api/chat/threadsPOST   /api/chat/message```### Chat (Lumen Cortex)```POST /api/cortex/assessGET  /api/cortex/patternsGET  /api/cortex/advisory/:projectId```### Cortex Intelligence```PATCH  /api/users/:idPOST   /api/users/inviteGET    /api/users```### Users```GET  /api/auth/mePOST /api/auth/registerPOST /api/auth/login```### Authentication## 10. API Reference---| Lumen Enterprise | `lumen_cortex/enterprise/` || Chat API | `server/routes/chat.ts` || User Context | `client/src/contexts/UserContext.tsx` || Admin Pages | `client/src/pages/admin/` || Portal V2 | `client/src/portal-v2/` ||-----------|----------|| Component | Location |### Key Locations## 9. File Structure Reference---- Production deployment- Integration testing### Phase 5: Polish & Launch (Weeks 9-10)- Pattern matching engine- Risk assessment service### Phase 4: PM Intelligence (Weeks 7-8)- Context-aware responses ⏳- Lumen Cortex Chat ✅### Phase 3: AI Integration (Weeks 5-6)- Module Registry, Intent Engine- Portal Context integration### Phase 2: Context & State (Weeks 3-4) 🔄- User Context, Admin Panel, Auth flow- Portal Contract, Shell, Navigation### Phase 1: Foundation (Weeks 1-2) ✅## 8. 10-Week Implementation Plan---| 11.50 Signatures | SHA-256 hash with meaning || 11.10(e) Audit trail | Immutable `audit_log` || 11.10(d) Access control | RBAC + RLS || 11.10(c) Record protection | Merkle tree audit trail || 11.10(a) Validation | `validation_runner.py` ||-------------|----------------|| Requirement | Implementation |## 7. 21 CFR Part 11 Compliance---- `audit_log` - Part 11 audit trail- `rejection_patterns` - FDA patterns- `project_risk_assessments` - Risk analysis- `lumen_data_atoms` - Knowledge units- `projects` - Regulatory projects (IND, 510k, CER)- `users` - User accounts with roles- `organizations` - Multi-tenant orgs### 6.1 Core Tables## 6. Database Schema---| Knowledge Edges | 1,880+ || Proactive Guidance | 18 || Rejection Patterns | 23 || Total Atoms | 1,540+ ||------|-------|| Type | Count |### 5.2 Intelligence Cortex Contents| EMA (EPAR) | Web scrape | 🔧 Planned || PubMed/PMC | NCBI E-utilities | ✅ Active || SEC EDGAR 10-K | SEC API | ✅ Partial || FDA FAERS | OpenFDA API | ✅ Active || ClinicalTrials.gov | REST API v2 | ✅ Working ||--------|------------|--------|| Source | API/Method | Status |### 5.1 Data Farmers Status## 5. Project Cortex Data Harvesting---| viewer | Read-only access || quality_assurance | Compliance oversight || biostatistician | Statistical analysis || medical_writer | Document authoring || clinical_ops | Trial management || regulatory_lead | Submission management || admin | Full system access ||------|-------------|| Role | Description |### 4.3 User Roles| 510(k) eSTAR | 510k-estar | /510k || CER Generator | cer-generator | /cer || Analytics Dashboard | analytics | /analytics || CSR Intelligence | csr-intelligence | /csr || Trial Vault | trial-vault | /vault || IND Wizard | ind-wizard | /ind ||--------|-----|-------|| Module | ID | Route |### 4.2 Available Modules- **Modern UI & Design Cohesion**: Polymorphic layout, warm luxe palette- **Regulated Domain Focus**: FDA, EMA, PMDA contexts- **AI-Integrated Workspace**: Lumen Cortex with intent-driven navigation- **Multi-tenant Modular Portal**: Single interface for CRO and biotech clients### 4.1 Key Objectives## 4. Convergent Portal UI---| FDA-510K-NSE-001 | Different technology raises new questions | Critical || FDA-CRL-001 | Primary endpoint not met (p>0.05) | Critical || FDA-HOLD-002 | hERG/CV safety pharmacology incomplete | Critical || FDA-HOLD-001 | Insufficient preclinical data for FIH dose | Critical ||----|---------|----------|| ID | Pattern | Severity |### 3.2 Rejection Pattern Categories| Administrative | 10% | Form 1571/1572, IB, Consent || Clinical | 15% | Protocol Design, Endpoints || CMC | 20% | Drug Substance/Product, Stability || Preclinical | 25% | Toxicology, Safety Pharm, PK/ADME || Foundation | 30% | Scientific Rationale, TPP, MOA ||-------|--------|-------------|| Level | Weight | Focus Areas |### 3.1 IND Pyramid Structure## 3. Lumen PM v2.0 Predictive Intelligence---```GET  /api/chat/health       // Service health checkDELETE /api/chat/threads/:id // Delete threadGET  /api/chat/threads      // List conversation threadsPOST /api/chat/upload       // Upload document for analysisPOST /api/chat/message      // Send message to Lumen Cortex```**Location:** `server/routes/chat.ts`### 2.2 Chat API**Total:** 14,700+ lines of enterprise-grade Python| `llm_router.py` | 795 | LLM Provider Routing || `embeddings.py` | 792 | Multi-Provider Embeddings || `neo4j_connector.py` | 770 | Neo4j Connection Pooling || `api_bridge.py` | 1,041 | FastAPI Bridge, Auth || `graphrag.py` | 1,073 | Graph-RAG, Knowledge Graphs || `citation.py` | 1,065 | Citation Parser, Evidence Linking || `extraction.py` | 1,052 | PDF/Table Extraction, Schema Detection || `compliance.py` | 882 | Merkle Trees, FIPS 186-5 Digital Signatures || `core.py` | 649 | EventBus, CircuitBreaker, Rate Limiting ||--------|-------|---------|| Module | Lines | Purpose |**Location:** `lumen_cortex/enterprise/`### 2.1 Enterprise Python Modules│  │  │   Engine     │ │    Engine    │ │   Engine     │ │Intelligence  │   ││
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
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Polymorphic Layouts** - UI morphs based on user role and context
2. **Cache-First AI Integration** - Local context caching for instant responses
3. **Intent Engine Routing** - Natural language navigation
4. **Multi-Tenant Isolation** - Complete data separation per organization
5. **Warm Luxe Brand Palette** - Premium visual experience

---

## 2. Lumen Cortex AI System

### 2.1 Cognitive Advisory Service

The brain of the platform - provides intelligent regulatory guidance.

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
```

### 2.2 Enterprise Python Modules

**Location:** `lumen_cortex/enterprise/`

| Module                 | Lines | Purpose                                                   |
| ---------------------- | ----- | --------------------------------------------------------- |
| `core.py`              | 649   | EventBus, CircuitBreaker, Rate Limiting                   |
| `compliance.py`        | 882   | Merkle Trees, FIPS 186-5 Digital Signatures, WORM Storage |
| `extraction.py`        | 1,052 | PDF/Table Extraction, Schema Detection                    |
| `citation.py`          | 1,065 | Citation Parser, Evidence Linking, Claim Extraction       |
| `graphrag.py`          | 1,073 | Graph-RAG, Knowledge Graphs, Multi-hop Reasoning          |
| `api_bridge.py`        | 1,041 | FastAPI Bridge, Auth, Rate Limiting                       |
| `neo4j_connector.py`   | 770   | Neo4j Connection Pooling, Cypher Queries                  |
| `neo4j_schema.py`      | 873   | Knowledge Graph Schema, Regulatory Ontology               |
| `embeddings.py`        | 792   | Multi-Provider Embeddings, Caching, Similarity            |
| `llm_router.py`        | 795   | LLM Provider Routing, Fallback, Cost Tracking             |
| `validation_runner.py` | 1,005 | Compliance Validation, Part 11 Checks                     |

**Total:** 14,700+ lines of enterprise-grade Python

### 2.3 Chat API

**Location:** `server/routes/chat.ts`

```typescript
// Endpoints
POST /api/chat/message      // Send message to Lumen Cortex
POST /api/chat/upload       // Upload document for analysis
GET  /api/chat/threads      // List conversation threads
DELETE /api/chat/threads/:id // Delete thread
GET  /api/chat/health       // Service health check
```

---

## 3. Lumen PM v2.0 Predictive Intelligence

### 3.1 IND Pyramid Structure

Maps all aspects of drug development:

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

### 3.2 510(k) Dossier Taxonomy

```
┌─────────────────────────────────────────────────────────┐
│               510(k) SUBSTANTIAL EQUIVALENCE             │
├─────────────────────────────────────────────────────────┤
│  PREDICATE SELECTION (35%)                               │
│  • Same intended use, Same tech characteristics          │
├─────────────────────────────────────────────────────────┤
│  PERFORMANCE TESTING (30%)                               │
│  • ISO 10993, IEC 62304, IEC 60601                       │
├─────────────────────────────────────────────────────────┤
│  CLINICAL & HUMAN FACTORS (20%)                          │
│  • Clinical data, Human factors study, ISO 14971         │
├─────────────────────────────────────────────────────────┤
│  LABELING & IFU (15%)                                    │
│  • Required elements, Warnings/contraindications         │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Rejection Pattern Categories

#### IND Clinical Holds

| ID           | Pattern                                    | Severity |
| ------------ | ------------------------------------------ | -------- |
| FDA-HOLD-001 | Insufficient preclinical data for FIH dose | Critical |
| FDA-HOLD-002 | hERG/CV safety pharmacology incomplete     | Critical |
| FDA-HOLD-003 | Impurities not qualified (ICH Q3A)         | High     |
| FDA-HOLD-004 | Protocol safety monitoring inadequate      | High     |
| FDA-HOLD-005 | Toxicology duration insufficient (ICH M3)  | Critical |

#### NDA/BLA Complete Response Letters

| ID          | Pattern                              | Severity |
| ----------- | ------------------------------------ | -------- |
| FDA-CRL-001 | Primary endpoint not met (p>0.05)    | Critical |
| FDA-CRL-002 | Single pivotal trial (need two)      | Critical |
| FDA-CRL-003 | Benefit-risk unfavorable (SAE rate)  | Critical |
| FDA-CRL-004 | Manufacturing GMP deficiencies (483) | Critical |

#### 510(k) Not Substantially Equivalent

| ID               | Pattern                                   | Severity |
| ---------------- | ----------------------------------------- | -------- |
| FDA-510K-NSE-001 | Different technology raises new questions | Critical |
| FDA-510K-NSE-002 | Intended use differs from predicate       | Critical |
| FDA-510K-NSE-003 | Biocompat/software testing incomplete     | High     |

### 3.4 Advisory API Response

```json
{
  "context": {
    "id": "proj-123",
    "name": "Novel Kinase Inhibitor IND",
    "submissionType": "ind",
    "phase": "preclinical"
  },
  "readinessScore": 68,
  "riskLevel": "medium",
  "currentRisks": [
    {
      "priority": "critical",
      "title": "GLP toxicology studies not completed",
      "pyramidLevel": "preclinical",
      "patternMatch": "FDA-HOLD-005"
    }
  ],
  "proactiveSuggestions": [
    {
      "priority": "high",
      "title": "Complete hERG assay before IND",
      "rationale": "Required per FDA guidance for novel MOA"
    }
  ],
  "nextSteps": [
    "Verify GLP toxicology studies meet duration requirements",
    "Consider requesting Type B Pre-IND meeting with FDA"
  ]
}
```

---

## 4. Convergent Portal UI

### 4.1 Key Objectives

- **Multi-tenant Modular Portal**: Single interface for CRO super-admins and biotech clients
- **AI-Integrated Workspace**: Lumen Cortex assistant with intent-driven navigation
- **Regulated Domain Focus**: FDA, EMA, PMDA contexts with product-specific UI
- **Modern UI & Design Cohesion**: Polymorphic layout with warm luxe brand palette

### 4.2 Module Configuration

```typescript
export interface ModuleConfig {
  id: string; // e.g. "ind-wizard"
  name: string; // "IND Application Wizard"
  route: string; // URL route, e.g. "/ind"
  icon?: React.ReactNode;
  roles: UserRole[]; // Roles allowed
  agencies: RegulatoryAgency[];
  studyTypes: string[];
  productTypes: string[];
}
```

### 4.3 Available Modules

| Module              | ID               | Route      | Description                           |
| ------------------- | ---------------- | ---------- | ------------------------------------- |
| IND Wizard          | ind-wizard       | /ind       | Investigational New Drug applications |
| Trial Vault         | trial-vault      | /vault     | Document repository                   |
| CSR Intelligence    | csr-intelligence | /csr       | Clinical Study Report analyzer        |
| Study Architect     | study-architect  | /protocol  | Protocol design                       |
| Analytics Dashboard | analytics        | /analytics | Portfolio analytics                   |
| CER Generator       | cer-generator    | /cer       | Clinical Evaluation Reports           |
| 510(k) eSTAR        | 510k-estar       | /510k      | Medical device submissions            |

### 4.4 User Roles

| Role              | Description           | Access Level                   |
| ----------------- | --------------------- | ------------------------------ |
| admin             | Full system access    | All modules                    |
| regulatory_lead   | Submission management | Documents, Submissions, Users  |
| clinical_ops      | Trial management      | Documents, Protocols, Projects |
| medical_writer    | Document authoring    | Documents, Templates           |
| biostatistician   | Statistical analysis  | Documents, Analytics           |
| quality_assurance | Compliance oversight  | Documents, Audit, Compliance   |
| legal_counsel     | Legal review          | Documents, Contracts           |
| executive         | Strategic oversight   | Documents, Analytics, Reports  |
| cmc_specialist    | Manufacturing science | Documents, CMC, Stability      |
| safety_officer    | Pharmacovigilance     | Documents, Safety              |
| project_manager   | Program coordination  | Documents, Projects, Timeline  |
| viewer            | Read-only access      | Dashboard, Vault, Projects     |
| external_partner  | Limited collaboration | Dashboard, Vault, Projects     |

### 4.5 Portal Context

```typescript
export interface PortalCtx {
  orgId?: string;
  programId?: string;
  studyId?: string;
  userRole?: UserRole;
  region?: RegulatoryAgency;
  activeModule?: string;
  set: (update: Partial<PortalCtx>) => void;
}
```

---

## 5. Project Cortex Data Harvesting

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROJECT CORTEX ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     SOURCE HARVESTER SERVICES                          │ │
│  │  🏥 ClinicalTrials.gov    🍁 Health Canada      🇪🇺 EU CTR/EudraCT     │ │
│  │  📊 FDA (FAERS, Orange)   📈 SEC EDGAR (10-K)  🔬 PubMed/NIH          │ │
│  │  🏛️ EMA (EPAR, PSUR)      🧬 USPTO Patents     📚 ICH Guidelines       │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                  PROCESSING & SCRUBBING SERVICE                        │ │
│  │  • PDF/XML/JSON parsers • NLP entity extraction • Schema mapping       │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 INTELLIGENCE CORTEX UPDATE                             │ │
│  │  • Knowledge graph • Vector embeddings • Entity linking                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Farmers Status

| Priority | Source             | API/Method         | Status         |
| -------- | ------------------ | ------------------ | -------------- |
| 🔴 HIGH  | ClinicalTrials.gov | REST API v2        | ✅ Working     |
| 🔴 HIGH  | FDA FAERS          | OpenFDA API        | ✅ Active      |
| 🔴 HIGH  | FDA Orange Book    | openFDA/downloads  | ✅ Active      |
| 🔴 HIGH  | SEC EDGAR 10-K     | SEC API            | ✅ Partial     |
| 🟡 MED   | Health Canada      | HPFB API           | ✅ Synthetic   |
| 🟡 MED   | EMA (EPAR)         | EMA website scrape | 🔧 Needs Build |
| 🟡 MED   | PubMed/PMC         | NCBI E-utilities   | ✅ Active      |
| 🟢 LOW   | USPTO Patents      | USPTO API          | 🔧 Planned     |

### 5.3 Intelligence Cortex Contents

| Type               | Count  | Description                 |
| ------------------ | ------ | --------------------------- |
| Total Atoms        | 1,540+ | Structured knowledge units  |
| Rejection Patterns | 23     | FDA CRL/RTF/Hold/NSE causes |
| Proactive Guidance | 18     | IND/510(k) best practices   |
| Knowledge Edges    | 1,880+ | Entity relationships        |

---

## 6. Database Schema

### 6.1 Core Tables

```sql
-- Organizations (multi-tenant)
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,
  type VARCHAR(50), -- 'cro', 'biotech', 'pharma'
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',
  organization_id INTEGER REFERENCES organizations(id),
  mfa_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50), -- 'ind', '510k', 'cer', 'nda'
  status VARCHAR(50) DEFAULT 'draft',
  organization_id INTEGER REFERENCES organizations(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lumen Data Atoms
CREATE TABLE lumen_data_atoms (
  id SERIAL PRIMARY KEY,
  source VARCHAR(100),
  atom_type VARCHAR(50),
  title TEXT,
  content JSONB,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Risk Assessments
CREATE TABLE project_risk_assessments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  submission_type VARCHAR(50),
  risk_score DECIMAL(3,2),
  risk_factors JSONB,
  recommendations JSONB,
  assessed_at TIMESTAMP DEFAULT NOW()
);

-- Rejection Patterns
CREATE TABLE rejection_patterns (
  id SERIAL PRIMARY KEY,
  pattern_id VARCHAR(50) UNIQUE,
  category VARCHAR(50),
  title TEXT,
  severity VARCHAR(20),
  prevention_guidance TEXT,
  detection_signals JSONB
);
```

### 6.2 Audit Trail (21 CFR Part 11)

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100),
  resource_type VARCHAR(100),
  resource_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  signature_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. 21 CFR Part 11 Compliance

### 7.1 Electronic Signatures

**Implementation:** `client/src/portal-v2/core/securityTypes.ts`

```typescript
interface ElectronicSignature {
  userId: string;
  recordId: string;
  recordType: string;
  meaning: SignatureMeaning;
  timestamp: string;
  hash: string; // SHA-256
  verified: boolean;
}

type SignatureMeaning =
  | 'authorship' // "I am the author..."
  | 'review' // "I have reviewed..."
  | 'approval' // "I approve..."
  | 'verification' // "I verify..."
  | 'amendment' // "I acknowledge this amendment..."
  | 'release'; // "I authorize release..."
```

### 7.2 Compliance Features

| Requirement                    | Implementation              |
| ------------------------------ | --------------------------- |
| 11.10(a) Validation            | `validation_runner.py`      |
| 11.10(b) Legible copies        | PDF export with signatures  |
| 11.10(c) Record protection     | Merkle tree audit trail     |
| 11.10(d) Access control        | RBAC + RLS                  |
| 11.10(e) Audit trail           | Immutable `audit_log` table |
| 11.50 Signature manifestations | SHA-256 hash with meaning   |
| 11.70 Signature linking        | Hash chain to record        |

### 7.3 Enterprise Features

- **FIPS 186-5 Digital Signatures**: RSA-PSS-SHA256
- **Merkle Tree Audit Trail**: Tamper detection
- **WORM Storage**: Immutable document storage
- **Circuit Breaker**: Fault tolerance with fallback

---

## 8. 10-Week Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

| Task                                       | Owner      | Status  |
| ------------------------------------------ | ---------- | ------- |
| Define Portal Contract (`portalPolicy.ts`) | Frontend   | ✅ Done |
| Implement Portal Shell & Navigation        | Frontend   | ✅ Done |
| Set up User Context propagation            | Frontend   | ✅ Done |
| Create Admin Panel pages                   | Frontend   | ✅ Done |
| Wire authentication flow                   | Full Stack | ✅ Done |

### Phase 2: Context & State (Weeks 3-4)

| Task                           | Owner    | Status         |
| ------------------------------ | -------- | -------------- |
| Portal Context integration     | Frontend | 🔄 In Progress |
| Module Registry implementation | Frontend | 🔄 In Progress |
| Intent Engine routing          | Frontend | ⏳ Planned     |
| API endpoint verification      | Backend  | ⏳ Planned     |

### Phase 3: AI Integration (Weeks 5-6)

| Task                    | Owner      | Status     |
| ----------------------- | ---------- | ---------- |
| Lumen Cortex Chat UI    | Frontend   | ✅ Done    |
| Chat API routes         | Backend    | ✅ Done    |
| Context-aware responses | AI/Backend | ⏳ Planned |
| Document analysis       | AI/Backend | ⏳ Planned |

### Phase 4: PM Intelligence (Weeks 7-8)

| Task                    | Owner    | Status     |
| ----------------------- | -------- | ---------- |
| Risk assessment service | Backend  | ⏳ Planned |
| Pattern matching engine | Backend  | ⏳ Planned |
| PM settings UI          | Frontend | ⏳ Planned |
| Custom rule engine      | Backend  | ⏳ Planned |

### Phase 5: Polish & Launch (Weeks 9-10)

| Task                     | Owner      | Status     |
| ------------------------ | ---------- | ---------- |
| Integration testing      | QA         | ⏳ Planned |
| Performance optimization | Full Stack | ⏳ Planned |
| Documentation            | All        | ⏳ Planned |
| Production deployment    | DevOps     | ⏳ Planned |

---

## 9. File Structure Reference

### Frontend

```
client/src/
├── portal-v2/                 # PRIMARY PORTAL CODE
│   ├── core/
│   │   ├── portalTypes.ts     # Type definitions (774 lines)
│   │   ├── portalPolicy.ts    # Module policy
│   │   ├── portalContext.tsx  # React context
│   │   └── moduleRegistry.ts  # Module registration
│   ├── components/
│   │   ├── client-portal/
│   │   │   └── Dashboard.tsx
│   │   └── navigation/
│   ├── hooks/
│   │   └── useSecurityContext.tsx
│   └── services/
│       └── authService.tsx
├── pages/
│   ├── admin/
│   │   ├── UserManagementPage.tsx
│   │   └── RoleManagementPage.tsx
│   └── LumenCortex.tsx
├── contexts/
│   └── UserContext.tsx
├── hooks/
│   └── use-auth.jsx
└── components/
    └── LumenCortexChat.tsx
```

### Backend

```
server/
├── routes/
│   ├── chat.ts              # Lumen Cortex chat
│   ├── users.ts             # User management
│   ├── auth.ts              # Authentication
│   ├── cortexRoutes.ts      # Intelligence API
│   └── tenants.ts           # Multi-tenant
└── services/
    ├── cognitiveAdvisoryService.ts
    └── cortexPrimeService.ts
```

### Python (Lumen Cortex Enterprise)

```
lumen_cortex/enterprise/
├── core.py
├── compliance.py
├── graphrag.py
├── api_bridge.py
└── BUILD_COMPLETION_2026-01-25.md
```

---

## 10. API Reference

### Authentication

```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/me
```

### Users

```
GET    /api/users
POST   /api/users/invite
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id
```

### Cortex Intelligence

```
GET  /api/cortex/advisory/:projectId
GET  /api/cortex/pyramid/:submissionType
GET  /api/cortex/patterns
GET  /api/cortex/guidance
POST /api/cortex/assess
POST /api/cortex/memory
GET  /api/cortex/stats
GET  /api/cortex/similar-learnings
```

### Chat (Lumen Cortex)

```
POST   /api/chat/message
POST   /api/chat/upload
GET    /api/chat/threads
DELETE /api/chat/threads/:id
GET    /api/chat/health
```

### Organizations

```
GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:id
PATCH  /api/organizations/:id
GET    /api/organizations/:id/users
```

### Projects

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/risk
```

---

## Success Criteria

| Metric                  | Target                       |
| ----------------------- | ---------------------------- |
| Module Load Time        | < 2s initial, < 500ms switch |
| Context Propagation     | < 100ms across components    |
| AI Response Time        | < 3s for standard queries    |
| Risk Detection Accuracy | > 85%                        |
| Test Coverage           | > 70% for core modules       |
| Accessibility           | WCAG 2.1 AA compliance       |

---

## Quick Reference

### Key Commands

```bash
# Start server
npm run dev

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build
npm run build
```

### Key Locations

| Component        | Location                              |
| ---------------- | ------------------------------------- |
| Portal V2        | `client/src/portal-v2/`               |
| Admin Pages      | `client/src/pages/admin/`             |
| User Context     | `client/src/contexts/UserContext.tsx` |
| Chat API         | `server/routes/chat.ts`               |
| Lumen Enterprise | `lumen_cortex/enterprise/`            |

---

**Last Updated:** January 27, 2026
**Branch:** concept2cure-v2
**Owner:** TrialSage Engineering Team

---

## 🚫 SUPERSEDED DOCUMENTS

The following documents are archived and should NOT be referenced:

- `docs/CLIENT_PORTAL_V2_PLAN.md`
- `docs/IMPLEMENTATION_CHECKLIST.md`
- `docs/client-portal-v2/*`
- Any other roadmap documents

**This is the SINGLE SOURCE OF TRUTH.**
