# Industry-Aligned Workflow Components
## Concept2Cure UX Architecture v2.0 - THE SHERPA SYSTEM

> **Version**: 2.0.0  
> **Last Updated**: January 2026  
> **Author**: UI Team - Master Level User Workflow Expert  
> **Target Users**: Biotech, Pharma, MedTech, CRO - Medical Affairs, Regulatory Affairs, Medical Writing

---

## The Vision: The Self-Driving Regulatory Platform

**Current State (The Industry):**
- **Level 0 (Manual):** Microsoft Word + Email (Most of the market)
- **Level 1 (Digital):** Veeva/Box - Cloud storage, but dumb
- **Level 2 (Assisted):** Weave.bio - AI that helps you write

**Future State (Concept2Cure):**
- **Level 3 (Autonomous):** The platform doesn't just "help"; it **ANTICIPATES**
  - It doesn't wait for you to ask: "Check for recalls."
  - It wakes you up saying: "While you slept, Competitor X issued a Class I recall. 
    I have already drafted a Risk Assessment update for your 510(k). Click here to approve."

---

## THE SHERPA METAPHOR

> *"Trying to submit an FDA application without Concept2Cure is like trying to climb Everest without a Sherpa. You might make it, but you will move slower, carry more weight, and face risks you can't see coming."*

### The IND PYRAMID
Reaching the summit of FDA approval requires more than just ambition; it requires a guide who knows the mountain. Just as Sherpas provide the critical support system that makes Everest attainable, Concept2Cure provides the automated rigor and strategic foresight that makes regulatory success repeatable.

**We transform a perilous climb into a guided, data-driven journey.**

### The Sherpa Team

| Component | Sherpa Role | The Challenge | How It Acts as Sherpa | The Benefit |
|-----------|-------------|---------------|----------------------|-------------|
| **Lumen Cortex** | The Expedition Leader | Regulatory landscapes shift constantly (new FDA guidance, competitor recalls). If you aren't paying attention, the weather turns, and you freeze. | **Horizon Scanning:** Lumen's "Global Hunters" scan Health Canada, the EMA, and the FDA 24/7. **Route Correction:** If a competitor fails a Phase 3 trial, Lumen alerts you immediately via the "Command Center." | You never walk into a storm blind. |
| **eCTD Co-Author** | The Heavy Lifter | Writing a 200-page Clinical Overview is exhausting "grunt work." It weighs down your high-priced scientists. | **Carrying the Load:** Click "Draft," and Lumen carries the burden of the first draft, citing every claim using "Smart Tags." **Safety Lines:** If you write a claim not supported by data, the "Co-Pilot" pulls the rope tight (Redline Alert). | Your experts save their energy for strategy, not typing. |
| **CMC Wizard** | The Gear Master | A single impurity or unstable batch can destroy the entire mission. The FDA is unforgiving of bad equipment. | **Equipment Check:** "ICH Guardrails" act like a checklist. "Warning: Impurity A is at 0.20%. That is too high for this altitude (Qualification Threshold)." **Repair Kit:** AI generates the "Justification Narrative." | You don't get sent back to Base Camp (Refusal to File) because of a bad batch. |
| **CERV2 Pathfinder** | The Scout | In 510(k) submissions, you must prove you are "Substantially Equivalent" to a predicate. Picking the wrong path means death. | **Scouting the Trail:** Scans the MAUDE database (the graveyard of failed devices) and finds a safe Predicate Device that hasn't been recalled. **Marking Hazards:** Flags crevasses (Class I Recalls) in competitors' history. | You climb the proven path, avoiding the traps that killed others. |
| **The Vault** | Base Camp | A disorganized expedition loses supplies. If you can't find the Clinical Protocol during an audit, you lose. | **Organization:** The "Deep Genome" engine doesn't just pile files in a corner. It unpacks them, catalogs them, and vectorizes them. **Instant Retrieval:** Ask "Where is the safety data?" and Lumen hands it to you instantly. | Total audit readiness. No panic. |

---

## Executive Summary

This document describes the industry-aligned UX components designed for regulatory professionals. These components are organized around how organizations actually work, not generic project management concepts.

---

## 1. Organizational Models

### 1.1 Biotech Model
**Structure**: Product-centric (single or few products in development)

```
Biotech Organization
├── Product A (Lead Asset)
│   ├── IND Stage → Clinical → NDA/BLA
│   ├── Regulatory Meetings (Pre-IND, EOP2, Pre-NDA)
│   └── Key Milestones (First Patient, Database Lock, Filing)
└── Product B (Early Pipeline)
    └── Discovery → IND-Enabling
```

**Key UI Elements**:
- Single-product focus view
- Milestone tracker to funding events
- Lean team collaboration
- Outsourced deliverable tracking

### 1.2 Pharma Model
**Structure**: Portfolio-based (multiple therapeutic areas)

```
Pharma Organization
├── Therapeutic Area: Oncology
│   ├── Product Alpha (Commercial)
│   │   ├── Label Extensions
│   │   ├── Regulatory Commitments (PMCs)
│   │   └── Global Registrations
│   └── Product Beta (Phase 3)
│       └── NDA Preparation
├── Therapeutic Area: Cardiology
│   └── Product Gamma (Pre-Registration)
└── Corporate
    ├── PDUFA Calendar
    ├── Regulatory Intelligence
    └── Compliance Metrics
```

**Key UI Elements**:
- Portfolio dashboard with health scores
- PDUFA date tracking across products
- Global registration matrix
- Regulatory commitment tracker

### 1.3 CRO Model
**Structure**: Client → MSA → SOW → Deliverables

```
CRO Organization
├── Client: PharmaCo (Enterprise Tier)
│   ├── MSA-2024-001
│   │   ├── SOW-001: Product X NDA Support
│   │   │   ├── Deliverable: CSR
│   │   │   ├── Deliverable: Module 2.7
│   │   │   └── Deliverable: eCTD Publishing
│   │   └── SOW-002: Labeling Update
│   └── Resource Allocation
├── Client: BiotechCo (Strategic)
│   └── SOW-003: IND Package
└── Operations
    ├── Utilization Dashboard
    ├── Revenue Tracking
    └── Change Order Management
```

**Key UI Elements**:
- Client relationship dashboard
- Project burn rate tracking
- Resource utilization heatmap
- Change order pipeline

### 1.4 MedTech/Device Model - NEW!
**Structure**: Product → Pathway → Predicate → Submission

```
MedTech Organization
├── Product: CardioMonitor X
│   ├── Pathway: 510(k)
│   │   ├── Predicate Search (MAUDE Scanning)
│   │   ├── eSTAR Sections
│   │   └── Testing Requirements
│   └── EU MDR Compliance
│       ├── CER (Clinical Evaluation Report)
│       └── GSPR Requirements
├── Product: DiagTest Pro
│   ├── Pathway: PMA (Class III)
│   └── Clinical Studies
└── Regulatory Intelligence
    ├── MAUDE Hazard Monitor
    ├── Competitor Recalls
    └── Guidance Updates
```

**Key UI Elements**:
- **Predicate Pathfinder**: Find safe 510(k) predicates
- **MAUDE Hazard Monitor**: Track competitor recalls
- **eSTAR Progress Tracker**: Complete submission sections
- **CER Tracker**: EU MDR compliance

---

## 2. Component Architecture

### 2.1 Industry Workspace Shell
**File**: `/client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx`

The main container that adapts to industry mode:

```typescript
type IndustryMode =
  | 'biotech'
  | 'pharma'
  | 'cro'
  | 'medtech'
  | 'academic'
  | 'regulatory'
  | 'medical_writing';

interface IndustryWorkspaceShell {
  // Adapts navigation, dashboards, and features based on mode
  currentUser: CurrentUser;
  industryMode: IndustryMode;
}
```

**Features**:
- Mode-aware navigation (different nav items per industry)
- Role-based quick actions in header
- Unified notification system
- Keyboard shortcuts (⌘K command palette)

### 2.2 Industry Role Dashboard
**File**: `/client/src/concept2cure/components/dashboards/IndustryRoleDashboard.tsx`

Role-specific views showing what matters most:

| Role | Primary View | Key Metrics |
|------|--------------|-------------|
| RA Lead | PDUFA calendar, Commitments | Days to deadline, At-risk items |
| Medical Writer | Document queue, Review status | Words written, Documents in QC |
| CMC Lead | Module 3 status, Change controls | Open deviations, Batch status |
| Project Manager | Deliverable board, Resources | Budget burn, Utilization |
| QA Manager | Audit schedule, CAPA status | Open findings, Overdue items |
| Executive | Portfolio health, Revenue | Pipeline value, Win rate |

### 2.3 Regulatory Calendar
**File**: `/client/src/concept2cure/components/calendar/RegulatoryCalendar.tsx`

Calendar optimized for regulatory milestones:

**Event Types**:
- `pdufa` - FDA goal dates (highest priority, red)
- `commitment` - PMCs, PMEs, REMS deadlines
- `meeting` - Agency meetings, Advisory Committees
- `filing` - Submission target dates
- `renewal` - License renewals, annual reports
- `psur` - Safety reporting deadlines

**Features**:
- PDUFA dates prominently displayed
- Commitment tracking with status
- Multi-region support (FDA, EMA, PMDA)
- 30-day lookahead sidebar

### 2.4 eCTD Dossier Navigator
**File**: `/client/src/concept2cure/components/submission/DossierNavigator.tsx`

Tree navigation following ICH CTD structure:

```
Module 1: Administrative Information (Regional)
├── 1.1 Forms
├── 1.2 Cover Letters
├── 1.3 Administrative Information
│   ├── 1.3.1 Contact/Sponsor/Applicant Info
│   ├── 1.3.2 Field Copy Certification
│   └── 1.3.3 Debarment Certification
└── ...

Module 2: Common Technical Document Summaries
├── 2.2 Introduction
├── 2.3 Quality Overall Summary (QOS)
├── 2.4 Nonclinical Overview
├── 2.5 Clinical Overview
├── 2.6 Nonclinical Written and Tabulated Summaries
└── 2.7 Clinical Summary

Module 3: Quality (CMC)
├── 3.2.S Drug Substance
├── 3.2.P Drug Product
└── 3.2.A Appendices

Module 4: Nonclinical Study Reports
├── 4.2 Study Reports
└── 4.3 Literature References

Module 5: Clinical Study Reports
├── 5.2 Tabular Listing of All Clinical Studies
├── 5.3 Clinical Study Reports
│   ├── 5.3.1 BA/BE Studies
│   ├── 5.3.3 PK Studies
│   ├── 5.3.4 PD Studies
│   └── 5.3.5 Efficacy/Safety Studies
└── 5.4 Literature References
```

**Features**:
- Document status tracking per section
- Progress bars at module level
- Search within dossier
- Export eCTD validation
- Linked source documents

### 2.5 Workflow Proofs & Certificate Verification
**Files**:
- `/client/src/concept2cure/components/proof/ProofExplorer.tsx`
- `/server/routes/workflow.ts`

**Purpose**: Provide tamper-evident proof certificates with verification UX (Part 11 support).

**User Flow**:
1. User opens a workflow run.
2. UI requests a proof certificate.
3. UI runs verification and displays pass/fail details.

**API Contracts (Envelope Standard)**:
```
GET  /api/workflow/proofs/certificate/:workflowRunId
POST /api/workflow/proofs/verify
```

**Response Envelope**:
```
{ "success": true, "data": { ...certificateOrVerification } }
{ "success": false, "error": { "message": "..." } }
```

**UX Expectations**:
- Never show raw JSON; summarize verification status.
- Failure states provide actionable guidance (e.g., “Re-run verification”).
- Verification results are non-blocking; the user can continue while a warning is displayed.

### 2.6 Knowledge Base & Audit Logging (Part 11)
**Files**:
- `/client/src/concept2cure/hooks/useProjectKnowledge.ts`
- `/server/routes/concept2cure.ts`
- `/client/src/concept2cure/components/ErrorBoundary.tsx`

**Purpose**: Align project knowledge uploads + instructions with audit-grade logging.

**API Contracts (Envelope Standard)**:
```
GET    /api/concept2cure/projects/:projectId/knowledge
PATCH  /api/concept2cure/projects/:projectId/knowledge
POST   /api/concept2cure/documents/upload
DELETE /api/concept2cure/documents/:documentId
POST   /api/concept2cure/errors
```

**Upload Guardrails**:
- Allowlist MIME types (PDF/DOCX/TXT/MD/CSV/XLSX)
- Max file size 50MB
- Filenames sanitized for storage and audit traceability

**Audit Requirements**:
- Every mutation produces a regulatory audit log entry.
- Client errors are forwarded via `/api/concept2cure/errors` with full context.
- Knowledge metadata (custom instructions, context) is preserved in `project.settings`.

### 2.7 API Envelope Standard (System-Wide)
All Concept2Cure and Workflow routes return a consistent envelope to support GA-grade stability:

```
{ "success": true, "data": { ... }, "meta": { ... } }
{ "success": false, "error": { "message": "...", "code": "...", "details": [ ... ] } }
```

**Client Expectations**:
- Always unwrap `data`.
- Always handle `success=false` and `error.message`.
- Never assume a raw payload.

### 2.8 Concept2Cure Core API Contracts
**Server File**: `/server/routes/concept2cure.ts`

**Projects**:
```
GET    /api/concept2cure/projects
GET    /api/concept2cure/projects/:id
POST   /api/concept2cure/projects
PUT    /api/concept2cure/projects/:id
DELETE /api/concept2cure/projects/:id
```

**Conversations & Messages**:
```
POST /api/concept2cure/projects/:projectId/conversations
POST /api/concept2cure/projects/:projectId/conversations/:conversationId/messages
```

**Artifacts & Signatures**:
```
GET  /api/concept2cure/projects/:projectId/artifacts
POST /api/concept2cure/projects/:projectId/artifacts
PUT  /api/concept2cure/projects/:projectId/artifacts/:artifactId
POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
```

**Templates**:
```
GET /api/concept2cure/templates
GET /api/concept2cure/templates/:id
```

**CMC Dashboard (Envelope Standard)**:
```
GET /api/cmc/status
GET /api/cmc/metrics
GET /api/cmc/projects
```

**Knowledge & Audit** (see 2.6):
```
GET    /api/concept2cure/projects/:projectId/knowledge
PATCH  /api/concept2cure/projects/:projectId/knowledge
POST   /api/concept2cure/documents/upload
DELETE /api/concept2cure/documents/:documentId
POST   /api/concept2cure/errors
```

**Client Hooks**:
- `/client/src/concept2cure/hooks/useProjects.ts`
- `/client/src/concept2cure/hooks/useTemplates.ts`
- `/client/src/concept2cure/hooks/useProjectKnowledge.ts`
- `/client/src/concept2cure/hooks/useChat.ts`

**Integration Rules**:
- `projectId` uses the `proj_` prefix externally.
- All API mutations are audited (Part 11).
- Artifacts preserve version history with content integrity hashes.

### 2.9 Medical Writer Queue
**File**: `/client/src/concept2cure/components/writing/MedicalWriterQueue.tsx`

Document production workflow for writers:

**Document Types**:
- CSR (Clinical Study Report)
- IB (Investigator Brochure)
- Protocol / Protocol Amendment
- ICF (Informed Consent Form)
- CTD Summaries (2.3, 2.4, 2.5, 2.7)
- Regulatory Responses
- Briefing Documents

**Review Stages** (Kanban Pipeline):
```
Draft → Internal Review → SME Review → QC → Sponsor Review → Final QC → Approved → Published
```

**Features**:
- Pipeline view (Kanban) or list view
- Word count / page count tracking
- Pending comment indicators
- Template library integration
- Source document linking

### 2.10 CRO Resource Dashboard
**File**: `/client/src/concept2cure/components/cro/CROResourceDashboard.tsx`

Multi-client operations management:

**Metrics**:
- Total Contract Value (TCV)
- Billed YTD
- Burn Rate by Project
- Utilization by Department
- At-Risk Projects

**Features**:
- Client cards with project rollup
- Utilization heatmap by department
- Change order pipeline
- Resource allocation view
- Health score per project

### 2.11 Team Collaboration Panel
**File**: `/client/src/concept2cure/components/collaboration/TeamCollaborationPanel.tsx`

Real-time collaboration features:

**Features**:
- Team presence indicators
- Activity feed with @mentions
- Active editing sessions
- Quick messaging
- Video call integration

**Activity Types**:
- Document edits
- Comments added/resolved
- Reviews requested/completed
- Task assignments
- Approvals granted

### 2.12 Quick Start Wizard
**File**: `/client/src/concept2cure/components/wizard/QuickStartWizard.tsx`

Guided project creation:

**Steps**:
1. Organization Type (Biotech/Pharma/CRO/MedTech/Academic)
2. Submission Type (IND, NDA, BLA, 510(k), MAA, etc.)
3. Product & Therapeutic Area
4. Regions & Timeline
5. Review & Create

**Output**:
- Pre-configured eCTD structure
- Document templates loaded
- Timeline with milestones
- Checklist generated

---

## 3. Type System

### 3.1 Core Types
**Files**:
- `/client/src/concept2cure/types/workspace.ts`
- `/client/src/concept2cure/components/industry/index.ts`

```typescript
// Organization Modes
type IndustryMode = 'biotech' | 'pharma' | 'cro' | 'medtech' | 'academic';

// User Roles (canonical)
type UserRole = 
  | 'regulatory_affairs'
  | 'ra_lead'
  | 'ra_specialist'
  | 'medical_writer'
  | 'clinical_ops'
  | 'medical_affairs'
  | 'quality_assurance'
  | 'cmc_lead'
  | 'project_manager'
  | 'executive'
  | 'consultant';

// Submission Types
type SubmissionType = 
  | 'IND' | 'NDA' | 'BLA' | 'ANDA' | '510K' | 'PMA' | 'DE_NOVO' | 'HDE' | 'EUA'
  | 'MAA' | 'CTA' | 'IMPD'
  | 'CER' | 'PSUR' | 'PBRER'
  | 'TYPE_IA' | 'TYPE_IB' | 'TYPE_II' | 'PRIOR_APPROVAL' | 'CBE' | 'CBE30' | 'ANNUAL_REPORT';

// Regulatory Regions
type RegulatoryRegion = 'US' | 'EU' | 'JP' | 'CN' | 'CA' | 'AU' | 'BR' | 'ROW';

// Product Stages
type ProductStage = 
  | 'discovery'
  | 'preclinical'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'registration'
  | 'marketed'
  | 'lifecycle';
```

---

## 4. Implementation Files

| Component | File Path | Status |
|-----------|-----------|--------|
| Workspace Types | `/client/src/concept2cure/types/workspace.ts` | ✅ |
| Industry Shell | `/client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx` | ✅ |
| Role Dashboard | `/client/src/concept2cure/components/dashboards/IndustryRoleDashboard.tsx` | ✅ |
| Regulatory Calendar | `/client/src/concept2cure/components/calendar/RegulatoryCalendar.tsx` | ✅ |
| Dossier Navigator | `/client/src/concept2cure/components/submission/DossierNavigator.tsx` | ✅ |
| Writer Queue | `/client/src/concept2cure/components/writing/MedicalWriterQueue.tsx` | ✅ |
| CRO Dashboard | `/client/src/concept2cure/components/cro/CROResourceDashboard.tsx` | ✅ |
| Team Panel | `/client/src/concept2cure/components/collaboration/TeamCollaborationPanel.tsx` | ✅ |
| Quick Start Wizard | `/client/src/concept2cure/components/wizard/QuickStartWizard.tsx` | ✅ |
| Proof Explorer | `/client/src/concept2cure/components/proof/ProofExplorer.tsx` | ✅ |
| Project Knowledge Hook | `/client/src/concept2cure/hooks/useProjectKnowledge.ts` | ✅ |
| Projects Hook | `/client/src/concept2cure/hooks/useProjects.ts` | ✅ |
| Templates Hook | `/client/src/concept2cure/hooks/useTemplates.ts` | ✅ |
| Chat Hook | `/client/src/concept2cure/hooks/useChat.ts` | ✅ |
| Cortex Service | `/client/src/concept2cure/services/cortexService.ts` | ✅ |
| CMC Service | `/client/src/concept2cure/services/cmcService.ts` | ✅ |
| Regulatory Intelligence Service | `/client/src/concept2cure/services/regulatoryIntelligenceService.ts` | ✅ |
| Medical Device Service | `/client/src/concept2cure/services/medicalDeviceService.ts` | ✅ |
| Document Intelligence Service | `/client/src/concept2cure/services/documentIntelligenceService.ts` | ✅ |
| Error Boundary | `/client/src/concept2cure/components/ErrorBoundary.tsx` | ✅ |
| Workflow Routes | `/server/routes/workflow.ts` | ✅ |
| Concept2Cure Routes | `/server/routes/concept2cure.ts` | ✅ |
| Demo Integration | `/client/src/concept2cure/demo/UnifiedWorkspaceDemo.tsx` | ✅ |

---

## 5. Integration with ZenApp

To integrate these components into the existing ZenApp shell:

```typescript
// In ZenApp.tsx, add industry-aware routing:
import { IndustryWorkspaceShell } from './components';

const ZenApp = () => {
  const { industryMode, userRole } = useCurrentUser();
  
  return (
    <IndustryWorkspaceShell 
      currentUser={user}
      notifications={notifications}
      onViewChange={handleViewChange}
    >
      <CurrentView />
    </IndustryWorkspaceShell>
  );
};
```

**Concept2Cure Shell Expectations**:
- `ConvergentCanvas` receives `userName`, `userRole`, and `industry` from profile context.
- Industry/role enums are canonical (lowercase industry, standardized `UserRole`).
- API calls unwrap the `data` envelope and handle `success=false` at all boundaries.

---

## 6. Compliance Considerations

### 6.1 21 CFR Part 11
- All document status changes logged
- User authentication required for all actions
- Electronic signatures for approvals
- Audit trail accessible

**Implementation Guarantees**:
- Artifacts store immutable version history with SHA-256 integrity hashes.
- Signatures bind signer identity, artifact version, and content hash.
- Audit entries include IP address, user agent, session, and integrity hash.

### 6.2 ICH Guidelines
- eCTD structure follows ICH M4
- Module organization per ICH CTD
- Regional adaptations (Module 1)

### 6.3 HIPAA Awareness
- PHI indicators on clinical documents
- Access controls per data type
- Audit logging for sensitive access

---

## 7. PHASE 52: THE CONVERGENT CANVAS ARCHITECTURE

### 7.1 The Living Canvas Concept
We are abandoning the concept of "Pages" (Dashboard vs. Editor). We are moving to a **LIVING CANVAS**:
- **The Context Ribbon** anchors you (always know where you are)
- **The Cortex Sidecar** guides you (your Sherpa team is always available)
- **The Center Stage** morphs instantly from "Data Grid" to "Document" to "Wargame Simulation"

### 7.2 Phase 52 Components

| Component | File Path | Sherpa Role | Status |
|-----------|-----------|-------------|--------|
| **ContextRibbon** | `/components/layout/ContextRibbon.tsx` | The Compass & Altimeter | ✅ |
| **CouncilThread** | `/components/chat/CouncilThread.tsx` | The Sherpa Council | ✅ |
| **MorningBriefing** | `/components/dashboard/MorningBriefing.tsx` | The Weather Report | ✅ |
| **ConvergentCanvas** | `/components/layout/ConvergentCanvas.tsx` | The Base Camp | ✅ |
| **eCTDCoAuthor** | `/components/coauthor/eCTDCoAuthor.tsx` | The Heavy Lifter | ✅ |
| **CMCWizard** | `/components/cmc/CMCWizard.tsx` | The Gear Master | ✅ |
| **MedicalDeviceDashboard** | `/components/medtech/MedicalDeviceDashboard.tsx` | The Pathfinder | ✅ |

### 7.3 Context Ribbon
The persistent status bar that connects the user's work to the project's health:
- **Active Context**: Current project and workspace mode
- **Deadline Countdown**: Days remaining to target date
- **Risk Level**: LOW → MEDIUM → HIGH → CRITICAL
- **Cortex Connection**: Live status of AI services

### 7.4 Morning Briefing (The Day Zero Greeting)
When users login, they are greeted with:
- **Personalized Greeting**: "Good Morning, Director."
- **Critical Alerts**: Overnight regulatory intelligence
- **Today's Priorities**: Action items needing attention
- **Stats Snapshot**: Quick health metrics

### 7.5 Council Thread (The Humanized AI)
Multi-agent council rendered as a collaborative team thread:
- **Lumen Author**: The document drafter
- **Dr. Stat**: The verification specialist
- **The Auditor**: The risk assessor
- **Cortex Core**: The expedition leader

### 7.6 eCTD Co-Author Zero State
Before the user starts drafting, the sidebar shows:
> *"Your Sherpa is ready. I'll help you draft your regulatory documents, verify every claim against your source data, and ensure you reach the summit of approval safely."*

---

## 8. MedTech/Device Market Components

### 8.1 Medical Device Dashboard
**File**: `/client/src/concept2cure/components/medtech/MedicalDeviceDashboard.tsx`

Supporting pathways:
- **510(k)**: Substantial Equivalence submissions
- **PMA**: Premarket Approval for Class III devices
- **De Novo**: Novel low-moderate risk devices
- **CER**: Clinical Evaluation Reports (EU MDR)
- **eSTAR**: Required electronic submission format

### 8.2 Predicate Pathfinder
The "Scout" that finds safe paths others have climbed:
- Searches MAUDE database for predicate candidates
- Scores similarity to your device
- Flags recalls and hazards in competitor history
- Recommends: Strong Match / Acceptable / Caution / Avoid

### 8.3 MAUDE Hazard Monitor
Marks the crevasses (failures) in the landscape:
- Real-time alerts for competitor recalls
- Event type classification: Death / Injury / Malfunction
- Relevance scoring to your device category
- Risk assessment integration

### 8.4 eSTAR Progress Tracker
Tracks completion of FDA's required submission sections:
- Section-by-section progress
- Required attachments tracking
- Validation against FDA requirements

---

## 9. Next Steps

### Immediate
1. Integrate ConvergentCanvas into main application shell
2. Connect Morning Briefing to regulatory intelligence feeds
3. Wire up Council Thread to multi-agent backend
4. Enable Smart Tags in eCTD Co-Author

### Near-term
1. Real-time MAUDE scanning integration
2. AI-powered predicate recommendations
3. ICH guardrail automation in CMC Wizard
4. Justification narrative generation

### Long-term
1. Level 3 Autonomous mode: Proactive alerts
2. "While you slept" overnight intelligence
3. Pre-drafted risk assessments
4. Cross-submission learning

---

## Appendix: Component Props Reference

See individual component files for full TypeScript interfaces and props documentation.

### Complete File Inventory (Phase 52)

```
client/src/concept2cure/
├── components/
│   ├── biotech/
│   │   └── BiotechProgramDashboard.tsx      (~650 lines)
│   ├── pharma/
│   │   └── PharmaPortfolioDashboard.tsx     (~700 lines)
│   ├── cro/
│   │   ├── CROClientPortal.tsx              (~750 lines)
│   │   └── CROResourceDashboard.tsx         (~300 lines)
│   ├── medtech/
│   │   └── MedicalDeviceDashboard.tsx       (~850 lines) ★ NEW
│   ├── regulatory/
│   │   └── FDAMeetingWorkspace.tsx          (~700 lines)
│   ├── writing/
│   │   ├── ClinicalDocAuthoringWorkspace.tsx (~700 lines)
│   │   └── MedicalWriterQueue.tsx           (~300 lines)
│   ├── coauthor/
│   │   └── eCTDCoAuthor.tsx                 (~750 lines) ★ NEW
│   ├── cmc/
│   │   └── CMCWizard.tsx                    (~650 lines) ★ NEW
│   ├── layout/
│   │   ├── ContextRibbon.tsx                (~250 lines) ★ NEW
│   │   └── ConvergentCanvas.tsx             (~500 lines) ★ NEW
│   ├── chat/
│   │   └── CouncilThread.tsx                (~400 lines) ★ NEW
│   ├── dashboard/
│   │   └── MorningBriefing.tsx              (~400 lines) ★ NEW
│   ├── industry/
│   │   ├── index.ts                         (~200 lines) UPDATED
│   │   └── README.md                        (~300 lines)
│   └── onboarding/
│       └── IndustryModeSelector.tsx         (~400 lines)
└── IndustryAwareApp.tsx                     (~400 lines)
```

Total new code: ~10,000+ lines of industry-native components.

---

*"We don't just sell software. We provide the Guide (Cortex), the Pathfinder (CERV2), and the Porters (Co-Author) to ensure you reach the summit—Market Approval—alive and on time."*
