# 🧠 CLAUDE OPUS 4.5 - PROJECT REFERENCE GUIDE

## ⚠️ IMPORTANT: ALWAYS READ THIS FIRST

This document tells you where to find authoritative documentation and key files.
**DO NOT** reference any other planning docs outside this structure.

---

## 📁 AUTHORITATIVE DOCUMENTATION LOCATIONS

### Client Portal V2 (UI/Frontend)

**Location:** `docs/client-portal-v2/`

- [CONVERGENT_CANVAS_BUILD_PLAN.md](./client-portal-v2/CONVERGENT_CANVAS_BUILD_PLAN.md) - 10-week UI roadmap
- [LUMEN_PM_V2_PREDICTIVE_AI.md](./client-portal-v2/LUMEN_PM_V2_PREDICTIVE_AI.md) - 10-week PM/AI roadmap

### Project Cortex (Data Harvesting)

**Location:** `docs/PROJECT_CORTEX_IMPLEMENTATION.md`

- Data farmers architecture
- API endpoints for regulatory data sources
- Lumen data atoms structure

### Lumen Cortex Intelligence

**Location:** `docs/LUMEN_CORTEX_INTELLIGENCE.md`

- Cognitive Advisory Service
- IND Pyramid structure
- 510(k) Dossier taxonomy
- Rejection pattern categories

### Architecture Reference

**Location:** `client/src/portal-v2/`

- [ARCHITECTURE.md](../client/src/portal-v2/ARCHITECTURE.md) - Technical architecture
- Core types in `core/portalTypes.ts`
- Security types in `core/securityTypes.ts`

---

## 🔑 KEY SOURCE CODE LOCATIONS

### Frontend (React/TypeScript)

```
client/src/
├── portal-v2/             # NEW CLIENT PORTAL V2 (primary)
│   ├── core/              # Types, policies, context
│   ├── components/        # UI components
│   ├── hooks/             # Custom hooks
│   └── services/          # API services
├── pages/
│   └── admin/             # Admin pages (UserManagement, RoleManagement)
├── contexts/
│   └── UserContext.tsx    # User state propagation
├── hooks/
│   └── use-auth.jsx       # Authentication hook
└── components/
    └── LumenCortexChat.tsx # AI chat interface
```

### Backend (Node.js/Express)

```
server/
├── routes/
│   ├── chat.ts            # Lumen Cortex chat API
│   ├── users.ts           # User management API
│   ├── auth.ts            # Authentication API
│   ├── cortexRoutes.ts    # Cortex intelligence API
│   └── tenants.ts         # Multi-tenant API
└── services/
    ├── cognitiveAdvisoryService.ts
    └── cortexPrimeService.ts
```

### Lumen Cortex Enterprise (Python)

```
lumen_cortex/enterprise/
├── core.py                # EventBus, CircuitBreaker
├── compliance.py          # Part 11: Merkle, Signatures
├── graphrag.py            # Knowledge graph reasoning
├── api_bridge.py          # FastAPI integration
└── BUILD_COMPLETION_2026-01-25.md  # Status report
```

---

## 🎯 USER ROLES (from portalTypes.ts)

| Role              | Description           |
| ----------------- | --------------------- |
| admin             | Full system access    |
| regulatory_lead   | Submission management |
| clinical_ops      | Trial management      |
| medical_writer    | Document authoring    |
| biostatistician   | Statistical analysis  |
| quality_assurance | Compliance oversight  |
| legal_counsel     | Legal review          |
| executive         | Strategic oversight   |
| cmc_specialist    | Manufacturing science |
| safety_officer    | Pharmacovigilance     |
| project_manager   | Program coordination  |
| viewer            | Read-only access      |
| external_partner  | Limited collaboration |

---

## 🚫 ARCHIVED/SUPERSEDED DOCS (DO NOT USE)

These are in `docs/ARCHIVE/` and `docs/archive/` - **DO NOT REFERENCE**:

- Old roadmaps
- Deprecated PM Docs
- Legacy implementation guides

---

## 📋 TERMINOLOGY REFERENCE

| Term | Definition |
|------|------------|
| **Project** | Top-level container for a regulatory submission |
| **Module** | Functional workspace within a project |
| **Chat** | Conversational AI interaction |
| **Artifact** | Persistent output (document, report, export) |
| **Workflow** | Multi-step process with gates and approvals |
| **PM Doc** | Project management documentation |

---

## 📊 CURRENT PROJECT STATUS

### ✅ Completed

- Lumen Cortex Enterprise Python modules (14,700+ LoC)
- Client Portal V2 base architecture
- User authentication flow
- Admin panel pages
- Lumen Cortex chat API

### 🔄 In Progress

- User context propagation across modules
- Admin panel route integration
- Role-based module access

### ⏳ Planned (Per Roadmaps)

- Intent Engine routing
- Cache-first AI integration
- Predictive risk detection
- Client-configurable PM settings

---

## 🔧 DEVELOPMENT COMMANDS

```bash
# Start server
npm run dev

# Run specific route tests
npm test -- --grep "cortex"

# Check TypeScript
npx tsc --noEmit

# Build for production
npm run build
```

---

**Last Updated:** January 27, 2026
**Branch:** concept2cure-v2
