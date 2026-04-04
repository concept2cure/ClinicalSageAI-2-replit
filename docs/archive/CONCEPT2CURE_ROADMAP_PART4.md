# Concept2Cure: Unified Platform Roadmap

> **Addendum Notice (Normative)**  
> *This roadmap is complemented by the Last‑Mile Automation & Enterprise Readiness addendum (`docs/roadmap/addenda/CONCEPT2CURE_ROADMAP_ADDENDUM_LAST_MILE_AUTOMATION.md`). The addendum introduces critical features such as document branching ("Git for regulators"), change control board workflows, semantic search & institutional memory, training & competency management, AI governance & explainability, immutable provenance, regulatory horizon scanning & SOP auto‑drafting, regulator reply studio, cybersecurity/fraud guardrails & disaster recovery/business continuity, FOIA redaction, automated literature surveillance & signal detection, statistical analysis plan validation, and flexible packaging modes (ZIP → eCTD → RPS). These are considered normative and should override any conflicting guidance in this document.*


## Part 4: Implementation Phases & Task Breakdown

**Document Version:** 2.0.0  
**Consolidation Date:** January 26, 2026  
**Status:** Production Implementation-Ready

> **Part 4 of 5**: See previous parts for architecture, components, UI/UX, database schema

---

## Table of Contents — Part 4

11. [Implementation Phases](#11-implementation-phases)
12. [Detailed Task Breakdown](#12-detailed-task-breakdown)
13. [AI Provider Strategy](#13-ai-provider-strategy)

---

## 11. Implementation Phases

### 11.1 Phase Overview (12-Week Implementation)

| Phase | Duration | Focus Area | Deliverables | Dependencies |
|-------|----------|------------|--------------|--------------|
| **Phase 1** | Week 1 | Database Foundation | All schemas, migrations, seed data | None |
| **Phase 2** | Week 2 | Submission Pyramids | 510(k), IND, NDA/BLA WBS generators | Phase 1 |
| **Phase 3** | Weeks 3-4 | Predictive Intelligence | Risk detectors, prediction engine | Phases 1-2 |
| **Phase 4** | Week 5 | Document Drafting | eCTD Co-Author, templates, AI agents | Phases 1-3 |
| **Phase 5** | Week 6 | PM Settings & Config | Settings UI, org configuration | Phases 1-4 |
| **Phase 6** | Week 7 | User Context & Dashboard | Command center, briefings, portfolio view | Phases 1-5 |
| **Phase 7** | Week 8 | Communication Hub | Channels, FDA letter processing | Phases 1-6 |
| **Phase 8** | Week 9 | Lumen PM Service | Core PM AI, natural language interface | Phases 1-7 |
| **Phase 9** | Week 10 | Convergent Portal UI | UI components, polymorphic layouts | Phases 1-8 |
| **Phase 10** | Week 11 | Data Ingestion Workers | CSR intelligence, FDA rejection mining | Phases 1-9 |
| **Phase 11** | Week 12 | Integration & Testing | E2E workflows, performance optimization | All phases |
| **Phase 12** | Ongoing | Production Deployment | Monitoring, documentation, training | Phase 11 |

### 11.2 Phase 1: Database Foundation (Week 1)

**Objective:** Establish PostgreSQL schema with all tables, indexes, constraints, and seed data.

**Key Deliverables:**
- All core tables created (20+ tables)
- Row-level security policies implemented
- Audit trail triggers activated
- Default roles and permissions seeded
- Database migration scripts

**Success Criteria:**
- ✅ All tables created without errors
- ✅ Migrations can be rolled back cleanly
- ✅ RLS policies enforce tenant isolation
- ✅ Audit trail cannot be deleted or modified
- ✅ Sample data can be inserted for testing

### 11.3 Phase 2: Submission Pyramids (Week 2)

**Objective:** Build adaptive Work Breakdown Structure generators for all submission types.

**Submission Types to Implement:**
1. **510(k) Pyramid** (7 phases, ~40 tasks)
2. **IND Pyramid** (8 phases, ~50 tasks)
3. **NDA/BLA Pyramid** (eCTD modules, ~60 tasks)
4. **PMA Pyramid** (10 phases, ~80 tasks)
5. **MAA Pyramid** (EU-specific, eCTD adapted)
6. **De Novo Pyramid** (7 phases, ~40 tasks)

**Key Features:**
- Dependency management (task A must complete before task B)
- Critical path calculation
- Progress tracking with percent complete
- Automatic next-task suggestions based on dependencies

**Success Criteria:**
- ✅ All 5 pyramid types generate correctly
- ✅ Dependencies resolve in correct order
- ✅ Critical path accurately identified
- ✅ Progress calculation updates in real-time
- ✅ Next available tasks list is accurate

### 11.4 Phase 3: Predictive Intelligence (Weeks 3-4)

**Objective:** Implement risk detection engine with 50+ automated risk factors.

**Week 3 Tasks:**
- Define all 50+ risk factors with weights and severities
- Implement 510(k) risk detectors (IFU consistency, predicate monitor, etc.)
- Implement IND risk detectors (CMC analyzer, protocol design checker)
- Build prediction calculation engine

**Week 4 Tasks:**
- Implement proactive monitoring service (runs every 4 hours)
- Build outcome scenario generator
- Create mitigation recommendation engine
- Develop real-time alerting system

**Automated Detectors to Build:**

**510(k) Detectors:**
1. IFUConsistencyDetector
2. PredicateMonitor
3. DeviceDescriptionCompletenessDetector
4. BiocompatibilityDataChecker
5. SoftwareClassificationValidator

**IND Detectors:**
1. CMCAnalyzer
2. ProtocolDesignAnalyzer
3. ToxicologyPackageChecker
4. INDSponsorExperienceScorer
5. PreINDMeetingValidator

**Success Criteria:**
- ✅ All risk detectors return structured results
- ✅ Prediction accuracy >70% (validated against historical data)
- ✅ Predictions generate in <5 seconds
- ✅ Proactive monitoring runs automatically
- ✅ Alerts trigger for high-severity risks

### 11.5 Phase 4: Document Drafting (Week 5)

**Objective:** Build eCTD Co-Author with multi-agent AI council.

**Document Templates to Create:**

**510(k) Templates:**
- Cover Letter
- Indications for Use Statement
- Device Description
- Substantial Equivalence Comparison
- Performance Testing Summary

**IND Templates:**
- Introductory Statement
- General Investigational Plan
- Investigator's Brochure (sections)
- CMC Summary
- Pharmacology/Toxicology Summary

**NDA/BLA Templates:**
- Clinical Overview (M2.5)
- Clinical Summary (M2.7)
- Quality Overall Summary (M2.3)
- Nonclinical Overview (M2.4)

**Multi-Agent Council Implementation:**
```typescript
class MultiAgentCouncil {
  async draft(task: DraftingTask): Promise<CouncilOutput> {
    // 1. Drafter generates initial content
    const draft = await this.callAgent('drafter', task);
    
    // 2. Reviewer checks accuracy
    const reviewed = await this.callAgent('reviewer', {
      content: draft,
      checkpoints: ['accuracy', 'completeness', 'alignment']
    });
    
    // 3. Statistician validates data
    const validated = await this.callAgent('statistician', {
      content: reviewed,
      checkpoints: ['calculations', 'data_presentation', 'statistical_claims']
    });
    
    // 4. Critic ensures compliance
    const critiqued = await this.callAgent('critic', {
      content: validated,
      checkpoints: ['regulatory_gaps', 'compliance_issues', 'fda_concerns']
    });
    
    // 5. Synthesizer assembles final
    const final = await this.callAgent('synthesizer', {
      allOutputs: [draft, reviewed, validated, critiqued],
      task: 'resolve_conflicts_and_polish'
    });
    
    return final;
  }
}
```

**Success Criteria:**
- ✅ All templates generate valid documents
- ✅ Multi-agent council produces coherent output
- ✅ Compliance scores >0.85 on validation
- ✅ Generated documents require minimal human editing
- ✅ Generation time <30 seconds per document

### 11.6 Phase 5: PM Settings & Configuration (Week 6)

**Objective:** Build client-configurable PM settings interface.

**Settings Categories:**
1. **AI Behavior Settings**
   - Autonomy level (Passive/Active/Autonomous)
   - Drafting style (Concise/Standard/Comprehensive)
   - Risk threshold (0.0-1.0)
   - Compliance strictness

2. **Workflow Settings**
   - Auto-task creation toggle
   - Required approval document types
   - Parallel workflows enabled/disabled
   - Critical path highlighting

3. **Notification Settings**
   - Risk detection alerts frequency
   - Deadline reminders aggressiveness
   - FDA communication alerts
   - Collaborator mentions

4. **Therapeutic Area Settings**
   - Risk weight adjustments per therapeutic area
   - Required reviewers by area
   - Custom workflow steps

**Settings UI Components:**
```jsx
<PMSettingsPanel organizationId={orgId}>
  <SettingsSection title="AI Behavior">
    <Select 
      label="Autonomy Level"
      options={['PASSIVE', 'ACTIVE', 'AUTONOMOUS']}
      value={settings.aiSettings.autonomyLevel}
    />
    <Slider
      label="Risk Threshold"
      min={0}
      max={1}
      step={0.05}
      value={settings.aiSettings.riskThreshold}
    />
  </SettingsSection>
  
  <SettingsSection title="Notifications">
    <RadioGroup
      label="Risk Detection Alerts"
      options={['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_SUMMARY']}
    />
  </SettingsSection>
  
  <SettingsSection title="Therapeutic Areas">
    <TherapeuticAreaConfig areas={['oncology', 'cardiology', 'neurology']} />
  </SettingsSection>
  
  <SaveButton onClick={saveSettings}>Save Configuration</SaveButton>
</PMSettingsPanel>
```

**Success Criteria:**
- ✅ Settings persist correctly to database
- ✅ Changes take effect immediately
- ✅ Validation prevents invalid configurations
- ✅ Audit trail records all setting changes
- ✅ Organization-specific settings isolated correctly

### 11.7 Phase 6: User Context & Dashboard (Week 7)

**Objective:** Build portfolio dashboard with predictive analytics.

**Dashboard Components:**
1. **Portfolio Metrics**
   - Active submissions count
   - Submission success rate
   - Average clearance time
   - Open risk factors

2. **Submission Timeline**
   - Gantt chart visualization
   - Critical path highlighting
   - Milestone tracking

3. **Risk Heatmap**
   - Visual risk distribution across projects
   - Color-coded severity levels

4. **Upcoming Deadlines**
   - Chronological deadline list
   - On-track / At-risk indicators

**Project Context Management:**
```typescript
class UserContextManager {
  async getProjectBriefing(userId: string, projectId: string): Promise<Briefing> {
    const project = await this.db.getProject(projectId);
    const risks = await this.riskEngine.getActiveRisks(projectId);
    const progress = await this.pyramidEngine.calculateProgress(projectId);
    const nextTasks = await this.pyramidEngine.getNextAvailableTasks(projectId);
    
    return {
      project: {
        name: project.name,
        type: project.project_type,
        targetDate: project.target_submission_date,
        daysRemaining: this.calculateDaysRemaining(project.target_submission_date)
      },
      progress: {
        overallPercent: progress.overall,
        currentPhase: progress.currentPhase,
        completedTasks: progress.completed,
        totalTasks: progress.total
      },
      risks: {
        critical: risks.filter(r => r.severity > 0.7).length,
        medium: risks.filter(r => r.severity > 0.4 && r.severity <= 0.7).length,
        low: risks.filter(r => r.severity <= 0.4).length,
        topRisks: risks.sort((a, b) => b.severity - a.severity).slice(0, 3)
      },
      nextActions: nextTasks.slice(0, 5),
      recentActivity: await this.getRecentActivity(projectId)
    };
  }
}
```

**Success Criteria:**
- ✅ Dashboard loads in <2 seconds
- ✅ All metrics update in real-time
- ✅ Risk heatmap accurately reflects project state
- ✅ Timeline view handles 10+ concurrent projects
- ✅ Context switching between projects is instant

### 11.8 Phase 7: Communication Hub (Week 8)

**Objective:** Build internal communication channels and FDA letter processing.

**Communication Channels:**
1. **Team Channels** (internal discussions)
2. **FDA Channels** (correspondence with agency)
3. **Client Channels** (CRO ↔ Biotech communication)

**FDA Letter Processing:**
- Automatic parsing of FDA letters (RTA, Additional Info Request, Clearance)
- Entity extraction (deadline dates, deficiency items, reviewer comments)
- Auto-assignment to responsible team members
- Response tracking

**FDA Communication Processor:**
```typescript
class FDACommunicationProcessor {
  async processLetter(letterPDF: Buffer): Promise<ProcessedLetter> {
    // 1. Extract text from PDF
    const text = await this.pdfParser.extractText(letterPDF);
    
    // 2. Classify letter type
    const letterType = await this.classifyLetter(text);
    
    // 3. Extract key entities
    const entities = await this.extractEntities(text, letterType);
    
    // 4. Parse deficiencies (if RTA or Additional Info)
    const deficiencies = letterType === 'RTA' || letterType === 'ADDITIONAL_INFO'
      ? await this.parseDeficiencies(text)
      : [];
    
    // 5. Extract deadlines
    const deadlines = this.extractDeadlines(text);
    
    // 6. Assign to team members
    const assignments = await this.autoAssignResponses(deficiencies);
    
    return {
      letterType,
      receivedDate: entities.date,
      reviewer: entities.reviewer,
      deficiencies,
      deadlines,
      assignments,
      rawText: text
    };
  }
}
```

**Success Criteria:**
- ✅ FDA letters parse correctly (>90% accuracy)
- ✅ Deficiency items extracted accurately
- ✅ Deadlines automatically added to project timeline
- ✅ Team members receive auto-assignments
- ✅ Response tracking works end-to-end

### 11.9 Phase 8: Lumen PM Service (Week 9)

**Objective:** Integrate all components into unified Lumen PM AI service.

**Core PM Service:**
```typescript
class LumenPMService {
  /**
   * Get comprehensive project intelligence
   */
  async getProjectIntelligence(projectId: string): Promise<ProjectIntelligence> {
    // Gather all intelligence in parallel
    const [
      prediction,
      risks,
      progress,
      nextTasks,
      fdaCommunications,
      recentActivity
    ] = await Promise.all([
      this.predictionEngine.generatePrediction(projectId),
      this.riskEngine.getActiveRisks(projectId),
      this.pyramidEngine.calculateProgress(projectId),
      this.pyramidEngine.getNextAvailableTasks(projectId),
      this.commHub.getRecentFDACommunications(projectId),
      this.activityTracker.getRecent(projectId, 10)
    ]);
    
    return {
      prediction,
      risks,
      progress,
      whatShouldStartNext: this.identifyWhatShouldStart(nextTasks, risks),
      fdaStatus: this.summarizeFDAStatus(fdaCommunications),
      recentActivity
    };
  }
  
  /**
   * Identify what tasks should start next based on dependencies and risks
   */
  private identifyWhatShouldStart(
    availableTasks: Task[],
    activeRisks: Risk[]
  ): Task[] {
    // Prioritize tasks that mitigate critical risks
    const riskMitigationTasks = availableTasks.filter(task =>
      activeRisks.some(risk => 
        risk.details?.mitigationTasks?.includes(task.id)
      )
    );
    
    if (riskMitigationTasks.length > 0) {
      return riskMitigationTasks.sort((a, b) => 
        this.calculatePriority(b) - this.calculatePriority(a)
      );
    }
    
    // Otherwise, follow critical path
    return availableTasks
      .filter(task => task.onCriticalPath)
      .sort((a, b) => a.plannedStart - b.plannedStart);
  }
}
```

**Natural Language Interface:**
```typescript
class NaturalLanguageInterface {
  async handleQuery(query: string, context: ProjectContext): Promise<Response> {
    // 1. Classify query intent
    const intent = await this.intentEngine.classify(query);
    
    // 2. Route to appropriate handler
    switch (intent.category) {
      case 'PROJECT_STATUS':
        return this.handleStatusQuery(context.projectId);
      
      case 'RISK_ANALYSIS':
        return this.handleRiskQuery(context.projectId);
      
      case 'DRAFT_DOCUMENT':
        return this.handleDraftRequest(intent, context);
      
      case 'DEADLINE_QUERY':
        return this.handleDeadlineQuery(context.projectId);
      
      default:
        return this.handleGeneralQuery(query, context);
    }
  }
  
  private async handleStatusQuery(projectId: string): Promise<Response> {
    const intelligence = await this.lumenPM.getProjectIntelligence(projectId);
    
    return {
      type: 'STATUS_SUMMARY',
      content: this.generateStatusSummary(intelligence),
      suggestedActions: intelligence.whatShouldStartNext,
      layout: 'DASHBOARD'
    };
  }
}
```

**Success Criteria:**
- ✅ Project intelligence generates correctly
- ✅ Natural language queries route to correct handlers
- ✅ "What should start next?" identifies correct tasks
- ✅ Query classification >85% accuracy
- ✅ Response time <3 seconds

### 11.10 Phase 9: Convergent Portal UI (Week 10)

**Objective:** Build complete polymorphic UI with all components.

**UI Components to Build:**
1. **Navigation Components**
   - NavigationHeader
   - Sidebar
   - ContextBar
   - BreadcrumbNav

2. **Module Views**
   - CSRIntelligenceView
   - CTDDocumentsView
   - ProtocolDesignView
   - PredictionsView
   - AuditTimeline

3. **AI Integration**
   - AIAssistantPanel
   - LumenCortexInsights
   - RiskIndicator
   - ComplianceHeatmap

4. **Specialized Views**
   - ElectronicSignatureModal
   - TraceabilityMatrix
   - KnowledgeGraphViewer

**Component Library Structure:**
```
/client/src/components/
├── common/                 # Reusable UI primitives
│   ├── Button.jsx
│   ├── Card.jsx
│   ├── Modal.jsx
│   └── Tooltip.jsx
├── layout/                 # Layout components
│   ├── NavigationHeader.jsx
│   ├── Sidebar.jsx
│   ├── ContextBar.jsx
│   └── MainContent.jsx
├── dashboard/              # Dashboard components
│   ├── ProjectDashboard.jsx
│   ├── MetricsRow.jsx
│   └── SubmissionTimeline.jsx
├── ai/                     # AI-related components
│   ├── AIAssistantPanel.jsx
│   ├── LumenCortexInsights.jsx
│   └── ProactiveSuggestions.jsx
├── modules/                # Feature modules
│   ├── CSRIntelligenceView.jsx
│   ├── CTDDocumentsView.jsx
│   ├── PredictionsView.jsx
│   └── AuditTimeline.jsx
└── compliance/             # Compliance components
    ├── ElectronicSignatureModal.jsx
    ├── TraceabilityMatrix.jsx
    └── KnowledgeGraphViewer.jsx
```

**Success Criteria:**
- ✅ All components render without errors
- ✅ Polymorphic layouts morph correctly based on context
- ✅ Design system consistently applied across all components
- ✅ Accessibility standards met (WCAG 2.1 AA)
- ✅ Responsive design works on all screen sizes

### 11.11 Phase 10: Data Ingestion Workers (Week 11)

**Objective:** Activate automated data ingestion from external sources.

**Workers to Build:**

**1. CSR Intelligence Worker** (Daily)
```typescript
class CSRIntelligenceWorker {
  async run() {
    // Ingest from ClinicalTrials.gov
    const ctGovTrials = await this.fetchClinicalTrialsGov();
    
    // Ingest from Canadian database
    const canadianTrials = await this.fetchCanadianTrials();
    
    // Ingest from EU database
    const euTrials = await this.fetchEUTrials();
    
    // Process and store
    for (const trial of [...ctGovTrials, ...canadianTrials, ...euTrials]) {
      await this.processAndStore(trial);
    }
  }
  
  private async fetchClinicalTrialsGov(): Promise<Trial[]> {
    // Use ClinicalTrials.gov API
    const response = await fetch(
      'https://clinicaltrials.gov/api/query/study_fields?' +
      'expr=AREA[LastUpdatePostDate]RANGE[MIN,MAX]&' +
      'fields=NCTId,BriefTitle,Condition,Phase,StudyType&' +
      'min_rnk=1&max_rnk=1000&fmt=json'
    );
    return response.json();
  }
}
```

**2. FDA Rejection Pattern Worker** (Weekly)
```typescript
class FDARevejectionPatternWorker {
  async run() {
    // Search biotech 10-K filings for FDA communications
    const filings = await this.fetchRecentBiotech10Ks();
    
    for (const filing of filings) {
      const fdaMentions = await this.searchForFDAMentions(filing);
      
      for (const mention of fdaMentions) {
        const pattern = await this.extractRejectionPattern(mention);
        await this.storePattern(pattern);
      }
    }
  }
  
  private async fetchRecentBiotech10Ks(): Promise<SECFiling[]> {
    // Use SEC EDGAR API
    // Search for 10-K filings from biotechnology companies
  }
}
```

**3. Predicate Device Monitor** (Real-time alerts)
```typescript
class PredicateDeviceMonitor {
  async run() {
    // Get all active 510(k) projects with predicate devices
    const projects = await this.getActive510kProjects();
    
    for (const project of projects) {
      const predicates = project.metadata.predicateDevices || [];
      
      for (const predicate of predicates) {
        const recallStatus = await this.checkFDARecalls(predicate.kNumber);
        
        if (recallStatus.recalled && !predicate.recallAlertSent) {
          await this.sendCriticalAlert(project, predicate, recallStatus);
          await this.markAlertSent(predicate);
        }
      }
    }
  }
}
```

**Success Criteria:**
- ✅ CSR worker ingests 100+ trials daily
- ✅ FDA rejection worker finds 10+ patterns weekly
- ✅ Predicate monitor sends real-time alerts
- ✅ All workers log errors and retry on failure
- ✅ Ingested data enhances Lumen Cortex responses

### 11.12 Phase 11: Integration & Testing (Week 12)

**Objective:** End-to-end testing and performance optimization.

**E2E Test Scenarios:**
1. **510(k) Complete Workflow**
   - Create new 510(k) project
   - Generate submission pyramid
   - Run risk analysis
   - Draft cover letter using AI
   - Detect IFU inconsistency
   - Fix inconsistency
   - Submit for approval
   - E-sign document
   - Verify audit trail

2. **IND Complete Workflow**
   - Create new IND project
   - Generate IND pyramid
   - Run predictive analysis
   - Draft Investigator's Brochure
   - Detect CMC deficiency
   - Upload FDA response letter
   - Process letter automatically
   - Track response completion

3. **Multi-Project Portfolio**
   - View portfolio dashboard
   - Switch between 5 active projects
   - Verify risk aggregation
   - Check deadline tracking
   - Validate context switching

**Performance Optimization Targets:**
- Dashboard load: <2 seconds
- Prediction generation: <5 seconds
- Document drafting: <30 seconds
- AI query response: <3 seconds
- Cache hit rate: >50% (3-month target)

**Success Criteria:**
- ✅ All E2E scenarios pass
- ✅ Performance targets met
- ✅ Test coverage >80%
- ✅ Zero critical bugs
- ✅ Documentation complete

---

## 12. Detailed Task Breakdown

### 12.1 Phase 1 Tasks (Database Foundation)

```yaml
phase_1:
  name: "Database Foundation"
  duration: "Week 1"
  
  tasks:
    - id: "1.1"
      name: "Create organizational topology schema"
      files:
        - "database/schema/organizations.ts"
        - "database/schema/client-engagements.ts"
      test: "Schema compiles, migration generates"
      acceptance: "Can create organizations and link CRO to clients"
      
    - id: "1.2"
      name: "Create project and WBS schema"
      files:
        - "database/schema/projects.ts"
        - "database/schema/project-wbs.ts"
        - "database/schema/assignments.ts"
      test: "Can create project with nested WBS"
      acceptance: "Hierarchical WBS structure works correctly"
      
    - id: "1.3"
      name: "Create PM settings schema"
      files:
        - "database/schema/pm-settings.ts"
        - "database/seed/default-pm-settings.ts"
      test: "Settings load and update correctly"
      acceptance: "Organization-specific settings persist"
      
    - id: "1.4"
      name: "Create risk and predictions schema"
      files:
        - "database/schema/risk-factors.ts"
        - "database/schema/risk-detections.ts"
        - "database/schema/predictions.ts"
      test: "Can store risk detections and predictions"
      acceptance: "Risk data links to projects correctly"
      
    - id: "1.5"
      name: "Create communication schema"
      files:
        - "database/schema/channels.ts"
        - "database/schema/messages.ts"
        - "database/schema/fda-communications.ts"
      test: "Channels link to projects"
      acceptance: "Messages thread correctly within channels"
      
    - id: "1.6"
      name: "Create audit and compliance schema"
      files:
        - "database/schema/audit-log.ts"
        - "database/schema/electronic-signatures.ts"
      test: "Audit records cannot be deleted or modified"
      acceptance: "21 CFR Part 11 triggers work correctly"
      
    - id: "1.7"
      name: "Create documents schema"
      files:
        - "database/schema/documents.ts"
        - "database/schema/document-versions.ts"
      test: "Document versioning works correctly"
      acceptance: "Can retrieve any historical document version"
      
    - id: "1.8"
      name: "Implement row-level security"
      files:
        - "database/policies/rls-policies.sql"
      test: "Multi-tenant isolation enforced"
      acceptance: "Org A cannot see Org B's data"
      
    - id: "1.9"
      name: "Create knowledge base schema"
      files:
        - "database/schema/knowledge-entries.ts"
        - "database/schema/response-cache.ts"
      test: "Vector embeddings store correctly"
      acceptance: "Semantic search returns relevant results"
      
    - id: "1.10"
      name: "Run all migrations and seed data"
      test: "Migration completes without errors"
      acceptance: "Database ready for application connection"
```

### 12.2 Phase 2 Tasks (Submission Pyramids)

```yaml
phase_2:
  name: "Submission Pyramid Engine"
  duration: "Week 2"
  
  tasks:
    - id: "2.1"
      name: "Create 510(k) pyramid"
      file: "services/regulatory/pyramids/510k-pyramid.ts"
      test: "7 phases, ~40 tasks, dependencies resolve"
      acceptance: "Generates complete 510(k) WBS"
      
    - id: "2.2"
      name: "Create IND pyramid"
      file: "services/regulatory/pyramids/ind-pyramid.ts"
      test: "8 phases, ~50 tasks, post-submission workflow"
      acceptance: "Generates complete IND WBS"
      
    - id: "2.3"
      name: "Create NDA/BLA pyramids"
      files:
        - "services/regulatory/pyramids/nda-pyramid.ts"
        - "services/regulatory/pyramids/bla-pyramid.ts"
      test: "eCTD modules mapped correctly"
      acceptance: "Generates complete NDA/BLA WBS"
      
    - id: "2.4"
      name: "Create PMA pyramid"
      file: "services/regulatory/pyramids/pma-pyramid.ts"
      test: "10 phases, ~80 tasks"
      acceptance: "Generates complete PMA WBS"
      
    - id: "2.5"
      name: "Create MAA pyramid"
      file: "services/regulatory/pyramids/maa-pyramid.ts"
      test: "EU-specific eCTD structure"
      acceptance: "Generates complete MAA WBS"
      
    - id: "2.6"
      name: "Create De Novo pyramid"
      file: "services/regulatory/pyramids/de-novo-pyramid.ts"
      test: "7 phases, ~40 tasks"
      acceptance: "Generates complete De Novo WBS"
      
    - id: "2.7"
      name: "Create Pyramid Engine service"
      file: "services/regulatory/SubmissionPyramidEngine.ts"
      methods:
        - "getPyramidForProject()"
        - "calculateProgress()"
        - "getNextAvailableTasks()"
        - "getCriticalPath()"
      test: "Progress calculation accurate"
      acceptance: "Engine orchestrates all pyramid types"
```

### 12.3 Phase 3 Tasks (Predictive Intelligence)

```yaml
phase_3:
  name: "Predictive Intelligence Engine"
  duration: "Weeks 3-4"
  
  tasks:
    - id: "3.1"
      name: "Create risk factor definitions"
      files:
        - "services/ai/risk-factors/510k-risks.ts"
        - "services/ai/risk-factors/ind-risks.ts"
        - "services/ai/risk-factors/project-health-risks.ts"
      test: "All 50+ factors have detection methods"
      acceptance: "Risk taxonomy complete"
      
    - id: "3.2"
      name: "Create automated risk detectors"
      files:
        - "services/ai/detectors/IFUConsistencyDetector.ts"
        - "services/ai/detectors/PredicateMonitor.ts"
        - "services/ai/detectors/CMCAnalyzer.ts"
        - "services/ai/detectors/ProtocolDesignAnalyzer.ts"
        - "services/ai/detectors/DeviceDescriptionChecker.ts"
      test: "Detectors return structured results"
      acceptance: "All automated detectors functional"
      
    - id: "3.3"
      name: "Create prediction engine"
      file: "services/ai/PredictiveIntelligenceEngine.ts"
      methods:
        - "generatePrediction()"
        - "calculateSuccessProbability()"
        - "generateOutcomeScenarios()"
        - "generateMitigations()"
      test: "Predictions generate in <5 seconds"
      acceptance: "Prediction accuracy >70%"
      
    - id: "3.4"
      name: "Create proactive monitoring"
      file: "services/ai/ProactiveMonitoringService.ts"
      methods:
        - "runMonitoringCycle()"
        - "detectEmergingRisks()"
        - "triggerAlerts()"
      test: "Alerts generate for test scenarios"
      acceptance: "Monitoring runs every 4 hours"
      
    - id: "3.5"
      name: "Create outcome scenario generator"
      file: "services/ai/OutcomeScenarioGenerator.ts"
      test: "Generates realistic scenarios"
      acceptance: "Scenarios align with historical data"
```

---

## 13. AI Provider Strategy

### 13.1 Provider Hierarchy

**Primary Provider: KIMI AI (Moonshot AI)**
- Chinese LLM with strong performance
- Lower cost than Western models
- Good for high-volume queries
- Use for: General drafting, analysis, classification

**Backup Provider: OpenAI GPT-4**
- Fallback when KIMI unavailable
- Higher accuracy for complex reasoning
- Use for: Critical compliance checks, complex analysis

**Future Provider: Claude (Anthropic)**
- Long context window (200k tokens)
- Excellent reasoning capabilities
- Use for: Long document analysis, multi-step workflows

### 13.2 Provider Configuration

```typescript
interface AIProviderConfig {
  primary: {
    provider: 'KIMI';
    apiKey: string;
    model: 'moonshot-v1-32k';
    maxTokens: 4000;
    temperature: 0.3; // Lower for consistency
  };
  backup: {
    provider: 'OPENAI';
    apiKey: string;
    model: 'gpt-4-turbo-preview';
    maxTokens: 4000;
    temperature: 0.3;
  };
  future: {
    provider: 'CLAUDE';
    apiKey: string;
    model: 'claude-opus-4-5';
    maxTokens: 8000;
    temperature: 0.3;
  };
}

class AIProviderManager {
  async callWithFallback(request: AIRequest): Promise<AIResponse> {
    try {
      // Try primary (KIMI)
      return await this.callKIMI(request);
    } catch (error) {
      console.warn('KIMI failed, falling back to OpenAI', error);
      
      try {
        // Fallback to OpenAI
        return await this.callOpenAI(request);
      } catch (error2) {
        console.error('All providers failed', error2);
        throw new Error('AI service unavailable');
      }
    }
  }
}
```

### 13.3 Cache-First Strategy

**Implementation:**
```typescript
class LumenCortexCore {
  async query(query: string, context: Context): Promise<Response> {
    // 1. Check cache first
    const cacheKey = this.generateCacheKey(query, context);
    const cached = await this.cache.get(cacheKey);
    
    if (cached && cached.confidence > 0.8) {
      // High-confidence cache hit
      await this.cache.incrementHits(cacheKey);
      return cached.response;
    }
    
    // 2. No cache or low confidence - call external AI
    const response = await this.aiProvider.callWithFallback({
      query,
      context,
      temperature: 0.3
    });
    
    // 3. Store in cache for future use
    await this.cache.set(cacheKey, {
      response,
      confidence: this.calculateConfidence(response),
      timestamp: new Date()
    });
    
    // 4. Generate embeddings for semantic search
    await this.embeddings.store(query, response);
    
    return response;
  }
}
```

### 13.4 Cost Optimization

**Token Usage Tracking:**
```typescript
interface TokenUsageMetrics {
  provider: 'KIMI' | 'OPENAI' | 'CLAUDE';
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  cacheHit: boolean;
  responseTime: number;
}

class CostTracker {
  async recordUsage(metrics: TokenUsageMetrics) {
    await this.db.insert('ai_usage_metrics', {
      ...metrics,
      timestamp: new Date()
    });
    
    // Alert if costs exceed threshold
    const monthlyTotal = await this.getMonthlyTotal();
    if (monthlyTotal > this.COST_THRESHOLD) {
      await this.sendCostAlert(monthlyTotal);
    }
  }
  
  async getMonthlyTotal(): Promise<number> {
    const result = await this.db.query(`
      SELECT SUM(cost_usd) as total
      FROM ai_usage_metrics
      WHERE timestamp >= DATE_TRUNC('month', NOW())
    `);
    return result.rows[0].total;
  }
}
```

---

**Continue to Part 5** for: Testing & Validation, Deployment & Operations, Success Metrics, and Appendices.

---

*"From vision to validation—building the future of regulatory intelligence."*
