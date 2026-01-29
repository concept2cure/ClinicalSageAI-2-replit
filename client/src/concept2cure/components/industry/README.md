/**
 * @fileoverview Comprehensive Industry Workflow Architecture Documentation
 * @version 2.0.0
 * @date 2025-01-24
 *
 * This document describes the INDUSTRY-NATIVE UX architecture for Concept2Cure,
 * designed around how BIOTECH, PHARMA, CRO, and REGULATORY organizations
 * ACTUALLY operate in their daily workflows.
 */

# Industry-Native UX Architecture

## Core Philosophy

> "Design the UI around how the industry works, not how software engineers
> think the industry should work."

Each organization type has fundamentally different:
- **Mental models** - How they conceptualize their work
- **Hierarchies** - How they organize projects/products
- **Metrics** - What KPIs matter most
- **Workflows** - Daily operational patterns
- **Vocabulary** - Domain-specific terminology

---

## Organization Archetypes

### 🧬 BIOTECH (Small/Mid-Cap)

**Mental Model:** "Where is my lead asset in the development pathway?"

**Reality:**
- 1-3 products in development (often just one)
- Racing to milestones (funding tied to clinical milestones)
- Lean team - everyone wears multiple hats
- Heavy outsourcing (CROs for writing, CMOs for manufacturing)
- Board and investor visibility is critical
- Runway/burn rate anxiety

**Component:** `BiotechProgramDashboard`

**Key Features:**
- Development stage pipeline (20 stages: discovery → approval)
- Funding milestone tracking (Series A/B/C/IPO)
- Outsourced vendor deliverable tracking
- FDA interaction timeline
- Critical path visualization
- Burn rate awareness

**Sample Use Cases:**
1. "Show me our pathway to IND filing"
2. "What vendor deliverables are blocking progress?"
3. "When is our next FDA meeting?"
4. "Are we on track for the Series B milestone?"

---

### 💊 PHARMA (Large Enterprise)

**Mental Model:** "What's the health of our portfolio across therapeutic areas?"

**Reality:**
- Dozens of products across lifecycle stages
- Matrix organization (by therapeutic area × function × region)
- Global registrations in 50+ countries
- Heavy regulatory commitment burden (PMCs, PMRs, REMS, PSURs)
- PDUFA dates are board-level visibility items
- Lifecycle management is continuous

**Component:** `PharmaPortfolioDashboard`

**Key Features:**
- Therapeutic area portfolio roll-up
- Global registration matrix (US/EU/JP/CN/ROW)
- PDUFA calendar with urgency indicators
- Regulatory commitment tracker
- Revenue-linked product health scores
- Variation/supplement tracking

**Sample Use Cases:**
1. "Show me all PDUFA dates in the next 6 months"
2. "What's the global registration status of Product X?"
3. "Which post-marketing commitments are at risk?"
4. "Roll up the oncology portfolio status"

---

### 🏢 CRO (Contract Research Organization)

**Mental Model:** "What do we owe clients and when?"

**Reality:**
- Everything is client and contract driven
- SOW (Statement of Work) is the unit of work
- Multiple clients with competing priorities
- Utilization rates determine profitability
- Change orders are constant (scope creep management)
- Deliverable deadlines are commitments

**Component:** `CROClientPortal`

**Key Features:**
- Client → Program → SOW → Deliverable hierarchy
- MSA renewal tracking
- Deliverable pipeline with due dates
- Resource utilization visualization
- Change order workflow
- Budget burn tracking per SOW

**Sample Use Cases:**
1. "What deliverables are due this week across all clients?"
2. "Show me utilization for the writing team"
3. "Which SOWs need renewal?"
4. "What change orders are pending approval?"

---

### 🏛️ REGULATORY (FDA Interaction Focus)

**Mental Model:** "Prepare for and execute successful FDA meetings"

**Reality:**
- FDA meetings are pivotal milestones
- Briefing documents have strict format requirements
- Questions must be strategic and carefully crafted
- Type A/B/C meetings have different timelines
- Official minutes are binding - track commitments
- Pre-IND, EOP2, Pre-NDA are career-defining

**Component:** `FDAMeetingWorkspace`

**Key Features:**
- Meeting type classification (A/B/C)
- Meeting status timeline
- Question management by topic
- FDA commitment tracking
- Briefing document workflow
- Minutes action item extraction

**Sample Use Cases:**
1. "Prepare a Type B Pre-IND meeting package"
2. "Track action items from FDA meeting minutes"
3. "What did FDA say about our CMC strategy?"
4. "Generate meeting request letter"

---

### ✍️ MEDICAL WRITING

**Mental Model:** "Build the document structure, fill with content, iterate through reviews"

**Reality:**
- Documents have strict ICH/CDISC templates
- Multiple review rounds (internal → cross-functional → final)
- Heavy use of source documents (protocols, CSRs, data tables)
- Annotations from SMEs are critical
- Version control is mandatory (21 CFR Part 11)
- Cross-referencing between documents

**Component:** `ClinicalDocAuthoringWorkspace`

**Key Features:**
- Document section tree navigation
- Review comment management by priority
- Source document linking
- Version history
- Progress tracking by section
- Style guide compliance

**Sample Use Cases:**
1. "Start writing the efficacy summary for NDA Module 2.5"
2. "Show me source data for Table 14.2.1"
3. "Track comments from the clinical team"
4. "Check consistency with the IB"

---

## Component Architecture

```
/client/src/concept2cure/components/
├── industry/
│   ├── index.ts                          # Unified exports
│   └── README.md                         # This file
├── biotech/
│   └── BiotechProgramDashboard.tsx       # Biotech-native dashboard
├── pharma/
│   └── PharmaPortfolioDashboard.tsx      # Pharma portfolio view
├── cro/
│   ├── CROClientPortal.tsx               # CRO client management
│   └── CROResourceDashboard.tsx          # Resource utilization
├── regulatory/
│   └── FDAMeetingWorkspace.tsx           # FDA meeting workflow
└── writing/
    ├── ClinicalDocAuthoringWorkspace.tsx # Document authoring
    └── MedicalWriterQueue.tsx            # Writer task queue
```

---

## Type System

All components share a common type foundation:

```typescript
// Industry Mode
type IndustryMode = 'biotech' | 'pharma' | 'cro' | 'medtech' | 'academic';

// User Roles (determines view)
type UserRole = 
  | 'regulatory_affairs'
  | 'medical_writer'
  | 'clinical_ops'
  | 'medical_affairs'
  | 'quality_assurance'
  | 'project_manager'
  | 'executive'
  | 'consultant';

// Maps industry to dashboard
const INDUSTRY_DASHBOARD_MAP = {
  biotech: 'BiotechProgramDashboard',
  pharma: 'PharmaPortfolioDashboard',
  cro: 'CROClientPortal',
  // ...
};
```

---

## Integration Pattern

### User Sign-In Flow

```
1. User authenticates
2. System detects organization type (biotech/pharma/cro)
3. System detects user role (regulatory/writer/clinical)
4. Load appropriate dashboard based on:
   - Industry mode → Primary layout
   - User role → Specialized panels
5. Restore session state (last viewed project, etc.)
```

### Dashboard Selection Logic

```typescript
function selectDashboard(user: User): Dashboard {
  const industryDashboard = INDUSTRY_DASHBOARD_MAP[user.organization.type];
  const roleWorkspaces = ROLE_WORKSPACE_MAP[user.role];
  
  return {
    primary: industryDashboard,
    available: roleWorkspaces,
    defaultView: user.preferences?.defaultView || industryDashboard,
  };
}
```

---

## Key Differentiators from Generic Project Management

| Generic PM | Industry-Native |
|------------|-----------------|
| "Projects" | Programs, Products, Compounds |
| "Tasks" | Deliverables, Sections, Milestones |
| "Deadlines" | PDUFA Dates, FDA Meetings, Regulatory Commitments |
| "Team" | Sponsor, CRO, Vendors, Reviewers |
| "Status" | Development Stage, Registration Status, Review Cycle |
| "Progress %" | Critical Path, Runway, Utilization |
| "Reports" | eCTD Modules, CTD Summaries, Briefing Docs |

---

## Session & Context

All industry dashboards integrate with:

1. **Session Restoration** (`useSessionRestore.ts`)
   - Remember last viewed product/project
   - Restore filter states
   - Resume document editing position

2. **Workspace Context** (`ZenWorkspaceContext.tsx`)
   - Current industry mode
   - Active user role
   - Selected project/product
   - Filter preferences

3. **AI Assistant Integration** (`LumenProjectAssistant.tsx`)
   - Context-aware help based on industry
   - Role-specific suggestions
   - Document drafting assistance

---

## Implementation Status

| Component | Status | Lines | Features |
|-----------|--------|-------|----------|
| BiotechProgramDashboard | ✅ Complete | ~650 | Dev stages, funding, vendors, FDA |
| PharmaPortfolioDashboard | ✅ Complete | ~700 | Portfolio, global matrix, PDUFA, commitments |
| CROClientPortal | ✅ Complete | ~750 | Clients, SOWs, deliverables, utilization |
| FDAMeetingWorkspace | ✅ Complete | ~700 | Meeting types, questions, action items |
| ClinicalDocAuthoringWorkspace | ✅ Complete | ~700 | Sections, comments, sources, versions |

---

## Next Steps

### Phase 3: Deep Integration

1. **AI-Powered Features**
   - Auto-generate briefing document outlines
   - Smart comment resolution suggestions
   - Critical path risk prediction

2. **Real-Time Collaboration**
   - Multi-user document editing
   - Live comment threads
   - Presence indicators

3. **Regulatory Intelligence**
   - FDA guidance monitoring
   - Competitive intelligence feeds
   - Precedent search

4. **Analytics & Reporting**
   - Portfolio health dashboards
   - Team velocity metrics
   - Submission timeline forecasting

---

*Document Version: 2.0.0*
*Last Updated: 2025-01-24*
*Author: UI/UX Architecture Team*
