# Project Charter & Regulatory Intelligence Architecture Study

**Date**: 2026-03-27
**Scope**: Technical layer study of project management, charter system, timeline/schedule, commitment tracking, and AnA 1.0 RI integration
**Status**: Implementation Blueprint

---

## 1. Executive Summary

This document maps the complete architecture for a **regulatory project charter system** that:

1. Provides Claude.ai-style project setup with regulatory submission templates (IND, BLA, 510K, NDA, PMA, MAA, De Novo)
2. Extracts commitments from uploaded documents and aligns them to submission milestones
3. Generates visual schedules (Gantt-style timeline) from charter specifications
4. Gives AnA full project-specific intelligence with proactive next-step recommendations
5. Supports a client-buildable `skill.md`-style project charter file

---

## 2. Existing Infrastructure Inventory

### 2.1 What Already Exists (Leverage, Don't Rebuild)

| Layer | Component | File | Status |
|-------|-----------|------|--------|
| **Schema** | `regulatoryPrograms` | `shared/schema/programs.ts` | Full table with type, agency, timeline, team |
| **Schema** | `programMilestones` | `shared/schema/programs.ts` | Dependencies, deliverables, status tracking |
| **Schema** | `evidenceObjects` + `evidenceLinks` | `shared/schema/programs.ts` | Evidence→claim traceability |
| **Schema** | `projectIntelligenceProfiles` | `shared/schema.ts:15540` | Strategy, risks, decisions, insights, open questions |
| **Schema** | `projectMemoryEntries` | `shared/schema.ts:15595` | Knowledge atoms with embeddings, confidence, importance |
| **Schema** | `projectIngestedDocuments` | `shared/schema.ts:15642` | Upload tracking with token counts |
| **Schema** | `ctdOnboardingProjects` | `shared/schema/ctd-projects.ts` | Submission type, region, product classification |
| **Schema** | `projectIntelligenceSummaries` | `shared/schema/orchestration.ts` | Continuity object for AI awareness |
| **Intelligence** | Readiness scoring | `server/services/intelligence/readiness-scoring-engine.ts` | 4-dimension scoring (completeness, quality, consistency, compliance) |
| **Intelligence** | Next-best-action | `server/services/intelligence/next-best-action-engine.ts` | Urgency×impact ranking, 7 categories |
| **Intelligence** | Recommendations | `server/services/intelligence/recommendation-engine.ts` | 10 types, evidence-based, accept/dismiss |
| **Intelligence** | Project profiles | `server/services/intelligence/project-intelligence-service.ts` | Profile CRUD + enrichment |
| **Intelligence** | RIM | `server/services/intelligence/rim.ts` | Pattern registry, signal capture, 4 interceptors |
| **AnA RI** | Orchestrator | `server/services/ana-ri/orchestrator.ts` | Intent detection, system prompt assembly |
| **AnA RI** | Context enrichment | `server/services/ana-ri/context-enrichment.ts` | 44 slash commands, 13 auto-triggers |
| **AnA RI** | Command executor | `server/services/ana-ri/command-executor.ts` | 39 operational commands |
| **Frontend** | ProjectKnowledgePanel | `client/src/concept2cure/components/workspace/ProjectKnowledgePanel.tsx` | Context bar, strategy, instructions, memory, docs, signals |
| **Frontend** | Intelligence hooks | `client/src/concept2cure/hooks/useIntelligence.ts` | 9 TanStack Query hooks |
| **Frontend** | Project knowledge hook | `client/src/concept2cure/hooks/useProjectKnowledge.ts` | Uploads, context calc, instructions |
| **Extraction** | Unified extraction | `server/services/unified-extraction-service.ts` | Entity/relation extraction |
| **Obligations** | Obligation router | `server/src/routes/obligations.router.ts` | AI-powered obligation extraction + tracking |

### 2.2 What's Missing (Must Build)

| Gap | Description | Priority |
|-----|-------------|----------|
| **Project Charter** | Structured charter document per project with submission-specific sections | P0 |
| **Charter Templates** | Pre-built templates for each submission type (IND, BLA, 510K, etc.) | P0 |
| **Timeline Phases** | Phase-based timeline with dependencies, critical path | P0 |
| **Commitment Extraction** | Parse uploaded docs for regulatory commitments → track fulfillment | P1 |
| **Visual Schedule** | Gantt-style timeline component in the workspace | P1 |
| **Proactive Engine** | Auto-generate next-step nudges based on charter + timeline + readiness | P0 |
| **AnA Charter Commands** | `/charter`, `/timeline`, `/commitment`, `/schedule` commands | P0 |
| **Charter Skill File** | Client-buildable `.md` charter that AnA reads for project context | P1 |

---

## 3. Architecture Design

### 3.1 Data Model

```
┌──────────────────────────────────────────────────┐
│                PROJECT (existing)                 │
│  projects table — name, type, status, dates       │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   PROJECT CHARTER   │  │   INTELLIGENCE      │ │
│  │   (NEW)             │  │   PROFILE (exists)  │ │
│  │                     │  │                     │ │
│  │  submissionType     │  │  regulatoryStrategy │ │
│  │  regulatoryRegion   │  │  riskFactors        │ │
│  │  productName        │  │  openQuestions       │ │
│  │  indication         │  │  keyDecisions       │ │
│  │  predicateDevices   │  │  learnedInsights    │ │
│  │  charterSections[]  │  │                     │ │
│  │  criticalFactors[]  │  │                     │ │
│  │  approvalStatus     │  │                     │ │
│  └─────────┬───────────┘  └─────────────────────┘ │
│            │                                       │
│  ┌─────────▼───────────┐  ┌─────────────────────┐ │
│  │   TIMELINE PHASES   │  │   COMMITMENTS       │ │
│  │   (NEW)             │  │   (NEW)             │ │
│  │                     │  │                     │ │
│  │  phaseName          │  │  commitmentText     │ │
│  │  startDate          │  │  source (extracted/ │ │
│  │  targetEndDate      │  │    manual/charter)  │ │
│  │  status             │  │  dueDate            │ │
│  │  deliverables[]     │  │  status             │ │
│  │  predecessors[]     │  │  owner              │ │
│  │  criticalPath       │  │  signedBy           │ │
│  │  progress (0-100)   │  │  fulfillmentProof   │ │
│  └─────────┬───────────┘  └─────────────────────┘ │
│            │                                       │
│  ┌─────────▼───────────┐                          │
│  │   MILESTONES        │                          │
│  │   (extends existing)│                          │
│  │                     │                          │
│  │  phaseId (NEW)      │                          │
│  │  criticalPathFlag   │                          │
│  │  dependsOn[]        │                          │
│  │  deliverables[]     │                          │
│  └─────────────────────┘                          │
└──────────────────────────────────────────────────┘
```

### 3.2 Regulatory Submission Templates

Each template defines the phases, milestones, deliverables, and typical timeline for a submission type:

#### IND (Investigational New Drug)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Strategy & Planning | 4-8 weeks | Regulatory strategy, target product profile, pre-IND meeting request |
| 2. Nonclinical Package | 12-24 weeks | Pharmacology, toxicology, ADME studies |
| 3. CMC Development | 16-32 weeks | Drug substance, drug product, specifications, stability |
| 4. Clinical Protocol | 8-16 weeks | Protocol design, IB, ICF, SAP |
| 5. IND Compilation | 4-8 weeks | Module 1-5 assembly, QC review |
| 6. Submission & Review | 30 days (FDA) | FDA filing, 30-day safety review |

#### 510(k) (Medical Device)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Project Planning | 2-4 weeks | Predicate selection, classification, testing plan |
| 2. Predicate Analysis | 4-8 weeks | Substantial equivalence matrix, intended use comparison |
| 3. Performance Testing | 8-24 weeks | Bench testing, biocompatibility, software validation |
| 4. Clinical Evidence | 4-16 weeks | Literature review, clinical data (if needed) |
| 5. 510(k) Authoring | 4-8 weeks | Summary, SE discussion, labeling |
| 6. QA & Submission | 2-4 weeks | eSTAR, submission package, cover letter |

#### BLA (Biologics License Application)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Pre-BLA Strategy | 8-12 weeks | Meeting with FDA, submission strategy, eCTD plan |
| 2. Module 2 Summaries | 12-20 weeks | Quality overall summary, nonclinical overview, clinical overview |
| 3. Module 3 (Quality) | 16-32 weeks | Drug substance, drug product, analytical methods |
| 4. Module 4 (Nonclinical) | 8-16 weeks | Nonclinical study reports, toxicology summaries |
| 5. Module 5 (Clinical) | 16-32 weeks | CSRs, integrated summaries (ISS/ISE), patient narratives |
| 6. Module 1 (Admin) | 4-8 weeks | Cover letter, forms, labeling, patent information |
| 7. QC & Submission | 8-12 weeks | Publishing, QC, eCTD validation, submission |

#### NDA (New Drug Application)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Pre-NDA Strategy | 8-12 weeks | Pre-NDA meeting, rolling submission plan |
| 2. CTD Module 2 | 12-24 weeks | Quality, nonclinical, clinical summaries |
| 3. CTD Module 3 | 16-32 weeks | CMC data package |
| 4. CTD Module 4 | 8-16 weeks | Nonclinical study tabulations |
| 5. CTD Module 5 | 20-40 weeks | Clinical study reports, datasets, ISS/ISE |
| 6. Assembly & QC | 8-16 weeks | eCTD publishing, cross-references, QC |

#### PMA (Premarket Approval)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1. Strategy & Pre-Sub | 4-8 weeks | FDA pre-submission meeting, clinical study design |
| 2. Nonclinical Testing | 12-24 weeks | Bench, biocompatibility, sterilization validation |
| 3. Clinical Study | 24-52 weeks | IDE trial execution, data collection |
| 4. Clinical Analysis | 8-16 weeks | Statistical analysis, CSR, safety analysis |
| 5. PMA Authoring | 8-16 weeks | Summary of safety/effectiveness, labeling |
| 6. Submission & Review | 4-8 weeks | Submission, interactive review |

### 3.3 AnA Integration Architecture

```
                         USER MESSAGE
                              │
                    ┌─────────▼──────────┐
                    │   AnA Orchestrator  │
                    │  (intent detection) │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────┐  ┌─────▼─────┐  ┌──────▼──────┐
    │ Context        │  │ Command   │  │ Proactive   │
    │ Enrichment     │  │ Executor  │  │ Engine      │
    │                │  │           │  │ (NEW)       │
    │ NEW triggers:  │  │ NEW cmds: │  │             │
    │ • charter      │  │ • charter │  │ Scans:      │
    │ • timeline     │  │ • timeline│  │ • charter   │
    │ • commitment   │  │ • commit  │  │ • timeline  │
    │ • schedule     │  │ • schedule│  │ • readiness │
    │                │  │ • sign    │  │ • milestones│
    └───────┬───────┘  └─────┬─────┘  │ • commitments│
            │                │        │             │
            └───────┬────────┘        │ Outputs:    │
                    │                 │ • nudges    │
          ┌─────────▼──────────┐      │ • alerts    │
          │  System Prompt     │      │ • recommend │
          │  Assembly          │      └──────┬──────┘
          │                    │             │
          │ Layer 1: Persona   │    ┌────────▼────────┐
          │ Layer 2: Charter   │◄───│  Project Charter │
          │ Layer 3: Timeline  │    │  Intelligence    │
          │ Layer 4: Commits   │    │  Injection       │
          │ Layer 5: Readiness │    └─────────────────┘
          │ Layer 6: Memory    │
          │ Layer 7: Context   │
          └────────────────────┘
```

### 3.4 Proactive Intelligence Flow

```
1. Charter Created
   └─→ Auto-generate milestones from template
   └─→ Auto-generate initial commitments
   └─→ Set timeline phases with dependencies

2. Document Uploaded
   └─→ Extract entities + obligations
   └─→ Match obligations to charter commitments
   └─→ Create new commitments for unmatched obligations
   └─→ Update timeline if new constraints found

3. AnA Chat Message
   └─→ RIM interceptor captures patterns
   └─→ Proactive engine checks:
       ├─ Any commitments due within 7 days?
       ├─ Any milestones at risk?
       ├─ Any readiness gaps blocking next phase?
       └─→ Inject proactive nudge into response

4. Phase Boundary
   └─→ Readiness check for next phase entry
   └─→ Generate phase-entry commitments
   └─→ Alert if critical-path items incomplete
```

---

## 4. Schema Definitions

### 4.1 Project Charters Table

```typescript
export const projectCharters = pgTable('project_charters', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  projectId: integer('project_id').notNull(),

  // Submission classification
  submissionType: text('submission_type').notNull(),     // IND, NDA, BLA, 510K, PMA, MAA, DE_NOVO, EUA, IVDR
  regulatoryRegion: text('regulatory_region').notNull(), // FDA, EMA, PMDA, MHRA, HealthCanada, TGA, NMPA
  productName: text('product_name').notNull(),
  productType: text('product_type'),                     // drug, biologic, device, combination, ivd
  indication: text('indication'),
  targetPopulation: text('target_population'),

  // Device-specific
  predicateDevices: json('predicate_devices'),   // For 510K/De Novo
  deviceClass: text('device_class'),             // I, II, III
  productCode: text('product_code'),

  // Strategy
  regulatoryStrategy: text('regulatory_strategy'),       // Narrative
  criticalSuccessFactors: json('critical_success_factors'), // string[]
  riskMitigationPlan: text('risk_mitigation_plan'),
  communicationPlan: text('communication_plan'),
  qualityTargets: json('quality_targets'),               // { dimension: target }

  // Dates
  targetSubmissionDate: timestamp('target_submission_date'),
  targetApprovalDate: timestamp('target_approval_date'),

  // Custom instructions (injected into AnA context)
  customInstructions: text('custom_instructions'),       // Client's project-specific AI instructions

  // Approval workflow
  approvalStatus: text('approval_status').default('draft'), // draft, pending_review, approved, locked
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),

  // Audit
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 4.2 Charter Sections Table

```typescript
export const charterSections = pgTable('charter_sections', {
  id: serial('id').primaryKey(),
  charterId: integer('charter_id').notNull()
    .references(() => projectCharters.id, { onDelete: 'cascade' }),
  parentSectionId: integer('parent_section_id'),
  sectionKey: text('section_key').notNull(),    // e.g., 'objectives', 'scope', 'deliverables'
  sectionLabel: text('section_label').notNull(),
  content: text('content'),
  status: text('status').default('empty'),       // empty, draft, review, approved, locked
  sortOrder: integer('sort_order').default(0),
  ownerRole: text('owner_role'),                 // ra_lead, medical_writer, qa_manager, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 4.3 Timeline Phases Table

```typescript
export const timelinePhases = pgTable('timeline_phases', {
  id: serial('id').primaryKey(),
  charterId: integer('charter_id').notNull()
    .references(() => projectCharters.id, { onDelete: 'cascade' }),
  phaseName: text('phase_name').notNull(),
  phaseNumber: integer('phase_number').notNull(),
  description: text('description'),

  // Dates
  startDate: timestamp('start_date'),
  targetEndDate: timestamp('target_end_date'),
  actualEndDate: timestamp('actual_end_date'),

  // Progress
  status: text('status').default('not_started'),  // not_started, in_progress, completed, at_risk, blocked
  progress: integer('progress').default(0),        // 0-100

  // Dependencies
  predecessors: json('predecessors'),   // phase IDs that must complete first
  isCriticalPath: boolean('is_critical_path').default(false),

  // Deliverables
  deliverables: json('deliverables'),   // { name, status, owner }[]
  ownerRole: text('owner_role'),

  // Metadata
  estimatedWeeks: integer('estimated_weeks'),
  actualWeeks: integer('actual_weeks'),
  color: text('color'),                 // for Gantt rendering

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 4.4 Project Commitments Table

```typescript
export const projectCommitments = pgTable('project_commitments', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  projectId: integer('project_id').notNull(),
  charterId: integer('charter_id')
    .references(() => projectCharters.id),
  phaseId: integer('phase_id')
    .references(() => timelinePhases.id),

  // Commitment
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),           // regulatory_submission, agency_engagement,
                                                    // document_delivery, quality_assurance,
                                                    // team_deliverable, evidence_gathering
  // Source
  source: text('source').notNull(),                // charter, extracted, manual, proactive, readiness_gap
  sourceDocumentId: integer('source_document_id'), // if extracted from upload
  extractionConfidence: real('extraction_confidence'),

  // Timeline
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),

  // Status
  status: text('status').default('pending'),       // pending, in_progress, completed, overdue, at_risk, waived
  priority: text('priority').default('medium'),    // critical, high, medium, low
  urgency: text('urgency'),                        // immediate, this_week, this_sprint, backlog

  // Assignment
  ownerUserId: integer('owner_user_id'),
  ownerRole: text('owner_role'),

  // Fulfillment
  fulfillmentProof: text('fulfillment_proof'),     // description of how commitment was met
  fulfillmentArtifactId: integer('fulfillment_artifact_id'),

  // Signature (21 CFR Part 11)
  requiresSignature: boolean('requires_signature').default(false),
  signedBy: integer('signed_by'),
  signedAt: timestamp('signed_at'),
  signatureMeaning: text('signature_meaning'),

  // Audit
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## 5. AnA Slash Commands (New)

| Command | Description | Category |
|---------|-------------|----------|
| `/charter` | Display/analyze project charter | Project |
| `/charter-create` | Create charter from template | Project |
| `/timeline` | Show project timeline with phases | Project |
| `/schedule` | Schedule actions/milestones | Project |
| `/commitment` | List active commitments | Project |
| `/commitments-due` | Show commitments due this week | Project |
| `/critical-path` | Analyze critical path + risks | Intelligence |
| `/phase-readiness` | Check readiness for entering next phase | Intelligence |
| `/extract-commitments` | Extract commitments from uploaded document | Intelligence |

---

## 6. Proactive Intelligence Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Commitment approaching | Due date within 7 days | Nudge in chat greeting |
| Milestone at risk | Progress < expected for timeline position | Alert with remediation |
| Phase boundary | Current phase nearing completion | Phase-entry readiness check |
| Readiness gap critical | Dimension score < 40 | Auto-create remediation commitment |
| Document uploaded | New document ingested | Extract obligations, match to commitments |
| Charter incomplete | Charter sections in 'empty' status > 30 days | Prompt to complete charter |

---

## 7. Implementation Plan

### Phase 1: Schema + Core Services (Current Sprint)

1. Create `shared/schema/project-charter.ts` with all 4 tables
2. Create migration `0012_project_charter_timeline.sql`
3. Build `server/services/intelligence/charter-template-engine.ts` — template library
4. Build `server/services/intelligence/proactive-commitment-engine.ts` — commitment generation
5. Build `server/services/intelligence/timeline-generation-engine.ts` — schedule from charter
6. Create `server/routes/project-charter.ts` — charter CRUD + timeline + commitments

### Phase 2: AnA Integration

7. Extend `server/services/ana-ri/context-enrichment.ts` — charter/timeline triggers
8. Extend `server/services/ana-ri/command-executor.ts` — charter/timeline/commitment commands
9. Extend readiness engine — include timeline adherence + commitment fulfillment
10. Extend next-best-action — prioritize by critical path position

### Phase 3: Frontend

11. Build `ProjectCharterPanel.tsx` — charter wizard + section editor
12. Build `TimelineGanttChart.tsx` — visual schedule
13. Build `ProjectCommitmentsTracker.tsx` — commitment list with signing
14. Extend `ProjectKnowledgePanel.tsx` — integrate charter summary
15. Add hooks: `useProjectCharter.ts`, `useProjectTimeline.ts`, `useProjectCommitments.ts`

### Phase 4: Skill File + Documentation

16. Create `.claude/skills/project-charter.md` — client-buildable charter skill
17. Wire proactive nudges into AnA greeting + response postprocessor

---

## 8. File Map

| File | Type | Status |
|------|------|--------|
| `shared/schema/project-charter.ts` | Schema | NEW |
| `migrations/0012_project_charter_timeline.sql` | Migration | NEW |
| `server/services/intelligence/charter-template-engine.ts` | Service | NEW |
| `server/services/intelligence/proactive-commitment-engine.ts` | Service | NEW |
| `server/services/intelligence/timeline-generation-engine.ts` | Service | NEW |
| `server/routes/project-charter.ts` | Routes | NEW |
| `server/services/ana-ri/context-enrichment.ts` | Service | EXTEND |
| `server/services/ana-ri/command-executor.ts` | Service | EXTEND |
| `client/src/concept2cure/components/projects/ProjectCharterPanel.tsx` | Component | NEW |
| `client/src/concept2cure/components/timeline/TimelineGanttChart.tsx` | Component | NEW |
| `client/src/concept2cure/components/projects/ProjectCommitmentsTracker.tsx` | Component | NEW |
| `client/src/concept2cure/hooks/useProjectCharter.ts` | Hook | NEW |
| `client/src/concept2cure/hooks/useProjectTimeline.ts` | Hook | NEW |
| `client/src/concept2cure/hooks/useProjectCommitments.ts` | Hook | NEW |
| `.claude/skills/project-charter.md` | Skill | NEW |
