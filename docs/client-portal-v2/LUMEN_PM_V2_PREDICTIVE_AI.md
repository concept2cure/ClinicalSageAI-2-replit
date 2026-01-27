# LUMEN PM V2 PREDICTIVE AI

## Predictive Intelligence Engine & Client-Configurable PM Settings

**Version:** 1.0.0
**Date:** January 27, 2026
**Status:** AUTHORITATIVE - Implementation Ready
**Source:** Project Cortex Design + Lumen Intelligence System

---

## Executive Summary

Lumen PM v2 is the predictive intelligence layer that powers proactive project management within the Concept2Cure platform. It combines:

1. **Regulatory Intelligence Engine** - Historical FDA/EMA patterns
2. **Predictive Risk Detection** - ML-based submission risk assessment
3. **Client-Configurable Settings** - Custom PM rules per organization
4. **Document Generation Intelligence** - AI-powered document drafting

### Vision Statement

> "Be the defacto go-to intelligence center outside of the actual FDA."

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COGNITIVE ADVISORY SERVICE                             │
│        (AI brain - project memory, risk analysis, suggestions)               │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ Project Memory  │  │  Risk Analyzer  │  │ Suggestion      │           │
│    │ (per-project    │  │ (pattern match  │  │ Generator       │           │
│    │  learning)      │  │  to taxonomy)   │  │ (GPT-4 powered) │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATORY INTELLIGENCE ENGINE                            │
│         (Rejection patterns, IND Pyramid, 510(k) taxonomy)                   │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ IND Pyramid     │  │ 510(k) Dossier  │  │ Rejection       │           │
│    │ (5 levels)      │  │ (5 sections)    │  │ Patterns        │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORTEX ORCHESTRATOR                                  │
│          (Master coordinator for all data farmer microservices)              │
│                 30-minute harvest cycles, health monitoring                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10-Week Development Roadmap

### Phase 1: Predictive Intelligence Engine (Weeks 1-3)

#### Week 1: Risk Detection Foundation

**Database Schema:**

```sql
CREATE TABLE project_risk_assessments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  submission_type VARCHAR(50), -- 'ind', '510k', 'cer', 'nda'
  risk_score DECIMAL(3,2), -- 0.00 to 1.00
  risk_factors JSONB,
  recommendations JSONB,
  assessed_at TIMESTAMP DEFAULT NOW(),
  assessed_by VARCHAR(100), -- 'lumen_cortex_v2' or user
  organization_id INTEGER REFERENCES organizations(id)
);

CREATE TABLE rejection_patterns (
  id SERIAL PRIMARY KEY,
  pattern_id VARCHAR(50) UNIQUE, -- 'FDA-HOLD-001'
  category VARCHAR(50), -- 'clinical_hold', 'crl', 'rtf', 'nse'
  title TEXT,
  description TEXT,
  severity VARCHAR(20), -- 'critical', 'high', 'medium', 'low'
  regulatory_reference TEXT,
  prevention_guidance TEXT,
  detection_signals JSONB
);
```

**API Endpoints:**

```typescript
// Risk Assessment
POST /api/cortex/assess
GET  /api/cortex/advisory/:projectId
GET  /api/cortex/patterns?category=<category>&severity=<severity>
GET  /api/cortex/pyramid/:submissionType
```

#### Week 2: IND Pyramid Implementation

| Level              | Weight | Focus Areas                                                 |
| ------------------ | ------ | ----------------------------------------------------------- |
| **Foundation**     | 30%    | Scientific Rationale, TPP, MOA, Competitive Differentiation |
| **Preclinical**    | 25%    | Toxicology, Safety Pharm, PK/ADME, NOAEL, Margins           |
| **CMC**            | 20%    | Drug Substance/Product, Specifications, Stability           |
| **Clinical**       | 15%    | Protocol Design, Endpoints, SAP                             |
| **Administrative** | 10%    | Form 1571/1572, IB, Consent                                 |

#### Week 3: 510(k) Dossier Taxonomy

| Section                      | Weight | Focus Areas                                  |
| ---------------------------- | ------ | -------------------------------------------- |
| **Predicate Selection**      | 35%    | Same intended use, Same tech characteristics |
| **Performance Testing**      | 30%    | ISO 10993, IEC 62304, IEC 60601              |
| **Clinical & Human Factors** | 20%    | Clinical data, HF study, ISO 14971           |
| **Labeling & IFU**           | 15%    | Required elements, Warnings                  |

---

### Phase 2: Client-Configurable PM Settings (Weeks 4-5)

#### Week 4: Organization Settings Schema

**Database Schema:**

```sql
CREATE TABLE organization_pm_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) UNIQUE,

  -- Risk Thresholds
  risk_alert_threshold DECIMAL(3,2) DEFAULT 0.70,
  auto_escalation_enabled BOOLEAN DEFAULT true,
  escalation_delay_hours INTEGER DEFAULT 24,

  -- Notification Preferences
  notification_channels JSONB DEFAULT '["email", "in_app"]',
  digest_frequency VARCHAR(20) DEFAULT 'daily',

  -- Workflow Rules
  approval_workflow_enabled BOOLEAN DEFAULT true,
  required_reviewers INTEGER DEFAULT 2,
  auto_archive_days INTEGER DEFAULT 365,

  -- AI Settings
  ai_suggestions_enabled BOOLEAN DEFAULT true,
  ai_document_generation_enabled BOOLEAN DEFAULT true,
  ai_risk_assessment_enabled BOOLEAN DEFAULT true,

  -- Custom Rules
  custom_rules JSONB DEFAULT '[]',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE custom_pm_rules (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  rule_name VARCHAR(255),
  rule_type VARCHAR(50), -- 'deadline', 'approval', 'notification', 'escalation'
  trigger_conditions JSONB,
  actions JSONB,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true
);
```

**UI Components:**

- `PMSettingsPage.tsx` - Main settings dashboard
- `RiskThresholdConfig.tsx` - Risk alert configuration
- `WorkflowRuleBuilder.tsx` - Custom workflow rules
- `AIPreferences.tsx` - AI feature toggles

#### Week 5: Custom Rule Engine

**Rule Types:**

1. **Deadline Rules** - Auto-reminders based on submission dates
2. **Approval Rules** - Custom approval chains per document type
3. **Notification Rules** - Conditional alerts based on risk/status
4. **Escalation Rules** - Auto-escalate overdue items

**Example Rule:**

```json
{
  "rule_name": "Critical Risk Escalation",
  "rule_type": "escalation",
  "trigger_conditions": {
    "risk_score_gte": 0.85,
    "status_not_in": ["resolved", "approved"],
    "days_since_detection_gte": 3
  },
  "actions": [
    { "type": "notify", "target": "project_manager" },
    { "type": "notify", "target": "regulatory_lead" },
    { "type": "flag", "priority": "critical" }
  ]
}
```

---

### Phase 3: Document Generation Intelligence (Weeks 6-7)

#### Week 6: Template Intelligence

**Features:**

- AI-powered template selection based on project context
- Smart field population from existing project data
- Regulatory compliance checking during drafting
- Version-aware template management

**API Endpoints:**

```typescript
POST /api/cortex/document/generate
Body: {
  templateId: string,
  projectId: string,
  sections: string[],
  context: object
}

GET /api/cortex/templates/recommend?projectId=<id>&documentType=<type>
```

#### Week 7: CoAuthor AI Integration

**Capabilities:**

- Real-time writing assistance
- Regulatory language suggestions
- Citation and reference management
- Compliance gap detection
- Cross-document consistency checks

---

### Phase 4: Risk Detection System (Weeks 8-9)

#### Week 8: Pattern Matching Engine

**Rejection Pattern Categories:**

##### IND Clinical Holds

| ID           | Pattern                                    | Severity |
| ------------ | ------------------------------------------ | -------- |
| FDA-HOLD-001 | Insufficient preclinical data for FIH dose | Critical |
| FDA-HOLD-002 | hERG/CV safety pharmacology incomplete     | Critical |
| FDA-HOLD-003 | Impurities not qualified (ICH Q3A)         | High     |
| FDA-HOLD-004 | Protocol safety monitoring inadequate      | High     |
| FDA-HOLD-005 | Toxicology duration insufficient (ICH M3)  | Critical |

##### NDA/BLA Complete Response Letters

| ID          | Pattern                              | Severity |
| ----------- | ------------------------------------ | -------- |
| FDA-CRL-001 | Primary endpoint not met (p>0.05)    | Critical |
| FDA-CRL-002 | Single pivotal trial (need two)      | Critical |
| FDA-CRL-003 | Benefit-risk unfavorable (SAE rate)  | Critical |
| FDA-CRL-004 | Manufacturing GMP deficiencies (483) | Critical |

##### 510(k) Not Substantially Equivalent

| ID               | Pattern                                   | Severity |
| ---------------- | ----------------------------------------- | -------- |
| FDA-510K-NSE-001 | Different technology raises new questions | Critical |
| FDA-510K-NSE-002 | Intended use differs from predicate       | Critical |
| FDA-510K-NSE-003 | Biocompat/software testing incomplete     | High     |

#### Week 9: Proactive Alert System

**Alert Types:**

1. **Risk Alerts** - Pattern matches detected in project
2. **Deadline Alerts** - Upcoming or overdue milestones
3. **Compliance Alerts** - Missing required elements
4. **Market Alerts** - Competitor/regulatory news

**Notification Channels:**

- In-app notifications
- Email digests (configurable frequency)
- Slack/Teams integration
- Mobile push notifications

---

### Phase 5: Integration & Polish (Week 10)

#### Dashboard Widgets

**Lumen PM Dashboard Components:**

```typescript
// Risk Overview Widget
interface RiskOverviewProps {
  projectId: string;
  showTrend: boolean;
}

// Upcoming Deadlines Widget
interface DeadlinesWidgetProps {
  organizationId: string;
  daysAhead: number;
}

// AI Suggestions Panel
interface AISuggestionsProps {
  projectId: string;
  maxSuggestions: number;
}
```

#### API Response Format

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
      "patternMatch": "FDA-HOLD-005",
      "actionItems": ["Complete 28-day GLP tox study", "Verify ICH M3 duration requirements"]
    }
  ],
  "proactiveSuggestions": [
    {
      "priority": "high",
      "title": "Complete hERG assay before IND",
      "rationale": "Required per FDA guidance for novel MOA",
      "actionItems": ["Conduct hERG patch clamp study", "Assess IC50 vs clinical Cmax"]
    }
  ],
  "nextSteps": [
    "Verify GLP toxicology studies meet duration requirements",
    "Consider requesting Type B Pre-IND meeting with FDA"
  ],
  "similarLearnings": [
    {
      "projectId": "proj-087",
      "outcome": "approved",
      "relevantInsight": "Early pre-IND meeting resolved CMC concerns"
    }
  ]
}
```

---

## File Structure

```
server/
├── routes/
│   ├── cortexRoutes.ts           # Main Cortex API
│   ├── cortexAdvisoryRoutes.ts   # Advisory endpoints
│   └── cortexPMRoutes.ts         # PM-specific endpoints
├── services/
│   ├── cognitiveAdvisoryService.ts  # Advisory brain
│   ├── riskAssessmentService.ts     # Risk calculation
│   ├── patternMatchingService.ts    # Pattern detection
│   └── documentGenerationService.ts # Doc generation
└── models/
    ├── rejectionPatterns.ts
    ├── riskAssessment.ts
    └── pmSettings.ts

client/src/
├── pages/
│   ├── pm-settings/
│   │   ├── PMSettingsPage.tsx
│   │   ├── RiskThresholds.tsx
│   │   └── CustomRules.tsx
│   └── project/
│       └── RiskDashboard.tsx
└── components/
    ├── cortex/
    │   ├── RiskOverview.tsx
    │   ├── AISuggestions.tsx
    │   └── PatternAlerts.tsx
    └── pm/
        ├── DeadlineTracker.tsx
        └── MilestoneTimeline.tsx
```

---

## Integration with Existing Systems

### Lumen Cortex Enterprise

- Leverage existing `lumen_cortex/enterprise/` Python modules
- Use GraphRAG for pattern matching
- Connect to Neo4j knowledge graph

### Data Farmers (Project Cortex)

- FDA OpenFDA farmer for adverse event signals
- ClinicalTrials.gov farmer for competitive intelligence
- PubMed farmer for literature monitoring

### Client Portal V2

- Integrate PM widgets into Dashboard.tsx
- Add risk indicators to project cards
- Enable AI suggestions in context menus

---

## Success Metrics

| Metric                    | Target       | Measurement                              |
| ------------------------- | ------------ | ---------------------------------------- |
| Risk Detection Accuracy   | > 85%        | Validated against historical submissions |
| False Positive Rate       | < 15%        | User feedback on alerts                  |
| Time to Risk Detection    | < 24 hours   | From pattern trigger to alert            |
| User Adoption             | > 70%        | Active users per organization            |
| Document Generation Speed | < 30 seconds | First draft generation time              |

---

## Dependencies

| Component               | Status      | Integration           |
| ----------------------- | ----------- | --------------------- |
| Lumen Cortex Enterprise | ✅ Complete | Python API bridge     |
| Neo4j Knowledge Graph   | ✅ Deployed | GraphRAG queries      |
| Rejection Pattern DB    | ✅ Seeded   | 23 patterns loaded    |
| Project Memory          | 🔄 Partial  | Per-project learning  |
| Custom Rules Engine     | ⏳ Planned  | Week 5 implementation |

---

**Last Updated:** January 27, 2026
**Owner:** TrialSage Engineering Team
**Related:** [CONVERGENT_CANVAS_BUILD_PLAN.md](./CONVERGENT_CANVAS_BUILD_PLAN.md)
