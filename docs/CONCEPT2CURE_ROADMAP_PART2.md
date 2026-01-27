# CONCEPT2CURE UNIFIED PROJECT ROADMAP - PART 2

## 10-Week Implementation Phases & Technical Specifications

**Version:** 1.0.0
**Date:** January 27, 2026
**Status:** AUTHORITATIVE - Implementation Ready

---

## 📅 10-Week Implementation Timeline

### Phase 1: Foundation (Weeks 1-2)

#### Week 1: Portal Contract & Module Policy

**Task 1.1: Define Portal Policy**

- Location: `client/src/portal-v2/core/portalPolicy.ts`
- Define `ModuleConfig` interface
- Create module registry with all available modules
- Map roles to module access

```typescript
export interface ModuleConfig {
  id: string; // e.g. "ind-wizard"
  name: string; // "IND Application Wizard"
  route: string; // URL route, e.g. "/ind"
  icon?: React.ReactNode;
  roles: UserRole[];
  agencies: RegulatoryAgency[];
  studyTypes: string[];
  productTypes: string[];
}
```

**Task 1.2: Module Registry**
| Module | ID | Route | Roles |
|--------|-----|-------|-------|
| IND Wizard | `ind-wizard` | `/ind` | all editors/admins |
| Trial Vault | `trial-vault` | `/vault` | all |
| CSR Intelligence | `csr-intelligence` | `/csr` | all |
| Study Architect | `study-architect` | `/protocol` | all editors |
| Analytics Dashboard | `analytics` | `/analytics` | all |
| CER Generator | `cer-generator` | `/cer` | all |
| 510(k) eSTAR | `510k-estar` | `/510k` | all editors |

#### Week 2: Portal Layout Shell

**Task 2.1: PortalShell Component**

- Location: `client/src/portal-v2/layouts/PortalShell.tsx`
- Side Navigation with organization switcher
- Top Header with context bar and AI button
- Main Content Outlet with React Router

**Task 2.2: Navigation Structure**

```tsx
<Route element={<PortalShell />}>
  <Route path="/dashboard" element={<ClientPortalLanding />} />
  <Route path="/projects" element={<ProjectsPage />} />
  <Route path="/studies/:studyId/*" element={<StudyWorkspace />} />
  <Route path="/admin/*" element={<AdminConsole />} />
</Route>
```

---

### Phase 2: Context & State (Weeks 3-4)

#### Week 3: Portal Context

**Task 3.1: PortalContext Provider**

- Location: `client/src/portal-v2/core/portalContext.tsx`

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

**Task 3.2: Integration Layer**

- Share context across modules
- Connect AI assistant to context
- Implement `useModuleIntegration` hook

#### Week 4: Module Registry & Intent Routing

**Task 4.1: Intent Engine**

- Location: `client/src/portal-v2/services/intentEngine.ts`

```typescript
interface IntentMapping {
  patterns: string[]; // e.g. ["show ind", "open ind wizard"]
  moduleId: string; // e.g. "ind-wizard"
  action: 'navigate' | 'query' | 'create';
  params?: Record<string, string>;
}
```

**Task 4.2: Dynamic Navigation**

- Filter modules by user role, agency, product type
- Render navigation links from module registry
- Implement context-based sections in sidebar

---

### Phase 3: Lumen Cortex AI (Weeks 5-6)

#### Week 5: AI Assistant Panel

**Task 5.1: LumenCortexChat Component**

- Location: `client/src/components/LumenCortexChat.tsx`
- Embedded chat panel with regulatory intelligence
- Context-aware responses using PortalContext
- Document analysis and summarization

**Task 5.2: Chat API Integration**

```typescript
// POST /api/cortex/chat
interface ChatRequest {
  message: string;
  threadId?: string;
  context?: {
    projectId?: string;
    documentId?: string;
    submissionType?: string;
  };
}
```

#### Week 6: Cognitive Advisory Service

**Task 6.1: Advisory Endpoints**

- Project risk assessment
- Pattern matching against rejection database
- Proactive suggestion generation

**Task 6.2: Example Response**

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
      "title": "Complete hERG assay before IND"
    }
  ]
}
```

---

### Phase 4: Module Implementation (Weeks 7-8)

#### Week 7: Dashboard Module

**Task 7.1: ClientPortalLanding**

- Location: `client/src/portal-v2/components/client-portal/Dashboard.tsx`
- Metrics cards (submission status, deadlines, compliance)
- Quick actions based on role
- Lumen Cortex AI insights panel
- Recent activity feed

**Task 7.2: Role-Based Views**

- CRO Admin: Multi-org dashboard, global analytics
- Biotech Client: Project-focused, personal analytics
- Medical Writer: Document-centric, CoAuthor integration

#### Week 8: Admin Module

**Task 8.1: User Management**

- Location: `client/src/pages/admin/UserManagementPage.tsx`
- User invite, edit, deactivate
- Role assignment
- MFA status tracking

**Task 8.2: Role Management**

- Location: `client/src/pages/admin/RoleManagementPage.tsx`
- RBAC permission management
- Permission categories (documents, submissions, users, admin)
- Custom role creation

---

### Phase 5: Polish & Integration (Weeks 9-10)

#### Week 9: Cross-Module Communication

**Task 9.1: Event Bus**

- Cross-module event system
- State synchronization
- Cache invalidation on context change

**Task 9.2: UserContext Propagation**

- Location: `client/src/contexts/UserContext.tsx`
- User profile, roles, permissions
- Project access
- Module availability

#### Week 10: Testing & Documentation

**Task 10.1: Integration Tests**

- Route tests for all modules
- API endpoint tests
- E2E tests for critical flows

**Task 10.2: Documentation**

- API documentation
- Component documentation
- User guides

---

## 🔐 21 CFR Part 11 Compliance

### Implemented Features

| Requirement           | Implementation                    | Status      |
| --------------------- | --------------------------------- | ----------- |
| Electronic Signatures | FIPS 186-5 RSA-PSS-SHA256         | ✅ Complete |
| Audit Trail           | Merkle tree with tamper detection | ✅ Complete |
| WORM Storage          | Immutable document storage        | ✅ Complete |
| Access Control        | RBAC with RLS                     | ✅ Complete |
| Authentication        | JWT + MFA                         | ✅ Complete |

### E-Signature Flow

```
1. Action Trigger
   └── Display Meaning Declaration (11.50(b))
       └── Password Authentication (11.10(d))
           └── MFA Verification (if required)
               └── Generate Signature Hash
                   └── Record to Audit Trail (11.10(e))
                       └── Return Signature Object
```

---

## 🗄️ Database Schema

### Core Tables

```sql
-- User Management
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',
  organization_id INTEGER REFERENCES organizations(id),
  mfa_enabled BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Project Risk Assessment
CREATE TABLE project_risk_assessments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  submission_type VARCHAR(50),
  risk_score DECIMAL(3,2),
  risk_factors JSONB,
  recommendations JSONB,
  assessed_at TIMESTAMP DEFAULT NOW(),
  organization_id INTEGER REFERENCES organizations(id)
);

-- Rejection Patterns
CREATE TABLE rejection_patterns (
  id SERIAL PRIMARY KEY,
  pattern_id VARCHAR(50) UNIQUE,
  category VARCHAR(50),
  title TEXT,
  description TEXT,
  severity VARCHAR(20),
  prevention_guidance TEXT,
  detection_signals JSONB
);

-- Lumen Data Atoms
CREATE TABLE lumen_data_atoms (
  id SERIAL PRIMARY KEY,
  source VARCHAR(100),
  atom_type VARCHAR(50),
  content JSONB,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📊 Project Cortex - Data Farmers

### Active Farmers

| Source             | Status       | Data Types                      |
| ------------------ | ------------ | ------------------------------- |
| FDA OpenFDA        | ✅ Active    | FAERS, drug labels, 510(k), PMA |
| PubMed/NCBI        | ✅ Active    | Publications, MeSH terms        |
| ClinicalTrials.gov | ✅ Active    | Trials, sponsors, conditions    |
| SEC EDGAR          | ✅ Partial   | 10-K annual reports             |
| Health Canada      | ✅ Synthetic | Canadian approvals              |
| EMA (EPAR)         | 🔧 Planned   | European assessments            |

### Harvest Schedule

- 30-minute cycles
- Health monitoring
- Progress checkpoints

---

## ✅ Success Criteria

| Metric                  | Target                            |
| ----------------------- | --------------------------------- |
| Module Loading          | < 2s initial load, < 500ms switch |
| Context Propagation     | < 100ms across components         |
| AI Response             | < 3s for standard queries         |
| Test Coverage           | > 70% for core modules            |
| Accessibility           | WCAG 2.1 AA compliance            |
| Risk Detection Accuracy | > 85%                             |

---

## 📦 Dependencies

| Package        | Version | Purpose          |
| -------------- | ------- | ---------------- |
| React          | ^18.x   | UI framework     |
| React Router   | ^6.x    | Navigation       |
| TanStack Query | ^5.x    | Data fetching    |
| Zustand        | ^4.x    | State management |
| Tailwind CSS   | ^3.x    | Styling          |
| Lucide React   | ^0.x    | Icons            |
| OpenAI SDK     | ^4.x    | LLM integration  |

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## 📝 Change Log

| Date       | Change                                    |
| ---------- | ----------------------------------------- |
| 2026-01-27 | Initial unified roadmap created           |
| 2026-01-25 | Lumen Cortex Enterprise modules completed |
| 2026-01-24 | Codebase consolidation completed          |

---

**Last Updated:** January 27, 2026
**Owner:** TrialSage Engineering Team
**Branch:** concept2cure-v2
