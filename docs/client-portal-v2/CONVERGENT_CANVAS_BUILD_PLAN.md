# CONVERGENT CANVAS BUILD PLAN

## Client Portal V2 - UI/UX Architecture & Implementation

**Version:** 1.0.0
**Date:** January 27, 2026
**Status:** AUTHORITATIVE - Implementation Ready
**Source:** Convergent Portal Build Protocol (Claude Opus 4.5)

---

## Overview

This protocol details the Concept2Cure next-generation client portal build, converging multiple modules into a unified workspace. It integrates the "UI Enhancement Shell + Structure" project steps (1–10) and aligns with the **Convergent Canvas** architecture and **Lumen Cortex** design principles.

### Key Objectives

- **Multi-tenant Modular Portal**: A single portal interface serves both CRO super-admins and biotech client users, with role-based views and dynamic module loading
- **AI-Integrated Workspace**: The portal includes an AI assistant and intent-driven navigation for intelligent user interactions
- **Regulated Domain Focus**: Accommodate various regulatory contexts (FDA, EMA, PMDA) and product types (biotech pharma vs. medical device)
- **Modern UI & Design Cohesion**: Employ a polymorphic layout, cache-first AI integration, and warm luxe brand palette

---

## Architecture Principles

### 1. Polymorphic Layouts

The UI layout is flexible and context-aware. The portal shell and component panels morph based on user role and context (e.g., CRO admin vs biotech client) without requiring separate apps.

### 2. Cache-First AI Integration

Shared context and results are cached on the client to minimize redundant calls. The portal maintains a local context state for the current org/program/study selection and recent AI query results.

### 3. Intent Engine Routing

Navigation can be driven by user intent (not just clicks). An Intent Engine listens to natural language commands or contextual triggers to route the user to the right module or page.

### 4. Warm Luxe Brand Palette

The UI adheres to a consistent, upscale visual style using warm, muted tones and high-quality typography.

---

## 10-Week Implementation Timeline

### Week 1-2: Foundation

#### Step 1: Define Portal Contract and Module Policy

**Location:** `client/src/portal-v2/core/portalPolicy.ts`

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

**Modules to Define:**
| Module | ID | Route | Roles | Agencies |
|--------|-----|-------|-------|----------|
| IND Wizard | ind-wizard | /ind | all editors/admins | FDA |
| Trial Vault | trial-vault | /vault | all | all |
| CSR Intelligence | csr-intelligence | /csr | all | all |
| Study Architect | study-architect | /protocol | all editors | all |
| Analytics Dashboard | analytics | /analytics | all | all |
| CER Generator | cer-generator | /cer | all | FDA, EMA |
| 510(k) eSTAR | 510k-estar | /510k | all editors | FDA |

#### Step 2: Implement Portal Layout Shell

**Location:** `client/src/portal-v2/layouts/PortalShell.tsx`

Components:

- **Side Navigation**: Vertical menu with organization switcher and module links
- **Top Header (Context Bar)**: Current context display, user menu, AI assistant button
- **Main Content Outlet**: React Router `<Outlet />` for nested routes

### Week 3-4: Context & State

#### Step 3: Portal Context and State Management

**Location:** `client/src/portal-v2/core/portalContext.tsx`

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

#### Step 4: Module Registry and Intent Routing

**Location:** `client/src/portal-v2/core/moduleRegistry.ts`

- Instantiate module registry from policy
- Dynamic navigation using ModuleConfig
- Intent-to-module mapping for AI routing

### Week 5-6: Lumen Cortex AI Integration

#### Step 5: AI Assistant Panel

**Location:** `client/src/components/LumenCortexChat.tsx`

Features:

- Embedded chat panel with regulatory intelligence
- Context-aware responses using PortalContext
- Intent detection for navigation suggestions
- Document analysis and summarization

#### Step 6: Intent Engine Implementation

**Location:** `client/src/portal-v2/services/intentEngine.ts`

```typescript
interface IntentMapping {
  patterns: string[];
  moduleId: string;
  action: 'navigate' | 'query' | 'create';
  params?: Record<string, string>;
}
```

### Week 7-8: Module Implementation

#### Step 7: Dashboard Module

**Location:** `client/src/portal-v2/components/client-portal/Dashboard.tsx`

- Metrics cards (submission status, deadlines, compliance)
- Quick actions based on role
- Lumen Cortex AI insights panel
- Recent activity feed

#### Step 8: Project Workspace Module

**Location:** `client/src/portal-v2/components/project-workspace/`

- Project overview and status
- Document management integration
- Team collaboration features
- Timeline and milestone tracking

### Week 9-10: Polish & Integration

#### Step 9: Module Communication & Events

**Location:** `client/src/portal-v2/services/moduleEvents.ts`

- Cross-module event bus
- State synchronization
- Cache invalidation

#### Step 10: Testing & Documentation

- Integration tests for all modules
- E2E tests for critical flows
- API documentation
- User guides

---

## Role-Based Views

### CRO Super-Admin View

- Multi-organization dashboard
- Client org management
- Global analytics across all clients
- System configuration

### Biotech Client User View

- Single organization context
- Project-focused dashboard
- Role-specific module access
- Personal analytics

### Medical Writer View

- Document-centric workspace
- CoAuthor AI integration
- Template library
- Review workflow

---

## File Structure

```
client/src/portal-v2/
├── core/
│   ├── portalTypes.ts          # Type definitions
│   ├── portalPolicy.ts         # Module policy & contracts
│   ├── portalContext.tsx       # React context provider
│   ├── moduleRegistry.ts       # Module registration
│   └── regulatoryCompliance.ts # Compliance utilities
├── layouts/
│   ├── PortalShell.tsx         # Main layout wrapper
│   └── ModuleLayout.tsx        # Per-module layout
├── components/
│   ├── client-portal/
│   │   ├── Dashboard.tsx
│   │   ├── ProjectList.tsx
│   │   └── QuickActions.tsx
│   ├── navigation/
│   │   ├── SideNav.tsx
│   │   ├── TopHeader.tsx
│   │   └── BreadcrumbNav.tsx
│   └── shared/
│       ├── ModuleCard.tsx
│       └── ContextSwitcher.tsx
├── services/
│   ├── intentEngine.ts
│   ├── moduleEvents.ts
│   └── authService.tsx
├── hooks/
│   ├── usePortalContext.ts
│   ├── useModuleAccess.ts
│   └── useSecurityContext.tsx
└── utils/
    ├── logger.ts
    └── permissions.ts
```

---

## Integration Points

### With Lumen Cortex

- `/api/cortex/chat` - AI chat interface
- `/api/cortex/advisory/:projectId` - Project advisory
- `/api/cortex/similar-learnings` - Pattern matching

### With Backend Services

- `/api/organizations` - Org management
- `/api/projects` - Project CRUD
- `/api/documents` - Document management
- `/api/users` - User management

---

## Success Criteria

1. **Module Loading**: < 2s initial load, < 500ms module switch
2. **Context Propagation**: Changes reflect in < 100ms across components
3. **AI Response**: Lumen Cortex responds in < 3s for standard queries
4. **Accessibility**: WCAG 2.1 AA compliance
5. **Test Coverage**: > 70% for core modules

---

## Dependencies

| Package        | Version | Purpose          |
| -------------- | ------- | ---------------- |
| React          | ^18.x   | UI framework     |
| React Router   | ^6.x    | Navigation       |
| TanStack Query | ^5.x    | Data fetching    |
| Zustand        | ^4.x    | State management |
| Tailwind CSS   | ^3.x    | Styling          |
| Lucide React   | ^0.x    | Icons            |

---

**Last Updated:** January 27, 2026
**Owner:** TrialSage Engineering Team
