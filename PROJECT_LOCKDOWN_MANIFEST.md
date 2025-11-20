# TrialSage Platform Lockdown Manifest

**Version: 1.0.0**
**Lockdown Date: January 7, 2025**
**Status: PRODUCTION READY**

## Core Application Structure

### Client Portal Files (LOCKED)

These files constitute the working application and must NOT be modified without explicit approval:

#### Frontend Core

- `/client/src/main.jsx` - Application entry point
- `/client/src/App.jsx` - Main router and layout
- `/client/src/router.jsx` - Route definitions
- `/client/src/index.css` - Global styles

#### Pages (Client Portal Modules)

- `/client/src/pages/Landing.jsx` - Landing page
- `/client/src/pages/ClientPortal.jsx` - Main client portal hub
- `/client/src/pages/CoAuthor.jsx` - eCTD Co-Author module
- `/client/src/pages/CERV2Page.jsx` - Clinical Evaluation Reports
- `/client/src/pages/INDWizard.jsx` - IND Application wizard
- `/client/src/pages/DocumentEditor.jsx` - Document editor
- `/client/src/pages/VaultPage.jsx` - Document vault
- `/client/src/pages/ProjectDashboard.jsx` - Project management
- `/client/src/pages/Analytics.jsx` - Analytics dashboard
- `/client/src/pages/CMCBlueprint.jsx` - CMC documentation
- `/client/src/pages/ClientWorkspace.jsx` - Client workspace
- `/client/src/pages/ModuleManager.jsx` - Module management

#### Components (Active)

- `/client/src/components/ai/EmbeddedCodingAgent.jsx` - Lumen AI Assistant
- `/client/src/components/common/NavigationBanner.jsx` - Navigation
- `/client/src/components/common/NavBar.jsx` - Navigation bar
- `/client/src/components/common/ModuleCard.jsx` - Module cards
- `/client/src/components/editors/TipTapEditor.jsx` - Rich text editor
- `/client/src/components/vault/*` - Document vault components
- `/client/src/components/ui/*` - UI component library

#### Services (Active)

- `/client/src/services/aiService.js` - AI integration
- `/client/src/services/copilotService.js` - Copilot features
- `/client/src/services/documentService.js` - Document management
- `/client/src/services/googleDocsService.js` - Google Docs integration
- `/client/src/services/googleAuthService.js` - Google authentication

#### Backend Core

- `/server/index.ts` - Express server entry
- `/server/routes.ts` - Main route registration
- `/server/db.ts` - Database connection
- `/server/routes/regulatory-ai.js` - Regulatory AI endpoints
- `/server/routes/ectd-module-routes.js` - eCTD module routes
- `/server/routes/vault-routes.js` - Document vault routes
- `/server/routes/cer-routes.js` - CER generation routes
- `/server/routes/ind-wizard-routes.js` - IND wizard routes
- `/server/routes/document-editor-routes.js` - Editor routes

## Working Features (LOCKED)

### 1. Client Portal Hub

- Multi-tenant workspace management
- Module access control
- Organization management

### 2. eCTD Co-Author (CoAuthor.jsx)

- Complete eCTD document generation
- Module 1-5 support
- PDF export functionality
- Version control

### 3. CER Generator (CERV2Page.jsx)

- Clinical evaluation report generation
- FAERS data integration
- Enhanced PDF export
- Narrative generation

### 4. IND Wizard

- Step-by-step IND application
- Form validation
- Document assembly
- FDA submission prep

### 5. Document Vault

- Secure document storage
- Version control
- Access management
- Search and retrieval

### 6. Lumen AI Assistant

- Regulatory guidance
- Medical writing support
- Document analysis
- File upload processing

### 7. Analytics Dashboard

- Usage metrics
- Compliance tracking
- Performance analytics
- Export capabilities

### 8. CMC Blueprint

- Chemistry, Manufacturing, Controls
- Template library
- Regulatory alignment
- Export functionality

## Protected Files (DO NOT MODIFY)

- `/CERV2Page.jsx` (backup)
- `/CoAuthor.jsx.VERSION_LOCK`
- `/COAUTHOR_HARDLOCK.js`
- `/COAUTHOR_PROTECTION_SYSTEM.js`
- `/cerv2_protection.js`

## Version Control Rules

### 1. No New Files Without Approval

- All new files must be explicitly approved
- Use existing structure only

### 2. Modification Protocol

- Document all changes in this manifest
- Create backups before any modifications
- Test in isolation first

### 3. Dependency Lock

- Current package.json is frozen
- No new dependencies without approval
- Use existing libraries only

### 4. API Endpoints Lock

- All routes in server/routes.ts are frozen
- No new endpoints without approval
- Existing endpoints only

## Archive Strategy

### Files to Archive (Not in Use)

Move to `/archive/` directory:

- Old test files
- Deprecated components
- Legacy implementations
- Development utilities

### Active Development Areas

Only these areas may receive updates:

1. Bug fixes in existing files
2. UI styling improvements
3. Performance optimizations
4. Security patches

## Environment Variables (Required)

```
DATABASE_URL
OPENAI_API_KEY
SESSION_SECRET
REPLIT_DOMAINS
PGDATABASE
PGHOST
PGPASSWORD
PGPORT
PGUSER
```

## Next Steps

1. Create backup of entire project
2. Move unused files to archive
3. Lock package.json versions
4. Document all active integrations
5. Create deployment checklist
