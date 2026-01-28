# Concept2Cure: Unified Platform Roadmap

## Part 3: Convergent Portal UI/UX, Database Schema & Compliance

**Document Version:** 2.0.0  
**Consolidation Date:** January 26, 2026  
**Status:** Production Implementation-Ready

> **Part 3 of 5**: See Part 1 for Executive Summary, Part 2 for Core Components & Lumen Cortex AI

---

## Table of Contents — Part 3

8. [Convergent Portal UI/UX Design](#8-convergent-portal-uiux-design)
9. [Database Schema & Infrastructure](#9-database-schema--infrastructure)
10. [Compliance & Security Framework](#10-compliance--security-framework)

---

## 8. Convergent Portal UI/UX Design

### 8.1 Design Philosophy — The "4 A's" Framework

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Ambient Awareness** | System maintains "peripheral vision" of entire portfolio | Context bar showing active submissions, deadlines, compliance scores without requiring navigation |
| **Adaptive Morphology** | Interface adapts based on regulatory phase and context | Chat → Editor → Analytics transitions are fluid, not hard switches. UI morphs for FDA vs EMA vs PMDA. |
| **Audit-First Architecture** | Every interaction is logged (21 CFR Part 11) | Built-in time-travel, electronic signatures, complete change attribution |
| **Augmented Intelligence** | Elevate RA professionals from "document clerk" to "regulatory strategist" | AI handles mechanical work; humans make strategic decisions |

### 8.2 Visual Identity — "Warm Luxe" Design Language

**Brand DNA:**
- Warm amber/orange gradients (primary brand)
- Violet AI accents (distinguishes AI features)
- Light, warm neutrals (NO dark mode backgrounds)
- DNA helix motif (subtle in backgrounds and animations)
- Professional yet approachable

**Color Palette:**

```css
:root {
  /* PRIMARY BRAND — Amber/Orange Gradient */
  --brand-gold: #D4A853;
  --brand-gold-light: #F5C563;
  --brand-gold-dark: #B8860B;
  --brand-orange: #E67E22;
  --brand-orange-light: #F39C12;
  --brand-orange-dark: #D35400;
  
  /* AI ACCENT — Violet (distinguishes AI features) */
  --ai-violet: #8B5CF6;
  --ai-purple: #7C3AED;
  --ai-indigo: #6366F1;
  
  /* WARM NEUTRALS — NO BLACK/DARK BACKGROUNDS */
  --surface-primary: #FAFAF9;   /* stone-50 */
  --surface-elevated: #FFFFFF;
  --surface-warm: #FEF7ED;      /* warm cream */
  --text-primary: #1C1917;      /* stone-900 */
  --text-secondary: #78716C;    /* stone-500 */
  --border-subtle: rgba(214, 211, 209, 0.6);
  
  /* STATUS COLORS */
  --status-active: #0EA5E9;     /* sky-500 */
  --status-warning: #F59E0B;    /* amber-500 */
  --status-success: #10B981;    /* emerald-500 */
  --status-critical: #F43F5E;   /* rose-500 */
  
  /* COMPLIANCE RISK LEVELS */
  --risk-low: #10B981;          /* emerald-500 */
  --risk-medium: #F59E0B;       /* amber-500 */
  --risk-high: #F43F5E;         /* rose-500 */
}
```

**Typography Stack:**

```css
/* Primary UI font — Modern, Professional */
font-family: 'Outfit', system-ui, -apple-system, sans-serif;
font-weight: 300 | 400 | 500 | 600 | 700;

/* Code/Data font — Monospace for technical content */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

> **CRITICAL DESIGN RULE**:  
> ❌ **NEVER** use black or near-black UI backgrounds (no slate-950, slate-900, gray-900, zinc-900, neutral-900, black)  
> ✅ **ALWAYS** use light themes or rich colored backgrounds instead

### 8.3 Portal Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NAVIGATION HEADER (60px)                          │
│  [Logo] [Global Search] [Context: Project X] [Notifications] [User] │
├───────────────┬─────────────────────────────────────────────────────┤
│               │                                                      │
│   SIDEBAR     │              MAIN CONTENT AREA                       │
│   (240px)     │                                                      │
│               │                                                      │
│ ┌───────────┐ │  ┌─────────────────────────────────────────────┐    │
│ │ Dashboard │ │  │                                             │    │
│ ├───────────┤ │  │      DYNAMIC VIEW BASED ON SELECTION        │    │
│ │ Projects  │ │  │                                             │    │
│ │  └─510k-1 │ │  │   • Dashboard (Portfolio Overview)          │    │
│ │  └─IND-2  │ │  │   • CSR Intelligence (Analytics)            │    │
│ ├───────────┤ │  │   • CTD Documents (Editor)                  │    │
│ │ Lumen     │ │  │   • Protocol Design (Workflow)              │    │
│ │ Cortex    │ │  │   • Predictions (Risk Dashboard)            │    │
│ │  ├── CSR  │ │  │   • Audit Timeline (Compliance)             │    │
│ │  ├── CTD  │ │  │                                             │    │
│ │  └── ICH  │ │  └─────────────────────────────────────────────┘    │
│ ├───────────┤ │                                                      │
│ │ Studies   │ │  ┌─────────────────────────────────────────────┐    │
│ │  └─Study1 │ │  │       AI ASSISTANT PANEL (Expandable)       │    │
│ ├───────────┤ │  │  [Lumen Cortex] "How can I help?"           │    │
│ │ Documents │ │  │  • Context-aware suggestions                │    │
│ ├───────────┤ │  │  • Document drafting assistance             │    │
│ │ Timeline  │ │  │  • Risk alerts and recommendations          │    │
│ ├───────────┤ │  └─────────────────────────────────────────────┘    │
│ │ Settings  │ │                                                      │
│ └───────────┘ │                                                      │
└───────────────┴─────────────────────────────────────────────────────┘
```

### 8.4 Polymorphic Layout Modes

The portal shell morphs based on user context and task:

| Mode | Trigger | Layout Transformation |
|------|---------|----------------------|
| **Dashboard** | Default/Home | Full-width cards, portfolio metrics, project timeline |
| **Editor** | Document drafting | Split view: Document editor (left) + AI assistant (right) |
| **Analytics** | CSR/Risk analysis | Full-width visualization panels, data tables, charts |
| **Comparison** | 510(k) predicate | Side-by-side document viewer with diff highlighting |
| **Timeline** | Project management | Gantt chart view with critical path highlighting |
| **Audit** | Compliance review | Time-travel interface showing all changes chronologically |
| **CTD Navigator** | eCTD assembly | Hierarchical tree view (left) + module content (right) |

**Layout Morphing Example:**

```typescript
interface LayoutConfig {
  mode: LayoutMode;
  components: {
    sidebar: boolean;
    aiPanel: 'collapsed' | 'expanded' | 'hidden';
    mainArea: 'full' | 'split' | 'triple';
    contextBar: boolean;
  };
  shortcuts: KeyboardShortcut[];
}

const editorLayout: LayoutConfig = {
  mode: 'EDITOR',
  components: {
    sidebar: true,
    aiPanel: 'expanded',  // AI visible by default in editor mode
    mainArea: 'split',    // Document (70%) | AI (30%)
    contextBar: true
  },
  shortcuts: [
    { key: 'Ctrl+K', action: 'focusAI' },
    { key: 'Ctrl+S', action: 'saveDocument' },
    { key: 'Ctrl+Shift+P', action: 'showPredictions' }
  ]
};
```

### 8.5 Key UI Components

#### Ambient Context Bar

Persistent awareness strip showing critical information without navigation:

```jsx
<ContextBar>
  <ActiveProject>
    510(k) - Glucose Meter XYZ
  </ActiveProject>
  <SubmissionDeadline countdown="47 days">
    Target: March 15, 2026
  </SubmissionDeadline>
  <ComplianceScore value={0.87} trend="improving">
    87% Complete
  </ComplianceScore>
  <RiskIndicator level="medium" count={3}>
    3 Risks Detected
  </RiskIndicator>
  <RecentActivity>
    FDA Response received 2h ago
  </RecentActivity>
</ContextBar>
```

#### AI Assistant Panel

Context-intelligent chat interface with proactive suggestions:

```jsx
<AIAssistantPanel expanded={true}>
  <Header>
    <LumenCortexIcon />
    <Title>Lumen Cortex</Title>
    <ContextChip>510(k) Context Active</ContextChip>
  </Header>
  
  <ProactiveSuggestions>
    <Suggestion priority="high">
      <Icon type="alert" />
      IFU inconsistency detected in 3 locations. Fix now?
    </Suggestion>
    <Suggestion priority="medium">
      <Icon type="document" />
      Draft cover letter ready for review
    </Suggestion>
    <Suggestion priority="low">
      <Icon type="lightbulb" />
      Similar 510(k)s took average 87 days for clearance
    </Suggestion>
  </ProactiveSuggestions>
  
  <ChatInterface>
    <MessageHistory />
    <InputBox 
      placeholder="Ask about your submission, draft documents, analyze risks..."
      shortcuts={['Ctrl+K to focus', 'Tab for autocomplete']}
    />
  </ChatInterface>
  
  <QuickActions>
    <ActionButton>Draft Document</ActionButton>
    <ActionButton>Analyze Risks</ActionButton>
    <ActionButton>Check Compliance</ActionButton>
  </QuickActions>
</AIAssistantPanel>
```

#### Project Dashboard

Portfolio overview with predictive analytics:

```jsx
<ProjectDashboard>
  <MetricsRow>
    <MetricCard 
      title="Active Submissions"
      value={5}
      trend="+2 this month"
      color="violet"
    />
    <MetricCard 
      title="Submission Success Rate"
      value="78%"
      trend="+23% vs industry avg"
      color="emerald"
    />
    <MetricCard 
      title="Avg. Clearance Time"
      value="92 days"
      trend="-18 days vs last year"
      color="amber"
    />
    <MetricCard 
      title="Open Risk Factors"
      value={12}
      trend="3 critical, 9 medium"
      color="rose"
    />
  </MetricsRow>
  
  <SubmissionTimeline>
    {/* Gantt chart showing all active submissions with critical path */}
  </SubmissionTimeline>
  
  <RiskHeatmap>
    {/* Visual representation of risks across all projects */}
  </RiskHeatmap>
  
  <UpcomingDeadlines>
    <Deadline project="510k-1" date="2026-03-15" status="on-track" />
    <Deadline project="IND-2" date="2026-04-01" status="at-risk" />
  </UpcomingDeadlines>
</ProjectDashboard>
```

#### Predictive Risk Dashboard

Real-time risk monitoring with mitigation recommendations:

```jsx
<PredictiveRiskDashboard projectId="510k-1">
  <SuccessPrediction>
    <Gauge value={0.73} label="73% Success Probability" />
    <Confidence level={0.88}>High Confidence</Confidence>
    <Trend>+12% since last analysis</Trend>
  </SuccessPrediction>
  
  <DetectedRisks>
    <RiskCard 
      id="K002"
      title="IFU Inconsistency"
      severity="CRITICAL"
      impact={0.31}
      status="OPEN"
    >
      <Description>
        IFU text differs between FDA Form 3881 and Device Description
      </Description>
      <Mitigation priority="immediate">
        Use single-source IFU management. Estimated fix time: 2 hours.
      </Mitigation>
      <ActionButton>Fix Now</ActionButton>
    </RiskCard>
    
    <RiskCard 
      id="K015"
      title="Missing Biocompatibility Data"
      severity="HIGH"
      impact={0.24}
      status="IN_PROGRESS"
    >
      <Description>
        ISO 10993 testing not complete for skin contact classification
      </Description>
      <Mitigation>
        Testing scheduled for next week. No action needed.
      </Mitigation>
    </RiskCard>
  </DetectedRisks>
  
  <OutcomeScenarios>
    <Scenario probability={0.73} outcome="First Submission Success">
      Address IFU inconsistency + complete biocompatibility testing
    </Scenario>
    <Scenario probability={0.22} outcome="RTA (Refuse to Accept)">
      If IFU inconsistency not resolved
    </Scenario>
    <Scenario probability={0.05} outcome="Additional Info Request">
      Minor questions on performance testing
    </Scenario>
  </OutcomeScenarios>
</PredictiveRiskDashboard>
```

#### Traceability Matrix & Knowledge Graph Visualization

Interactive visualization of requirement-evidence relationships:

```jsx
<TraceabilityMatrix projectId="nda-1">
  <ViewToggle>
    <ToggleButton active mode="MATRIX">Matrix View</ToggleButton>
    <ToggleButton mode="GRAPH">Graph View</ToggleButton>
  </ViewToggle>
  
  {/* Matrix View: Tabular representation */}
  <MatrixView>
    <Row requirement="Efficacy Claim A">
      <Cell evidence="Study XYZ-001" status="supported" />
      <Cell evidence="Study ABC-002" status="supported" />
      <Cell evidence="Meta-Analysis" status="supporting" />
    </Row>
    <Row requirement="Safety Claim B">
      <Cell evidence="Tox Study 123" status="supported" />
      <Cell evidence="Clinical Data" status="warning" note="Contradictory finding in subset" />
    </Row>
  </MatrixView>
  
  {/* Graph View: Visual network */}
  <GraphView>
    <Node id="claim-efficacy-a" type="CLAIM" />
    <Node id="study-xyz-001" type="DATA" />
    <Node id="study-abc-002" type="DATA" />
    <Edge from="study-xyz-001" to="claim-efficacy-a" relationship="SUPPORTS" />
    <Edge from="study-abc-002" to="claim-efficacy-a" relationship="SUPPORTS" />
    
    {/* Interactive: Click node to expand connections, filter by type, search */}
  </GraphView>
  
  <ConsistencyAlerts>
    <Alert severity="warning">
      Claim B supported by outdated data. Study updated last week.
      <Action>Review Claim B</Action>
    </Alert>
  </ConsistencyAlerts>
</TraceabilityMatrix>
```

### 8.6 Electronic Signature Workflow

21 CFR Part 11 compliant e-signature implementation:

```jsx
<ElectronicSignatureModal document={documentId}>
  <SignatureMeaning>
    <Label>What does your signature mean?</Label>
    <RadioGroup>
      <Option value="AUTHOR">I am the author of this document</Option>
      <Option value="REVIEWER">I have reviewed and approve this document</Option>
      <Option value="APPROVER">I approve this document for submission</Option>
    </RadioGroup>
  </SignatureMeaning>
  
  <DocumentPreview>
    <ImmutableSnapshot hash={documentHash}>
      {/* Read-only view of document being signed */}
    </ImmutableSnapshot>
  </DocumentPreview>
  
  <AuthenticationStep>
    <UsernameDisplay>{currentUser.email}</UsernameDisplay>
    <PasswordInput 
      placeholder="Re-enter your password to confirm"
      required
      autocomplete="off"
    />
    <TwoFactorInput 
      placeholder="Enter 2FA code"
      required
    />
  </AuthenticationStep>
  
  <ComplianceNotice>
    By signing, you confirm:
    • You are {currentUser.name}
    • This signature is legally binding
    • You understand the meaning of your signature
    • The document content is as shown above (SHA-256: {documentHash})
  </ComplianceNotice>
  
  <ActionButtons>
    <CancelButton>Cancel</CancelButton>
    <SignButton onClick={executeSignature}>
      Sign Document
    </SignButton>
  </ActionButtons>
</ElectronicSignatureModal>
```

**Signature Storage:**

```typescript
interface ElectronicSignature {
  id: string;
  documentId: string;
  userId: string;
  signatureMeaning: 'AUTHOR' | 'REVIEWER' | 'APPROVER';
  contentHash: string;          // SHA-256 hash of signed content
  authenticationMethod: 'PASSWORD_2FA';
  signedAt: Date;
  ipAddress: string;
  userAgent: string;
  metadata: {
    documentTitle: string;
    documentVersion: number;
    organizationId: string;
  };
}
```

### 8.7 Audit Timeline ("Time Travel")

Complete change history with ability to view any historical state:

```jsx
<AuditTimeline entityType="document" entityId={documentId}>
  <TimelineControls>
    <DateRangePicker />
    <FilterByUser />
    <FilterByAction />
  </TimelineControls>
  
  <TimelineView>
    <Event timestamp="2026-01-26 14:23:45">
      <UserAvatar user="jane.smith@biotech.com" />
      <Action>Electronic signature added</Action>
      <Details>
        Meaning: "Reviewed and Approved"
        IP: 192.168.1.100
        User Agent: Chrome 120.0
      </Details>
      <RestoreButton>View at this point</RestoreButton>
    </Event>
    
    <Event timestamp="2026-01-26 11:15:32">
      <UserAvatar user="ai.assistant@lumen" />
      <Action>Content modified</Action>
      <DiffView>
        - Old IFU text version
        + New IFU text version (aligned with predicate)
      </DiffView>
      <RestoreButton>View at this point</RestoreButton>
    </Event>
    
    <Event timestamp="2026-01-25 16:47:11">
      <UserAvatar user="john.doe@biotech.com" />
      <Action>Document created</Action>
      <Details>Template: 510k_device_description</Details>
    </Event>
  </TimelineView>
  
  <ExportOptions>
    <Button>Export Audit Report (PDF)</Button>
    <Button>Export Audit Log (CSV)</Button>
  </ExportOptions>
</AuditTimeline>
```

---

## 9. Database Schema & Infrastructure

### 9.1 PostgreSQL Schema Design

**Core Tables:**

```sql
-- ========================================
-- ORGANIZATIONAL STRUCTURE
-- ========================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'CRO', 'BIOTECH', 'PHARMA', 'CONSULTANT'
  parent_org_id UUID REFERENCES organizations(id), -- For CRO→Client hierarchy
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_org_type CHECK (type IN ('CRO', 'BIOTECH', 'PHARMA', 'CONSULTANT'))
);

-- Index for hierarchical queries
CREATE INDEX idx_org_parent ON organizations(parent_org_id);
CREATE INDEX idx_org_type ON organizations(type);

-- ========================================
-- USERS & AUTHENTICATION
-- ========================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  mfa_secret VARCHAR(255), -- For 2FA
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);

-- ========================================
-- ROLE-BASED ACCESS CONTROL
-- ========================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  
  CONSTRAINT valid_role_name UNIQUE(name)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  
  PRIMARY KEY (user_id, role_id, org_id)
);

-- Seed default roles
INSERT INTO roles (name, description, permissions) VALUES
('CRO_SUPER_ADMIN', 'Full access across all client organizations', 
  '["view_all_orgs", "manage_clients", "view_all_projects", "manage_users"]'),
('BIOTECH_RA_LEAD', 'Regulatory Affairs lead for single organization',
  '["view_own_org", "manage_projects", "approve_documents", "sign_documents"]'),
('REGULATORY_WRITER', 'Document creation and editing',
  '["view_own_org", "edit_documents", "draft_submissions"]'),
('QA_MANAGER', 'Quality assurance and compliance verification',
  '["view_own_org", "view_audit_logs", "review_documents", "manage_compliance"]'),
('CLINICAL_REVIEWER', 'Clinical data review and analysis',
  '["view_own_org", "analyze_csr", "review_protocols"]');

-- ========================================
-- CLIENT ENGAGEMENT (CRO ↔ Biotech)
-- ========================================

CREATE TABLE client_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cro_org_id UUID REFERENCES organizations(id) NOT NULL,
  client_org_id UUID REFERENCES organizations(id) NOT NULL,
  engagement_type VARCHAR(50), -- 'FULL_SERVICE', 'CONSULTING', 'SUBMISSION_ONLY'
  status VARCHAR(50) DEFAULT 'ACTIVE',
  contract_start DATE,
  contract_end DATE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_engagement_type CHECK (engagement_type IN ('FULL_SERVICE', 'CONSULTING', 'SUBMISSION_ONLY')),
  CONSTRAINT different_orgs CHECK (cro_org_id != client_org_id)
);

CREATE INDEX idx_engagements_cro ON client_engagements(cro_org_id);
CREATE INDEX idx_engagements_client ON client_engagements(client_org_id);

-- ========================================
-- PROJECTS & SUBMISSIONS
-- ========================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name VARCHAR(255) NOT NULL,
  project_type VARCHAR(50) NOT NULL, -- '510K', 'IND', 'NDA', 'BLA', 'MAA', 'PMA'
  status VARCHAR(50) DEFAULT 'ACTIVE',
  therapeutic_area VARCHAR(100),
  target_submission_date DATE,
  regulatory_region VARCHAR(50) DEFAULT 'FDA', -- 'FDA', 'EMA', 'PMDA', 'NMPA'
  metadata JSONB DEFAULT '{}', -- Stores sponsor experience, predicate devices, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_project_type CHECK (project_type IN ('510K', 'IND', 'NDA', 'BLA', 'MAA', 'PMA')),
  CONSTRAINT valid_regulatory_region CHECK (regulatory_region IN ('FDA', 'EMA', 'PMDA', 'NMPA', 'MULTI'))
);

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_type ON projects(project_type);
CREATE INDEX idx_projects_status ON projects(status);

-- ========================================
-- WORK BREAKDOWN STRUCTURE (WBS)
-- ========================================

CREATE TABLE project_wbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES project_wbs(id), -- Hierarchical structure
  phase_number INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'NOT_STARTED',
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  dependencies JSONB DEFAULT '[]', -- Array of task IDs that must complete first
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_wbs_status CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'))
);

CREATE INDEX idx_wbs_project ON project_wbs(project_id);
CREATE INDEX idx_wbs_parent ON project_wbs(parent_id);
CREATE INDEX idx_wbs_status ON project_wbs(status);

-- ========================================
-- DOCUMENTS
-- ========================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  ctd_module VARCHAR(20), -- 'M1', 'M2.5', 'M3.2.S', etc. (for NDA/BLA/MAA)
  doc_type VARCHAR(100) NOT NULL, -- 'cover_letter', 'device_description', 'clinical_overview', etc.
  title VARCHAR(500) NOT NULL,
  storage_path TEXT, -- S3 path or file system path
  storage_provider VARCHAR(50) DEFAULT 'S3',
  file_hash VARCHAR(64), -- SHA-256 hash for integrity
  status VARCHAR(50) DEFAULT 'DRAFT',
  current_version INTEGER DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_doc_status CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SIGNED', 'SUBMITTED'))
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_type ON documents(doc_type);
CREATE INDEX idx_documents_status ON documents(status);

-- ========================================
-- DOCUMENT VERSIONS (Immutable History)
-- ========================================

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_doc_version UNIQUE(document_id, version_number)
);

CREATE INDEX idx_versions_document ON document_versions(document_id);

-- ========================================
-- AUDIT TRAIL (21 CFR Part 11)
-- ========================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id),
  action VARCHAR(100) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'SIGN', 'APPROVE', etc.
  entity_type VARCHAR(100) NOT NULL, -- 'document', 'project', 'user', 'setting', etc.
  entity_id UUID NOT NULL,
  old_value JSONB, -- Previous state (for updates)
  new_value JSONB, -- New state
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Prevent deletion of audit records
CREATE OR REPLACE FUNCTION prevent_audit_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records cannot be deleted (21 CFR Part 11 compliance)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_deletion();

-- Prevent updates to audit records
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records cannot be modified (21 CFR Part 11 compliance)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_update();

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

-- ========================================
-- ELECTRONIC SIGNATURES
-- ========================================

CREATE TABLE electronic_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  user_id UUID REFERENCES users(id) NOT NULL,
  signature_meaning VARCHAR(255) NOT NULL, -- 'AUTHOR', 'REVIEWER', 'APPROVER'
  content_hash VARCHAR(64) NOT NULL, -- SHA-256 of signed content
  authentication_method VARCHAR(50) NOT NULL, -- 'PASSWORD_2FA'
  signed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT valid_signature_meaning CHECK (signature_meaning IN ('AUTHOR', 'REVIEWER', 'APPROVER'))
);

CREATE INDEX idx_signatures_document ON electronic_signatures(document_id);
CREATE INDEX idx_signatures_user ON electronic_signatures(user_id);

-- ========================================
-- PREDICTIONS & RISKS
-- ========================================

CREATE TABLE risk_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  risk_factor_id VARCHAR(50) NOT NULL, -- e.g., 'K002', 'I005'
  severity DECIMAL(3,2) CHECK (severity >= 0 AND severity <= 1),
  detected_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'OPEN',
  mitigation_applied TEXT,
  resolved_at TIMESTAMP,
  details JSONB,
  
  CONSTRAINT valid_risk_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'MITIGATED', 'RESOLVED', 'ACCEPTED'))
);

CREATE INDEX idx_risks_project ON risk_detections(project_id);
CREATE INDEX idx_risks_status ON risk_detections(status);

CREATE TABLE project_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  success_probability DECIMAL(3,2) CHECK (success_probability >= 0 AND success_probability <= 1),
  confidence_level DECIMAL(3,2) CHECK (confidence_level >= 0 AND confidence_level <= 1),
  risk_level VARCHAR(20),
  detected_risks JSONB, -- Array of detected risk objects
  recommendations JSONB, -- Array of recommended actions
  generated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_risk_level CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX idx_predictions_project ON project_predictions(project_id);
CREATE INDEX idx_predictions_generated ON project_predictions(generated_at);

-- ========================================
-- PM SETTINGS (Client-Configurable)
-- ========================================

CREATE TABLE pm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) UNIQUE NOT NULL,
  ai_settings JSONB DEFAULT '{}',
  workflow_settings JSONB DEFAULT '{}',
  notification_settings JSONB DEFAULT '{}',
  compliance_settings JSONB DEFAULT '{}',
  therapeutic_area_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_pm_settings_org ON pm_settings(org_id);

-- ========================================
-- LUMEN CORTEX KNOWLEDGE BASE
-- ========================================

CREATE TABLE knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type VARCHAR(50) NOT NULL, -- 'GUIDELINE', 'CSR', 'STUDY', 'REGULATION', 'FAQ'
  source VARCHAR(255), -- Source identifier (e.g., 'ICH-E6-R2', 'NCT03844191')
  title TEXT NOT NULL,
  content TEXT,
  embedding VECTOR(1536), -- For semantic search (requires pgvector extension)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_entry_type CHECK (entry_type IN ('GUIDELINE', 'CSR', 'STUDY', 'REGULATION', 'FAQ', 'TEMPLATE'))
);

CREATE INDEX idx_knowledge_type ON knowledge_entries(entry_type);
CREATE INDEX idx_knowledge_source ON knowledge_entries(source);
CREATE INDEX idx_knowledge_embedding ON knowledge_entries USING ivfflat (embedding vector_cosine_ops);

-- ========================================
-- RESPONSE CACHE
-- ========================================

CREATE TABLE response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 of normalized query
  query_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}',
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cache_query_hash ON response_cache(query_hash);
CREATE INDEX idx_cache_last_accessed ON response_cache(last_accessed);

-- Auto-increment hit_count on access
CREATE OR REPLACE FUNCTION increment_cache_hits()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE response_cache 
  SET hit_count = hit_count + 1, last_accessed = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 9.2 Row-Level Security (RLS)

Enforce multi-tenant data isolation at the database level:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own organization's data
CREATE POLICY org_isolation ON projects
  USING (org_id = current_setting('app.current_org_id')::UUID);

-- Policy: CRO Super-Admins can see all client organizations
CREATE POLICY cro_access ON projects
  USING (
    org_id IN (
      SELECT client_org_id FROM client_engagements
      WHERE cro_org_id = current_setting('app.current_org_id')::UUID
    )
  );

-- Set org context at session start
-- Application sets this when user logs in
-- SET app.current_org_id = 'user-org-uuid';
```

---

## 10. Compliance & Security Framework

### 10.1 21 CFR Part 11 Compliance

**Regulatory Requirement:** FDA's regulation for electronic records and electronic signatures.

**Concept2Cure Implementation:**

| Part 11 Requirement | Implementation |
|---------------------|----------------|
| **11.10(a) Validation** | Comprehensive test suites, IQ/OQ/PQ validation documentation |
| **11.10(b) Audit Trail** | `audit_log` table with immutable records, prevent delete/update triggers |
| **11.10(c) Secure Copies** | Document versions stored with SHA-256 hashes, immutable snapshots |
| **11.10(d) Limited System Access** | Role-based access control, MFA, session management |
| **11.10(e) Time-stamped Audit** | All audit records include precise timestamps with timezone |
| **11.10(k) System Documentation** | Complete technical documentation, user manuals, validation protocols |
| **11.50 Signature Manifestations** | Clear display of signature meaning, signer identity, date/time |
| **11.70 Signature/Record Linking** | Content hash binds signature to exact document state |
| **11.100 General Requirements** | Unique user IDs, MFA authentication, signature meaning capture |
| **11.200 Electronic Signatures** | Non-repudiable signatures with dual authentication (password + 2FA) |
| **11.300 Controls for Signatures** | System validates identity before accepting signature |

### 10.2 Security Architecture

**Authentication Flow:**

```
┌─────────────────────────────────────────────────┐
│         USER LOGIN REQUEST                      │
│   Email: user@biotech.com                       │
│   Password: ********                            │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│   1. PASSWORD VERIFICATION                      │
│   • Hash password with bcrypt                   │
│   • Compare with stored password_hash           │
│   • Check account status (not locked)           │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│   2. MULTI-FACTOR AUTHENTICATION                │
│   • Generate TOTP challenge                     │
│   • User enters 6-digit code from authenticator │
│   • Verify code matches within time window      │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│   3. SESSION CREATION                           │
│   • Generate access token (JWT, 15 min expiry)  │
│   • Generate refresh token (7 day expiry)       │
│   • Store session in Redis                      │
│   • Set current_org_id for RLS                  │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│   4. AUDIT LOG ENTRY                            │
│   • Record successful login                     │
│   • Log IP address and user agent               │
│   • Store in immutable audit_log table          │
└─────────────────────────────────────────────────┘
```

**Data Encryption:**

| Layer | Method |
|-------|--------|
| **Data at Rest** | AES-256 encryption for S3 document storage |
| **Data in Transit** | TLS 1.3 for all API communications |
| **Database** | PostgreSQL native encryption (Neon platform) |
| **Passwords** | Bcrypt hashing with salt (cost factor 12) |
| **Tokens** | JWT with RS256 signing (asymmetric keys) |
| **MFA Secrets** | Encrypted at rest with application key |

### 10.3 Validation Strategy

**IQ/OQ/PQ Phases:**

| Phase | Purpose | Key Activities |
|-------|---------|----------------|
| **IQ (Installation Qualification)** | Verify correct installation | Check Node.js version, database connection, dependencies installed, environment variables set |
| **OQ (Operational Qualification)** | Verify system operates correctly | Run all unit tests (>80% coverage), integration tests, e2e tests, verify all features functional |
| **PQ (Performance Qualification)** | Verify real-world performance | Load testing (100+ concurrent users), cache hit rate measurement, API latency benchmarks, user acceptance testing |

**Test Coverage Requirements:**

```typescript
// Target coverage thresholds
const coverageThresholds = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80
};

// Critical path testing (100% coverage required)
const criticalPaths = [
  'electronic_signature_workflow',
  'audit_trail_recording',
  'document_version_control',
  'risk_detection_engine',
  'submission_pyramid_generation'
];
```

---

**Continue to Part 4** for: Implementation Phases, Detailed Task Breakdown, and AI Provider Strategy.

---

*"Compliance by design, intelligence by default."*
