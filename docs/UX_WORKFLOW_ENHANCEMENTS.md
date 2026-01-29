# Concept2Cure UX Workflow Enhancements
## Industry-Native Design for Biotech, Pharma, CRO & Regulatory

**Date:** January 29, 2026 (Updated)  
**Team:** UI/UX User Interface Team  
**Author:** Master Level User Workflow Expert  
**Target Users:** Biotech, Pharma, MedTech, CRO - Regulatory Affairs, Medical Writing, Clinical Ops

---

## Core Design Philosophy

> **"Design the UI around how the industry works, not how software engineers think the industry should work."**

Each organization type has fundamentally different:
- **Mental models** - How they conceptualize their work
- **Hierarchies** - How they organize projects/products  
- **Metrics** - What KPIs matter most
- **Workflows** - Daily operational patterns
- **Vocabulary** - Domain-specific terminology

---

## Implementation Status - Phase 2 (Industry-Native Components)

| Component | Status | File Location |
|-----------|--------|---------------|
| **Biotech Program Dashboard** | ✅ Complete | `/client/src/concept2cure/components/biotech/BiotechProgramDashboard.tsx` |
| **Pharma Portfolio Dashboard** | ✅ Complete | `/client/src/concept2cure/components/pharma/PharmaPortfolioDashboard.tsx` |
| **CRO Client Portal** | ✅ Complete | `/client/src/concept2cure/components/cro/CROClientPortal.tsx` |
| **FDA Meeting Workspace** | ✅ Complete | `/client/src/concept2cure/components/regulatory/FDAMeetingWorkspace.tsx` |
| **Clinical Doc Authoring** | ✅ Complete | `/client/src/concept2cure/components/writing/ClinicalDocAuthoringWorkspace.tsx` |
| **Industry Mode Selector** | ✅ Complete | `/client/src/concept2cure/components/onboarding/IndustryModeSelector.tsx` |
| **Industry-Aware App Shell** | ✅ Complete | `/client/src/concept2cure/IndustryAwareApp.tsx` |
| **Industry Component Index** | ✅ Complete | `/client/src/concept2cure/components/industry/index.ts` |

## Implementation Status - Phase 1 (Foundation)

| Component | Status | File Location |
|-----------|--------|---------------|
| Session Restore Hook | ✅ Complete | `/client/src/concept2cure/hooks/useSessionRestore.ts` |
| Welcome Back Screen | ✅ Complete | `/client/src/concept2cure/components/common/WelcomeBackScreen.tsx` |
| Lumen Project Assistant | ✅ Complete | `/client/src/concept2cure/components/assistant/LumenProjectAssistant.tsx` |
| Artifact Viewer | ✅ Complete | `/client/src/concept2cure/components/artifacts/ArtifactViewer.tsx` |
| ZenApp with Session | ✅ Complete | `/client/src/concept2cure/ZenAppWithSession.tsx` |
| Integration into ZenApp | 🔄 Pending | Requires ZenApp props extension |

---

## Industry Archetypes & Dashboards

### 🧬 BIOTECH (Small/Mid-Cap)
**Mental Model:** "Where is my lead asset in the development pathway?"

- 1-3 products in development (often just one)
- Racing to milestones (funding tied to clinical milestones)
- Heavy outsourcing (CROs, CMOs)
- Board/investor visibility critical

**Component:** `BiotechProgramDashboard`
- 20 development stages (discovery → approval)
- Funding milestone tracking
- Vendor deliverable oversight
- FDA interaction timeline

### 💊 PHARMA (Large Enterprise)
**Mental Model:** "What's the health of our portfolio across therapeutic areas?"

- Dozens of products across lifecycle stages
- Global registrations in 50+ countries
- Heavy commitment burden (PMCs, PMRs, REMS)
- PDUFA dates are board-level items

**Component:** `PharmaPortfolioDashboard`
- Therapeutic area roll-ups
- Global registration matrix
- PDUFA calendar
- Commitment tracker

### 🏢 CRO (Contract Research Organization)
**Mental Model:** "What do we owe clients and when?"

- Client and contract driven
- SOW is the unit of work
- Utilization rates = profitability
- Change orders are constant

**Component:** `CROClientPortal`
- Client → Program → SOW → Deliverable hierarchy
- Deliverable pipeline
- Resource utilization
- Change order workflow

### 🏛️ REGULATORY (FDA Focus)
**Mental Model:** "Prepare for and execute successful FDA meetings"

- FDA meetings are pivotal milestones
- Type A/B/C meetings have different timelines
- Minutes are binding - track commitments

**Component:** `FDAMeetingWorkspace`
- Meeting status timeline
- Question management
- FDA commitment tracking
- Briefing document workflow

### ✍️ MEDICAL WRITING
**Mental Model:** "Build structure, fill content, iterate through reviews"

- ICH/CDISC templates
- Multiple review rounds
- Source document linking
- Version control (21 CFR Part 11)

**Component:** `ClinicalDocAuthoringWorkspace`
- Section tree navigation
- Comment management
- Source linking
- Progress tracking

---

## Executive Summary (Original Analysis)

After comprehensive analysis of the user journey from sign-on to log-out, this document outlines workflow-centric enhancements inspired by Claude.ai's Projects & Documents paradigm. Our goal is to create the most intuitive regulatory intelligence platform that Lumen Cortex can guide users through seamlessly.

---

## 1. Current State Analysis

### 1.1 Authentication Flow
**Current:** Multi-step login → SSO options → MFA → Tenant selection → Portal redirect

**Issues Identified:**
- ❌ No remembered workspace context on re-login
- ❌ Cold start - user sees empty state, must navigate
- ❌ No "continue where you left off" functionality
- ❌ Session restoration is clunky

### 1.2 Navigation Architecture  
**Current:** Complex sidebar with 30+ module links

**Issues Identified:**
- ❌ Cognitive overload - too many choices upfront
- ❌ Flat navigation - no project context
- ❌ Lumen Cortex floats independently, not integrated
- ❌ No unified workspace concept

### 1.3 Document Workflows
**Current:** Separate modules for each document type (CER, IND, CMC, eCTD)

**Issues Identified:**
- ❌ Context switching between modules loses work state
- ❌ No persistent project memory
- ❌ Files/artifacts scattered across modules
- ❌ Team collaboration is bolted-on, not native

---

## 2. Claude.ai-Inspired Enhancements

### 2.1 PROJECT-CENTRIC WORKSPACE (Priority: Critical)

**Concept:** Every user action happens within a Project context.

```
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT: XYZ-789 510(k) Submission                             │
├─────────────────┬───────────────────────────────────────────────┤
│ Conversations   │   Main Workspace                               │
│                 │                                                │
│ ▸ Initial Strat │   [Chat Interface]          [Artifacts Panel]  │
│   Meeting Notes │                             │                  │
│ ▸ CER Draft     │   You: Generate a clinical │ ┌──────────────┐ │
│   Review        │   evaluation report for    │ │ CER_Draft.md │ │
│ ▸ 510(k) Pre-   │   our Class II device      │ │ v1.2         │ │
│   Sub Questions │                             │ │ [Edit] [Pub] │ │
│                 │   Lumen: I'll create that  │ └──────────────┘ │
│ [+ New Chat]    │   for you. Based on your   │                  │
│                 │   device profile...        │ ┌──────────────┐ │
│ Documents       │                             │ │ Pred_Comp.xl │ │
│ ▸ CER_Draft.md  │   [Generated CER appears   │ │ Analysis     │ │
│ ▸ Pred_Comp.xlsx│    in Artifacts Panel →]   │ └──────────────┘ │
│ ▸ FDA_Letter.pdf│                             │                  │
│                 │                             │                  │
└─────────────────┴───────────────────────────────────────────────┘
```

**Implementation:**
1. Create `ZenProject` context that persists across sessions
2. All Lumen conversations scoped to project
3. Documents/artifacts auto-attach to project
4. Team members share project context

### 2.2 UNIFIED ONBOARDING FLOW (Priority: High)

**Post-Login Experience:**

```
Welcome back, Dr. Sarah Chen!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Continue where you left off:
   ┌────────────────────────────────────────┐
   │ XYZ-789 510(k) Submission              │
   │ Last: "CER statistical analysis..."    │
   │ 2 hours ago • 3 team members online    │
   │ [Continue] [View Project]              │
   └────────────────────────────────────────┘

🚀 Quick Actions:
   [Start New 510(k)] [Start New IND] [Start New CER]

📊 Your Dashboard:
   • 3 documents awaiting review
   • 2 tasks due this week
   • 1 submission milestone tomorrow
```

### 2.3 LUMEN CORTEX INTEGRATION (Priority: Critical)

**Transform Lumen from floating button to project copilot:**

```typescript
// Current: Disconnected chat widget
<LumenAssistantButton onClick={openChat} />

// Enhanced: Context-aware project assistant
<LumenCortex
  projectContext={{
    projectId: activeProject.id,
    submissionType: '510K',
    currentDocument: activeDocument,
    teamMembers: project.team,
    conversationHistory: project.threads,
  }}
  capabilities={{
    documentGeneration: true,
    complianceCheck: true,
    workflowGuidance: true,
    taskCreation: true,
    navigationAssist: true,
  }}
  onArtifactCreate={handleNewArtifact}
  onNavigationRequest={handleNavigation}
/>
```

**Lumen Capabilities:**
1. **Navigation Assistant:** "Take me to my CER draft" → Routes to correct screen
2. **Task Creator:** "Create task to review CMC section" → Creates task, assigns
3. **Document Generator:** "Draft the predicate comparison table" → Creates artifact
4. **Compliance Checker:** "Check this section for EU MDR compliance" → Inline feedback
5. **Workflow Guide:** "What's my next step for 510(k)?" → Shows workflow + next actions

### 2.4 ARTIFACT SYSTEM (Priority: High)

**Claude.ai-style artifacts for regulatory documents:**

```typescript
interface RegulatoryArtifact {
  id: string;
  type: 'document' | 'table' | 'diagram' | 'checklist' | 'form';
  title: string;
  content: string;
  format: 'markdown' | 'xlsx' | 'pdf' | 'docx';
  
  // Regulatory metadata
  regulatoryContext: {
    submissionType: '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA';
    ectdModule?: string;  // e.g., "2.7.4"
    complianceStatus: 'draft' | 'review' | 'approved';
    cfr21Part11Signature?: string;
  };
  
  // Collaboration
  version: number;
  createdBy: string;
  lastModifiedBy: string;
  sharedWith: string[];
  
  // Actions
  actions: ['edit', 'publish', 'export', 'share', 'version', 'sign'];
}
```

**Artifact Panel Features:**
- Live preview with syntax highlighting
- One-click export to eCTD structure
- Version history with diff view
- E-signature integration (21 CFR Part 11)
- Share with team members
- Publish to Document Vault

### 2.5 WORKFLOW TIMELINE (Priority: High)

**Visual submission progress within project:**

```
510(k) Submission Timeline for XYZ-789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✓] Project Setup          ─────────── 100%
[✓] Device Description     ─────────── 100%  
[●] Predicate Comparison   ────────●── 75%   ← You are here
[ ] Clinical Evaluation    ──────────   0%
[ ] Performance Testing    ──────────   0%
[ ] Biocompatibility       ──────────   0%
[ ] Labeling              ──────────   0%
[ ] Pre-Sub Meeting       ──────────   0%
[ ] Final Submission      ──────────   0%

Next Action: Complete predicate device comparison
Estimated Days to Submission: 47
```

---

## 3. Detailed User Journey Enhancements

### 3.1 SIGN-ON EXPERIENCE

**Before:**
```
Login → Select Org → See empty dashboard → Find module → Start working
```

**After:**
```
Login → Instant workspace restoration → Continue conversation/document → Optional: Start new project
```

**Implementation:**
```typescript
// src/concept2cure/hooks/useSessionRestore.ts
export function useSessionRestore() {
  const { user } = useAuth();
  
  useEffect(() => {
    if (user) {
      // Restore last workspace state
      const lastSession = localStorage.getItem(`session_${user.id}`);
      if (lastSession) {
        const { projectId, conversationId, documentId, scrollPosition } = JSON.parse(lastSession);
        
        // Navigate to last location
        navigateToWorkspace(projectId, conversationId, documentId);
        
        // Restore scroll position
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPosition);
        });
      }
    }
  }, [user]);
}
```

### 3.2 PROJECT CREATION WORKFLOW

**Quick Start Modal:**
```
┌─────────────────────────────────────────────────────────┐
│ Start a New Project                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ What are you working on?                               │
│                                                         │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│ │   510(k)    │ │    IND      │ │    NDA      │       │
│ │   Medical   │ │   Drug      │ │   New Drug  │       │
│ │   Device    │ │   Trial     │ │   Approval  │       │
│ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│ │    PMA      │ │    CER      │ │   Custom    │       │
│ │   Pre-Mkt   │ │   Clinical  │ │   Project   │       │
│ │   Approval  │ │   Eval      │ │             │       │
│ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│ Or describe your project to Lumen:                     │
│ ┌─────────────────────────────────────────────────┐   │
│ │ I need to prepare a 510(k) for a Class II...    │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.3 DOCUMENT GENERATION FLOW

**User says:** "Generate a CER for my cardiac monitor device"

**Lumen responds:**
```markdown
I'll create a Clinical Evaluation Report for your cardiac monitoring device.

Before I generate the full document, I need a few details:

**Device Information:**
1. Device classification (Class IIa/IIb/III)?
2. Predicate devices (if any)?
3. Primary intended use?

Or I can start with your existing device profile from Project XYZ-789.
[Use Device Profile] [Enter Manually]
```

**After user provides info, Lumen generates:**
```markdown
Creating your CER document...

[██████████░░░░░░░░░░] 47%
• Analyzing similar device CERs in database...
• Generating clinical background section...
• Preparing risk analysis framework...

**Artifact Created: CER_XYZ789_v1.md**
[View Document] [Edit] [Add to eCTD]
```

### 3.4 TEAM COLLABORATION

**Claude-style project sharing:**
```
┌─────────────────────────────────────────────────────────┐
│ Project Team: XYZ-789 510(k)                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 👤 Dr. Sarah Chen (Owner)                               │
│    Medical Affairs Lead                                 │
│    Last active: Now                                     │
│                                                         │
│ 👤 James Wilson                                         │
│    Regulatory Specialist                                │
│    Last active: 2 hours ago                            │
│    Working on: Predicate Comparison                     │
│                                                         │
│ 👤 Emily Rodriguez                                      │
│    Quality Assurance                                    │
│    Last active: Yesterday                               │
│                                                         │
│ [Invite Team Member] [Manage Permissions]               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Technical Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Implement `ZenProject` context provider
- [ ] Add session restoration hooks
- [ ] Create unified artifact system
- [ ] Update ZenSidebar for project-centric navigation

### Phase 2: Lumen Enhancement (Weeks 3-4)
- [ ] Integrate Lumen with project context
- [ ] Add navigation command handling
- [ ] Implement document generation pipeline
- [ ] Add workflow guidance responses

### Phase 3: Collaboration (Weeks 5-6)
- [ ] Team member invitations
- [ ] Real-time presence indicators
- [ ] Shared artifact editing
- [ ] Activity feed per project

### Phase 4: Onboarding (Weeks 7-8)
- [ ] Welcome back screen implementation
- [ ] Quick start project wizard
- [ ] Guided first-project experience
- [ ] Contextual help tooltips

---

## 5. Key UI Components to Build

### 5.1 ZenWorkspaceProvider
```typescript
// Provides project + session context throughout app
<ZenWorkspaceProvider>
  <ZenSidebar />
  <ZenChat />
  <ZenArtifactPanel />
</ZenWorkspaceProvider>
```

### 5.2 WelcomeBackScreen
```typescript
// Post-login experience with session restoration
<WelcomeBackScreen
  lastProject={lastActiveProject}
  quickActions={projectTypes}
  notifications={pendingItems}
  onContinue={handleRestore}
  onNewProject={handleNew}
/>
```

### 5.3 LumenProjectAssistant
```typescript
// Enhanced Lumen with project awareness
<LumenProjectAssistant
  project={activeProject}
  onNavigate={routeToScreen}
  onGenerate={createArtifact}
  onTaskCreate={addProjectTask}
/>
```

### 5.4 ArtifactViewer
```typescript
// Claude-style artifact panel
<ArtifactViewer
  artifact={activeArtifact}
  onEdit={openEditor}
  onPublish={publishToVault}
  onExport={exportToFormat}
  onSign={initiateESignature}
/>
```

---

## 6. Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Time to first action (post-login) | 45 sec | < 5 sec | 4 weeks |
| Screens to start document | 4 clicks | 1 click | 4 weeks |
| Context switches per session | 8 avg | 2 avg | 8 weeks |
| User-reported "lost work" incidents | 12/month | 0/month | 6 weeks |
| Team collaboration adoption | 23% | 80% | 12 weeks |
| Lumen usage for navigation | 5% | 60% | 8 weeks |

---

## 7. Conclusion

By adopting Claude.ai's project-centric paradigm and deeply integrating Lumen Cortex as the intelligent guide, Concept2Cure can transform from a collection of regulatory tools into a unified workspace that feels like having an expert regulatory consultant always by your side.

**The vision:** Users should be able to say "Lumen, I need to submit a 510(k) for my new cardiac monitor" and have Lumen create the project, scaffold the documents, guide them through the workflow, and help them complete the submission - all within a single, persistent workspace.

---

*Document Version: 1.0*  
*Last Updated: January 29, 2026*  
*Next Review: February 12, 2026*
