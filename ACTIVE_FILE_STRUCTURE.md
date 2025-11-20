# Active File Structure - TrialSage Platform

## Client Portal Integration Map

### 1. Main Entry Points

```
/client/src/pages/ClientPortal.jsx → Hub for all modules
├── CoAuthor.jsx (eCTD Module)
├── CERV2Page.jsx (CER Generator)
├── INDWizard.jsx (IND Applications)
├── VaultPage.jsx (Document Vault)
├── DocumentEditor.jsx (Editor)
├── Analytics.jsx (Analytics)
├── CMCBlueprint.jsx (CMC Docs)
└── ProjectDashboard.jsx (Projects)
```

### 2. AI Integration (LOCKED)

```
/client/src/components/ai/EmbeddedCodingAgent.jsx
- Title: "Lumen Regulatory Affairs AI Expert"
- Features: Document analysis, file upload, regulatory guidance
- API: /api/regulatory-ai/*
```

### 3. Working Routes (DO NOT MODIFY)

```
Frontend Routes:
/ → Landing
/client-portal → Main Hub
/coauthor → eCTD Co-Author
/cer-v2 → CER Generator
/ind-wizard → IND Application
/vault → Document Vault
/editor → Document Editor
/analytics → Analytics
/cmc-blueprint → CMC Documents
/projects → Project Dashboard

Backend APIs:
/api/regulatory-ai/* → AI endpoints
/api/ectd/* → eCTD module
/api/cer/* → CER generation
/api/ind/* → IND wizard
/api/vault/* → Document vault
/api/editor/* → Editor APIs
/api/analytics/* → Analytics
```

### 4. Component Dependencies

```
Shared Components:
- NavigationBanner.jsx → Used by all pages
- TipTapEditor.jsx → Document editing
- ModuleCard.jsx → Module display
- UI components → /components/ui/*
```

### 5. Services (Active)

```
/client/src/services/
├── aiService.js → OpenAI integration
├── copilotService.js → AI assistance
├── documentService.js → Document ops
├── googleDocsService.js → Google Docs
└── googleAuthService.js → Auth
```

### 6. Protected Configurations

```
/server/routes.ts → Route registration
/server/index.ts → Server config
/client/src/App.jsx → Main app
/client/src/router.jsx → Routing
```

### 7. Database Tables (In Use)

```
- users
- organizations
- client_workspaces
- documents
- ectd_modules
- cer_reports
- ind_applications
- vault_documents
- analytics_events
- sessions
```

### 8. Environment Dependencies

```
Required:
- DATABASE_URL
- OPENAI_API_KEY
- SESSION_SECRET
- REPLIT_DOMAINS

Optional:
- GEMINI_API_KEY
- PERPLEXITY_API_KEY
- SENDGRID_API_KEY
```

## Module Status

### ✅ PRODUCTION READY

- Client Portal Hub
- eCTD Co-Author
- CER Generator v2
- IND Wizard
- Document Vault
- Lumen AI Assistant
- Analytics Dashboard
- CMC Blueprint

### 🔒 LOCKED FEATURES

- Multi-tenant support
- Organization management
- User authentication
- Document versioning
- Export functionality
- AI integration

### ⚠️ DO NOT CREATE

- New components
- Alternative implementations
- Test files
- Duplicate routes
- Mock data files
- Development utilities

## Integration Points

### Client Portal → Modules

Each module accessed via ClientPortal.jsx:

```javascript
const modules = [
  { path: '/coauthor', component: CoAuthor },
  { path: '/cer-v2', component: CERV2Page },
  { path: '/ind-wizard', component: INDWizard },
  { path: '/vault', component: VaultPage },
  { path: '/editor', component: DocumentEditor },
  { path: '/analytics', component: Analytics },
  { path: '/cmc-blueprint', component: CMCBlueprint },
];
```

### AI Assistant Integration

Available on all pages via:

```javascript
import EmbeddedCodingAgent from '@/components/ai/EmbeddedCodingAgent';
```

## Maintenance Notes

1. All modules are fully integrated with ClientPortal
2. Navigation is handled by NavigationBanner
3. Authentication via backend sessions
4. File uploads go to /uploads directory
5. Generated documents in /generated_documents
6. Logs in /logs directory

## Critical: No New Files

This structure is complete. Do not create new files or components. Use only existing implementations.
