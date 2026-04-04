# Concept2Cure v3.0: Complete System Architecture
## The Intelligent Regulatory Orchestration Platform

**Document Version:** 3.0.0 (MAJOR REVISION)  
**Created:** January 27, 2026  
**Revision Type:** Complete System Redesign Based on User Feedback + Weave.bio Analysis

---

## 🎯 Executive Summary: What Changed

### Original Vision (v2.0)
"Claude.ai Projects interface + regulatory AI agent"

### New Vision (v3.0)
"**Intelligent Regulatory Operating System** that orchestrates entire submission lifecycles with AI-powered automation, real-time monitoring, source traceability, and workflow intelligence"

### Key Paradigm Shifts

| Aspect | v2.0 (Original) | v3.0 (Enhanced) |
|--------|-----------------|-----------------|
| **Interface** | Chat-first, manual setup | Workflow-first, auto-orchestrated |
| **Documents** | AI drafts, human edits | Source-linked, auto-updating |
| **Monitoring** | Project-level only | Portfolio + real-time mission control |
| **Data** | Manual input | Integrated pipelines (LIMS/CTMS/EDC) |
| **Templates** | Blank canvas | eCTD-native, pre-structured |
| **Compliance** | Manual checking | Real-time scoring, auto-validation |
| **Scope** | Pre-submission only | Full lifecycle (pre → post) |

---

## 1. The New Architecture: Three-Layer System

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: MISSION CONTROL                                       │
│  Portfolio-wide visibility, resource allocation, intelligence    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Portfolio    │  │ Resource     │  │ Intelligence │         │
│  │ Dashboard    │  │ Allocator    │  │ Feeds        │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: WORKFLOW ORCHESTRATION                                │
│  Submission-type-specific workflows with intelligent automation  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ IND Workflow │  │ 510k         │  │ NDA Workflow │         │
│  │ Engine       │  │ Workflow     │  │ Engine       │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: INTELLIGENT DOCUMENT SYSTEM                           │
│  Source-linked, auto-updating, compliance-scored documents      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Source       │  │ Living       │  │ Compliance   │         │
│  │ Traceability │  │ Documents    │  │ Engine       │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Mission Control Dashboard

### 2.1 Portfolio View (The New Home Screen)

```tsx
// The first thing users see - PORTFOLIO, not individual project

┌─────────────────────────────────────────────────────────────────────┐
│  CONCEPT2CURE - MISSION CONTROL                    👤 Sarah Chen    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Portfolio Overview                               📅 Jan 27, 2026   │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐│
│  │ 🚀 Active   │  │ ⏸️  On Hold  │  │ ✅ Submitted│  │ ⚠️  At Risk││
│  │    8        │  │     2        │  │     12      │  │     3      ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘│
│                                                                      │
│  Critical Path Items (Next 30 Days)                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ⚠️  IND-2025-003: Module 2.5 QA Review Overdue (3 days)      │  │
│  │    Assigned: Patricia Martinez | Auto-escalate in: 2 days    │  │
│  │    [View] [Reassign] [Escalate Now]                          │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 🔴 510K-2026-001: Predicate Recall Alert                     │  │
│  │    K-number predicate recalled 2 days ago                    │  │
│  │    Impact: 89% rejection risk if not addressed               │  │
│  │    [Find New Predicate] [Risk Assessment]                    │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 🟡 NDA-2025-007: Statistical Tables Due Tomorrow             │  │
│  │    Awaiting SAS outputs from Biostatistics                   │  │
│  │    [Check Status] [Request Update]                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Active Submissions Timeline                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  Jan    Feb    Mar    Apr    May    Jun    Jul    Aug        │  │
│  │  │      │      │      │      │      │      │      │          │  │
│  │  IND-003 ████████████░░░ (78% complete, on track)           │  │
│  │  510K-001 ░░░░░░░███████████ (32%, at risk ⚠️)              │  │
│  │  NDA-007 ████████████████████ (92%, ahead ✅)                │  │
│  │  BLA-002 ░░░░░░░░░░████████ (15%, on track)                 │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Resource Utilization                                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  Medical Writers:      ████████░░ 80% utilized (3/4 available)│  │
│  │  RA Specialists:       ███████████ 110% OVERALLOCATED ⚠️    │  │
│  │  CMC Leads:            ████████░░ 85% utilized               │  │
│  │  QA Reviewers:         ████░░░░░░ 40% available capacity     │  │
│  │  External Consultants: ███░░░░░░░ 30% utilized ($45K/month)  │  │
│  │                                                               │  │
│  │  [Rebalance Workload] [Hire Recommendation]                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Regulatory Intelligence Feed                        [Configure]     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 🔔 FDA Draft Guidance: Diabetes Devices (Jan 25, 2026)      │  │
│  │    Affects: 510K-2026-001 (Glucose Meter)                   │  │
│  │    [Review Impact] [Update Documents]                        │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 🔔 EMA Publishes ICH E9(R1) Final Guidance (Jan 20)         │  │
│  │    Affects: IND-2025-003, NDA-2025-007                      │  │
│  │    [Review Changes]                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Quick Actions                                                       │
│  [+ New Submission] [📊 Reports] [👥 Team View] [⚙️ Settings]      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Resource Allocator

**Intelligent Workload Balancing:**

```typescript
interface ResourceAllocation {
  person: TeamMember;
  allocatedHours: number;
  capacity: number;
  utilizationPercent: number;
  currentAssignments: Assignment[];
  availableHours: number;
  projectedOverload: Date | null;
}

class ResourceAllocator {
  analyzeWorkload(): ResourceAnalysis {
    // Real-time analysis of who's overloaded
    // Predicts future bottlenecks
    // Suggests reallocation
  }

  autoBalance(): RebalancePlan {
    // Intelligently redistribute work
    // Maintains critical path integrity
    // Minimizes context switching
  }

  alertOverallocation(): void {
    // Alert when someone hits 100% capacity
    // Escalate when sustained overallocation
  }
}
```

**Example Alert:**

```
⚠️ WORKLOAD ALERT: RA Team Overallocated

Marcus Rodriguez: 142% allocated (71 hours this week)
  - IND-2025-003: Module 1 review (20 hrs)
  - 510K-2026-001: SE comparison (15 hrs)
  - NDA-2025-007: FDA responses (24 hrs)
  - BLA-2002-002: Protocol review (12 hrs)

RECOMMENDATION:
Reassign 510K-2026-001 SE comparison to Jennifer Liu (currently 60% utilized)

[Apply Recommendation] [Manual Reassignment] [Defer]
```

### 2.3 Regulatory Intelligence Feeds

**Auto-Monitoring of:**
- FDA guidance documents (new/revised)
- EMA guidelines updates
- ICH guideline changes
- Predicate device recalls
- Drug approval/rejections (competitive intelligence)
- Regulatory news (policy changes)

**Intelligent Alerts:**

```typescript
class RegulatoryIntelligence {
  async monitorGuidance(): Promise<GuidanceUpdate[]> {
    // Daily scrape of FDA/EMA websites
    // Parse new guidance documents
    // Extract key changes
    // Match to active submissions
  }

  async monitorPredicates(): Promise<RecallAlert[]> {
    // Real-time FDA recall database monitoring
    // Check if any active submission predicates recalled
    // Calculate impact (89% rejection if recalled predicate)
    // Auto-alert teams
  }

  async analyzeCompetitors(): Promise<CompetitiveIntel[]> {
    // Track approvals in same therapeutic area
    // Identify emerging regulatory trends
    // Benchmark approval timelines
  }
}
```

---

## 3. Layer 2: Workflow Orchestration Engine

### 3.1 Submission-Type-Specific Workflows

**The Big Change:** Instead of generic "Projects", each submission type gets a pre-configured, intelligent workflow.

#### 3.1.1 IND Workflow Definition

```typescript
const IND_WORKFLOW = {
  id: 'IND',
  name: 'Investigational New Drug Application',
  stages: [
    {
      id: 'stage-1',
      name: 'Pre-IND Planning',
      order: 1,
      tasks: [
        {
          id: 'lit-review',
          name: 'Literature Review',
          assignedRole: 'medical_writer',
          estimatedHours: 40,
          dependencies: [],
          autoAssign: true
        },
        {
          id: 'pre-ind-request',
          name: 'Pre-IND Meeting Request',
          assignedRole: 'ra_lead',
          estimatedHours: 8,
          dependencies: [],
          template: 'templates/pre-ind-meeting-request.docx'
        },
        {
          id: 'pre-ind-package',
          name: 'Pre-IND Meeting Briefing Package',
          assignedRole: 'ra_lead',
          estimatedHours: 60,
          dependencies: ['pre-ind-request'],
          aiOrchestrated: true
        }
      ],
      autoTransitionCriteria: {
        condition: 'meeting_scheduled',
        requiredTasks: ['pre-ind-request', 'pre-ind-package']
      }
    },
    {
      id: 'stage-2',
      name: 'Pre-IND Meeting',
      order: 2,
      tasks: [
        {
          id: 'meeting-execution',
          name: 'Attend Pre-IND Meeting',
          assignedRole: 'ra_lead',
          estimatedHours: 4,
          dependencies: []
        },
        {
          id: 'meeting-minutes',
          name: 'Document Meeting Minutes',
          assignedRole: 'ra_lead',
          estimatedHours: 4,
          dependencies: ['meeting-execution'],
          aiAssisted: true // AI transcribes, human reviews
        },
        {
          id: 'update-strategy',
          name: 'Update IND Strategy Based on FDA Feedback',
          assignedRole: 'ra_lead',
          estimatedHours: 16,
          dependencies: ['meeting-minutes']
        }
      ],
      autoTransitionCriteria: {
        condition: 'all_tasks_complete',
        minimumDelay: '2_days' // Cool-off period
      }
    },
    {
      id: 'stage-3',
      name: 'IND Preparation',
      order: 3,
      parallelTracks: [
        {
          id: 'module-1',
          name: 'Module 1: Administrative',
          owner: 'ra_lead',
          documents: [
            'cover_letter',
            'fda_form_1571',
            'intro_statement',
            'general_inv_plan',
            'pre_ind_summary'
          ],
          estimatedHours: 80
        },
        {
          id: 'module-2',
          name: 'Module 2: Investigator's Brochure',
          owner: 'medical_writer',
          coOwners: ['toxicologist', 'pharmacologist'],
          documents: ['investigators_brochure'],
          estimatedHours: 120,
          sourceDataRequired: [
            'nonclinical_study_reports',
            'pharmacology_data',
            'toxicology_data',
            'prior_human_experience'
          ]
        },
        {
          id: 'module-3',
          name: 'Module 3: Clinical Protocol',
          owner: 'clinical_lead',
          documents: ['clinical_protocol', 'informed_consent'],
          estimatedHours: 200,
          dependencies: ['module-2'], // IB must be complete first
          sourceDataRequired: ['pre_ind_meeting_feedback']
        },
        {
          id: 'module-4',
          name: 'Module 4: CMC',
          owner: 'cmc_lead',
          documents: [
            'drug_substance',
            'drug_product',
            'manufacturing_process',
            'stability_data',
            'analytical_methods'
          ],
          estimatedHours: 150,
          sourceDataRequired: [
            'batch_records',
            'stability_studies',
            'analytical_validation'
          ]
        },
        {
          id: 'module-5',
          name: 'Module 5: Pharmacology & Toxicology',
          owner: 'toxicologist',
          documents: [
            'pharm_tox_summary',
            'pharmacology_reports',
            'toxicology_reports'
          ],
          estimatedHours: 100,
          sourceDataRequired: [
            'glp_tox_reports',
            'adme_studies',
            'safety_pharmacology'
          ]
        }
      ],
      autoTransitionCriteria: {
        condition: 'all_modules_80_percent',
        allowEarlyTransition: true
      }
    },
    {
      id: 'stage-4',
      name: 'Internal Review',
      order: 4,
      tasks: [
        {
          id: 'qa-review',
          name: 'Quality Assurance Review',
          assignedRole: 'qa_manager',
          estimatedHours: 40,
          autoChecks: [
            'compliance_score',
            'reference_validation',
            'format_check',
            'signature_completeness'
          ]
        },
        {
          id: 'medical-review',
          name: 'Medical Review',
          assignedRole: 'medical_director',
          estimatedHours: 24,
          parallelWith: ['qa-review']
        },
        {
          id: 'regulatory-review',
          name: 'Regulatory Strategy Review',
          assignedRole: 'ra_director',
          estimatedHours: 16,
          parallelWith: ['qa-review', 'medical-review']
        },
        {
          id: 'final-approval',
          name: 'Executive Approval',
          assignedRole: 'ceo',
          estimatedHours: 2,
          dependencies: ['qa-review', 'medical-review', 'regulatory-review'],
          requiresSignature: true
        }
      ],
      autoTransitionCriteria: {
        condition: 'all_approvals_received'
      }
    },
    {
      id: 'stage-5',
      name: 'eCTD Compilation & Submission Prep',
      order: 5,
      tasks: [
        {
          id: 'ectd-assembly',
          name: 'Assemble eCTD Package',
          assignedRole: 'regulatory_ops',
          estimatedHours: 24,
          automated: true // System auto-generates eCTD structure
        },
        {
          id: 'ectd-validation',
          name: 'eCTD Technical Validation',
          assignedRole: 'regulatory_ops',
          estimatedHours: 8,
          toolRequired: 'ectd_validator'
        },
        {
          id: 'final-qc',
          name: 'Final Quality Check',
          assignedRole: 'qa_manager',
          estimatedHours: 16,
          autoChecks: [
            'file_integrity',
            'hyperlink_validation',
            'bookmark_check',
            'pdf_properties'
          ]
        }
      ],
      autoTransitionCriteria: {
        condition: 'ectd_validated',
        requiredChecks: ['all_auto_checks_pass']
      }
    },
    {
      id: 'stage-6',
      name: 'Submission',
      order: 6,
      tasks: [
        {
          id: 'esg-submission',
          name: 'Submit via ESG',
          assignedRole: 'regulatory_ops',
          estimatedHours: 4
        },
        {
          id: 'confirmation-tracking',
          name: 'Track Submission Confirmation',
          assignedRole: 'regulatory_ops',
          estimatedHours: 2,
          autoMonitor: true // System monitors for FDA receipt
        },
        {
          id: 'archive-submission',
          name: 'Archive Submission Package',
          assignedRole: 'regulatory_ops',
          estimatedHours: 4,
          automated: true // Auto-archive to eTMF
        }
      ],
      finalStage: true
    },
    {
      id: 'stage-7',
      name: 'Post-Submission (FDA Review Phase)',
      order: 7,
      optional: true, // Activates only after submission
      tasks: [
        {
          id: 'track-review',
          name: 'Monitor FDA Review Status',
          assignedRole: 'ra_lead',
          estimatedHours: 4,
          recurring: 'weekly'
        },
        {
          id: 'respond-ir',
          name: 'Respond to Information Requests',
          assignedRole: 'ra_lead',
          estimatedHours: 'variable',
          triggerBased: true, // Activated when FDA sends IR
          slaTarget: '30_days'
        },
        {
          id: 'clinical-hold-response',
          name: 'Clinical Hold Response (if applicable)',
          assignedRole: 'ra_lead',
          estimatedHours: 200,
          triggerBased: true,
          slaTarget: '30_days',
          criticalPath: true
        }
      ]
    }
  ],

  // Intelligent orchestration rules
  orchestrationRules: {
    autoAssignByRole: true,
    balanceWorkload: true,
    enforceDependencies: true,
    predictBottlenecks: true,
    escalateOverdue: {
      warning: '2_days_before_due',
      escalate: '1_day_overdue'
    },
    resourceLimits: {
      maxSimultaneousModules: 3, // Don't overload individuals
      maxWeeklyHours: 50
    }
  }
};
```

#### 3.1.2 Workflow Execution Engine

```typescript
class WorkflowOrchestrator {
  private workflow: Workflow;
  private projectState: ProjectState;

  async initialize(submissionType: SubmissionType): Promise<void> {
    // Load submission-type-specific workflow
    this.workflow = WorkflowRegistry.get(submissionType);
    
    // Create project structure
    await this.createProjectStructure();
    
    // Auto-assign initial tasks
    await this.autoAssignTasks(this.workflow.stages[0]);
    
    // Start monitoring
    await this.startMonitoring();
  }

  async autoTransition(): Promise<void> {
    const currentStage = this.getCurrentStage();
    const criteria = currentStage.autoTransitionCriteria;

    if (await this.evaluateCriteria(criteria)) {
      // Transition to next stage
      await this.transitionToStage(currentStage.order + 1);
      
      // Auto-assign next stage tasks
      await this.autoAssignTasks(this.getNextStage());
      
      // Notify team
      await this.notifyTeam(`Stage ${currentStage.name} completed. Starting ${this.getNextStage().name}`);
    }
  }

  async detectBottleneck(): Promise<Bottleneck | null> {
    // Analyze critical path
    const criticalTasks = this.getCriticalPathTasks();
    
    // Check for:
    // 1. Overdue tasks on critical path
    // 2. Resource unavailability
    // 3. Dependency deadlocks
    // 4. Projected deadline misses

    for (const task of criticalTasks) {
      if (task.isOverdue() || task.projectedMiss()) {
        return {
          type: 'critical_task_delay',
          task: task,
          impact: await this.calculateDelayImpact(task),
          recommendations: await this.generateMitigationPlan(task)
        };
      }
    }

    return null;
  }

  async autoReassign(task: Task): Promise<void> {
    // Current assignee unavailable/overloaded
    const currentAssignee = task.assignedTo;
    
    // Find available resource with same role
    const alternateAssignee = await this.findAlternateResource(
      task.requiredRole,
      task.estimatedHours
    );

    if (alternateAssignee) {
      await this.reassignTask(task, alternateAssignee);
      await this.notifyReassignment(task, currentAssignee, alternateAssignee);
    } else {
      // No available resource - escalate
      await this.escalateResourceShortage(task);
    }
  }

  private async startMonitoring(): Promise<void> {
    // Real-time monitoring loop
    setInterval(async () => {
      await this.checkAutoTransitions();
      await this.detectBottlenecks();
      await this.updateTimeline();
      await this.calculateRiskScore();
    }, 60000); // Every minute
  }
}
```

### 3.2 Natural Language Workflow Interaction

**Users interact with workflows via chat:**

```
User: "What's blocking the IND submission?"

Lumen: "Analyzing IND-2025-003 workflow...

Current Stage: Module Preparation (Stage 3)
Progress: 67% complete

🔴 BLOCKER DETECTED:
Module 2 (Investigator's Brochure) is blocked waiting for toxicology data.

Details:
  - Task: Complete nonclinical toxicology summary
  - Assigned: Dr. Sarah Martinez (Toxicologist)
  - Status: Waiting on GLP study reports from CRO
  - Due: Feb 5, 2026 (9 days)
  - Impact: Module 3 (Protocol) can't start until Module 2 is 100% complete

Dependency Chain:
  Module 2 → Module 3 → Internal Review → Submission
  
If Module 2 delays by 1 week:
  - Submission date slips from March 15 → March 22 (7 days)
  - Delays clinical trial start by 2 weeks (regulatory review + startup)

RECOMMENDED ACTIONS:
1. Contact CRO for GLP report ETA
2. Request draft toxicology data for preliminary Module 2
3. Escalate to Program Lead if CRO delay exceeds 3 more days

Would you like me to:
[A] Send automatic reminder to CRO
[B] Draft escalation email to Program Lead
[C] Reschedule submission date
[D] All of the above"

User: "Send reminder to CRO"

Lumen: "✓ Reminder sent to CRO (Toxicology Services Inc.)
      
Email sent to: cro-pm@toxservices.com
Subject: GLP Study Reports Required - IND-2025-003
Body: [Shows draft email]

I'm now tracking response. I'll alert you if no response within 48 hours.

Is there anything else blocking the IND?"
```

---

## 4. Layer 3: Intelligent Document System

### 4.1 Source Traceability (Inspired by Weave.bio)

**Every claim, table, and figure must link to source data.**

#### 4.1.1 Source Linking Architecture

```typescript
interface SourceLink {
  documentId: string;
  elementId: string; // Specific claim/table/figure
  elementType: 'text_claim' | 'table' | 'figure' | 'citation';
  sourceFiles: SourceFile[];
  extractedAt: Date;
  extractionMethod: 'manual' | 'ai_assisted' | 'automated';
  verificationStatus: 'unverified' | 'verified' | 'flagged';
  verifiedBy?: User;
  verifiedAt?: Date;
}

interface SourceFile {
  fileId: string;
  fileName: string;
  fileType: string;
  location: string; // S3 path, LIMS ID, EDC study ID, etc.
  relevantSection?: string; // Page number, table number, etc.
  dataHash: string; // SHA-256 of source data
  lastModified: Date;
}

class SourceTraceabilityEngine {
  async linkClaimToSource(
    documentId: string,
    claim: string,
    sourceFile: SourceFile
  ): Promise<SourceLink> {
    // Create bidirectional link
    const link = await this.createSourceLink({
      documentId,
      claim,
      sourceFile,
      extractedAt: new Date(),
      dataHash: this.computeHash(claim)
    });

    // Store in traceability matrix
    await this.updateTraceabilityMatrix(link);

    return link;
  }

  async validateAgainstSource(
    documentId: string,
    elementId: string
  ): Promise<ValidationResult> {
    // Get source link
    const link = await this.getSourceLink(documentId, elementId);
    
    // Fetch current source data
    const currentSourceData = await this.fetchSourceData(link.sourceFiles);
    
    // Compare document claim with source
    const matches = await this.compareWithSource(
      link.claim,
      currentSourceData
    );

    if (!matches) {
      return {
        valid: false,
        issue: 'source_changed',
        currentSourceData,
        documentClaim: link.claim,
        recommendation: 'Update document to reflect new source data'
      };
    }

    return { valid: true };
  }

  async detectSourceChanges(): Promise<SourceChangeAlert[]> {
    // Monitor source files for changes
    const allLinks = await this.getAllSourceLinks();
    const alerts: SourceChangeAlert[] = [];

    for (const link of allLinks) {
      const sourceFile = link.sourceFiles[0];
      const currentHash = await this.fetchSourceHash(sourceFile);

      if (currentHash !== sourceFile.dataHash) {
        // Source data changed!
        alerts.push({
          documentId: link.documentId,
          elementId: link.elementId,
          sourceFile: sourceFile.fileName,
          change: 'source_data_modified',
          impact: 'document_claim_may_be_outdated',
          actionRequired: 'review_and_update'
        });
      }
    }

    return alerts;
  }
}
```

#### 4.1.2 Source Linking UI

```tsx
// When user clicks any claim in document:

┌──────────────────────────────────────────────────────────────┐
│  Document: Investigator's Brochure - Section 5.3            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  "In the 13-week GLP toxicology study in rats, the NOAEL    │
│   was established at 150 mg/kg/day." [🔗]  ← User clicks    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  SOURCE TRACEABILITY                                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  This claim is linked to:                                    │
│                                                               │
│  📄 13-Week Rat Toxicology Study Report (GLP)               │
│     File: TOX-2024-RAT-001_Final_Report.pdf                 │
│     Section: 4.5.2 (NOAEL Determination), Page 67           │
│     Extracted: Dec 15, 2025                                  │
│     Last Verified: Jan 20, 2026 ✓                           │
│                                                               │
│  Original Text (from source):                                │
│  "Based on the findings of this 13-week repeat-dose         │
│   toxicity study, the no-observed-adverse-effect level      │
│   (NOAEL) was determined to be 150 mg/kg/day in rats."      │
│                                                               │
│  Data Hash: a3f8c... (matches source ✓)                     │
│                                                               │
│  [View Source File] [Re-verify] [Update Claim]              │
│                                                               │
│  Dependency Impact:                                          │
│  This value is also referenced in:                           │
│  • IND Module 5: Toxicology Summary (Section 2.3)          │
│  • Clinical Protocol: Safety Section (Page 45)              │
│  • Investigator's Brochure: Section 3.2                     │
│                                                               │
│  Any changes will propagate to 3 documents ⚠️               │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Living Documents (Auto-Updating)

**Documents automatically update when source data changes.**

#### 4.2.1 Change Propagation Engine

```typescript
class ChangePropagationEngine {
  async detectSourceChange(sourceFileId: string): Promise<void> {
    // Source file modified (e.g., stability study updated)
    
    // 1. Find all documents linked to this source
    const affectedDocs = await this.findAffectedDocuments(sourceFileId);
    
    // 2. For each affected document:
    for (const doc of affectedDocs) {
      // Extract new data from source
      const newData = await this.extractData(sourceFileId);
      
      // Compare with existing data in document
      const changes = await this.detectChanges(doc, newData);
      
      // Generate proposed updates
      const updates = await this.generateUpdates(doc, changes);
      
      // Create review task
      await this.createReviewTask({
        document: doc,
        sourceFile: sourceFileId,
        proposedChanges: updates,
        assignee: doc.owner,
        priority: this.calculatePriority(changes),
        autoApprove: this.isAutoApprovable(changes)
      });
    }
  }

  private isAutoApprovable(changes: Change[]): boolean {
    // Minor changes can auto-approve:
    // - Updated dates
    // - Updated batch numbers
    // - Updated reference numbers
    // But NOT:
    // - Changed values (dosing, endpoints, results)
    // - Changed conclusions
    // - Changed interpretations

    return changes.every(c => 
      c.type === 'date_update' ||
      c.type === 'batch_number_update' ||
      c.type === 'reference_update'
    );
  }

  async propagateApprovedChange(
    reviewTask: ReviewTask,
    approval: Approval
  ): Promise<void> {
    // User approved the change
    
    // 1. Apply change to primary document
    await this.applyChange(reviewTask.document, reviewTask.proposedChanges);
    
    // 2. Find secondary references
    const secondaryDocs = await this.findSecondaryReferences(
      reviewTask.document,
      reviewTask.proposedChanges
    );
    
    // 3. Cascade update to all secondary docs
    for (const secondaryDoc of secondaryDocs) {
      await this.cascadeUpdate(secondaryDoc, reviewTask.proposedChanges);
    }
    
    // 4. Update traceability matrix
    await this.updateTraceability(reviewTask.proposedChanges);
    
    // 5. Notify affected parties
    await this.notifyPropagation(secondaryDocs);
  }
}
```

#### 4.2.2 Change Propagation UI

```tsx
// When source data changes, user receives alert:

┌──────────────────────────────────────────────────────────────┐
│  🔔 SOURCE DATA CHANGE DETECTED                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Stability Study Report Updated                              │
│  File: STAB-2025-001_12Month_Data.xlsx                      │
│  Modified: Jan 27, 2026 09:15 AM                             │
│                                                               │
│  This affects 4 documents in NDA-2025-007:                   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📄 Module 3.2.P.8: Stability Studies                   │  │
│  │                                                         │  │
│  │ Proposed Change:                                       │  │
│  │ - Old: "12-month stability data shows <5% degradation"│  │
│  │ + New: "12-month stability data shows <3% degradation"│  │
│  │                                                         │  │
│  │ Impact: ⭐ POSITIVE (better stability)                │  │
│  │                                                         │  │
│  │ [Preview] [Approve Change] [Reject]                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📄 Module 2.3.P.8: Pharmaceutical Development          │  │
│  │                                                         │  │
│  │ Proposed Change:                                       │  │
│  │ - Old: Stability table (6 months max shown)           │  │
│  │ + New: Add 12-month datapoint (3% degradation)        │  │
│  │                                                         │  │
│  │ [Preview] [Approve Change] [Reject]                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  [Approve All Changes] [Review Individually] [Defer]         │
│                                                               │
│  Secondary Propagation (if approved):                        │
│  • Summary of Product Characteristics (SmPC)                 │
│  • Quality Overall Summary (QOS)                             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Real-Time Compliance Scoring

**Documents are scored in real-time as they're edited.**

#### 4.3.1 Compliance Scoring Engine

```typescript
interface ComplianceScore {
  overall: number; // 0-100
  categories: {
    completeness: number; // All required sections present?
    consistency: number; // IFU consistent? Terminology consistent?
    compliance: number; // CFR citations correct? ICH format followed?
    quality: number; // Readability, clarity, grammar
    traceability: number; // All claims have sources?
  };
  issues: ComplianceIssue[];
}

class ComplianceEngine {
  async scoreDocument(documentId: string): Promise<ComplianceScore> {
    const doc = await this.loadDocument(documentId);
    
    // Run all checks
    const completeness = await this.checkCompleteness(doc);
    const consistency = await this.checkConsistency(doc);
    const compliance = await this.checkCompliance(doc);
    const quality = await this.checkQuality(doc);
    const traceability = await this.checkTraceability(doc);

    // Calculate overall score
    const overall = this.calculateOverall({
      completeness,
      consistency,
      compliance,
      quality,
      traceability
    });

    return {
      overall,
      categories: { completeness, consistency, compliance, quality, traceability },
      issues: await this.getAllIssues(doc)
    };
  }

  private async checkCompleteness(doc: Document): Promise<number> {
    // For IND Module 2 (IB):
    const requiredSections = [
      '1. Table of Contents',
      '2. Summary',
      '3. Introduction',
      '4. Physical, Chemical, Pharmaceutical Properties',
      '5. Nonclinical Studies',
      '6. Effects in Humans',
      '7. Summary of Data and Guidance for Investigator'
    ];

    const presentSections = await this.detectSections(doc);
    const missingCount = requiredSections.filter(
      s => !presentSections.includes(s)
    ).length;

    return ((requiredSections.length - missingCount) / requiredSections.length) * 100;
  }

  private async checkConsistency(doc: Document): Promise<number> {
    // Check cross-document consistency
    const project = await this.getProject(doc.projectId);
    const allDocs = await this.getAllDocuments(project);

    const issues: ConsistencyIssue[] = [];

    // 1. IFU consistency check
    const ifuStatements = await this.extractIFUStatements(allDocs);
    if (new Set(ifuStatements).size > 1) {
      issues.push({
        type: 'inconsistent_ifu',
        severity: 'critical',
        documents: allDocs.map(d => d.id)
      });
    }

    // 2. Terminology consistency
    const terminology = await this.extractTerminology(doc);
    const glossary = await this.getProjectGlossary(project);
    const nonStandardTerms = terminology.filter(
      t => !glossary.includes(t)
    );

    if (nonStandardTerms.length > 0) {
      issues.push({
        type: 'non_standard_terminology',
        severity: 'medium',
        terms: nonStandardTerms
      });
    }

    // 3. Endpoint consistency (protocol vs CSR)
    // ... more checks

    return this.calculateConsistencyScore(issues);
  }

  private async checkCompliance(doc: Document): Promise<number> {
    const issues: ComplianceIssue[] = [];

    // 1. CFR citation validation
    const citations = await this.extractCitations(doc);
    for (const citation of citations) {
      const valid = await this.validateCitation(citation);
      if (!valid) {
        issues.push({
          type: 'invalid_citation',
          severity: 'high',
          citation,
          recommendation: await this.suggestCorrection(citation)
        });
      }
    }

    // 2. ICH format validation
    if (doc.type === 'clinical_study_report') {
      const ich_e3_compliance = await this.validateICHE3Format(doc);
      if (!ich_e3_compliance.valid) {
        issues.push(...ich_e3_compliance.issues);
      }
    }

    // 3. eCTD structure validation
    if (doc.submissionFormat === 'eCTD') {
      const structure = await this.validateECTDStructure(doc);
      if (!structure.valid) {
        issues.push(...structure.issues);
      }
    }

    return this.calculateComplianceScore(issues);
  }
}
```

#### 4.3.2 Real-Time Compliance Dashboard

```tsx
// Embedded in document editor - updates live as user types

┌──────────────────────────────────────────────────────────────┐
│  Document: Clinical Protocol v2.3                            │
│                                                               │
│  Compliance Score: 87/100 🟡                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░  87%              │
│                                                               │
│  ✅ Completeness:    95/100  (1 optional section missing)   │
│  ⚠️  Consistency:    78/100  (3 terminology inconsistencies)│
│  ✅ Compliance:      92/100  (1 outdated citation)          │
│  ✅ Quality:         88/100  (readable, clear)              │
│  🔴 Traceability:   65/100  (12 claims need source links)  │
│                                                               │
│  Critical Issues (Fix Before Submission):                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔴 Section 5.2: Primary endpoint definition           │  │
│  │    inconsistent with IND protocol                      │  │
│  │                                                         │  │
│  │    This Protocol: "Time to disease progression"       │  │
│  │    IND Protocol:  "Progression-free survival"         │  │
│  │                                                         │  │
│  │    [Fix Automatically] [Review Manually]              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Warnings (Recommended Fixes):                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ⚠️  Section 8.1: Citation "21 CFR 312.23" may be      │  │
│  │     outdated. Latest version is "21 CFR 312.23(a)(8)"│  │
│  │                                                         │  │
│  │    [Update Citation]                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  [View All Issues (15)] [Run Full Validation]               │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 Data Integration Pipelines

**Connect to external data sources for automated table generation.**

#### 4.4.1 Data Connector Architecture

```typescript
interface DataConnector {
  id: string;
  name: string;
  type: 'lims' | 'ctms' | 'edc' | 'sas' | 'r' | 'etmf' | 'eln';
  connectionString: string;
  credentials: EncryptedCredentials;
  status: 'connected' | 'disconnected' | 'error';
}

class DataIntegrationEngine {
  private connectors: Map<string, DataConnector> = new Map();

  // Connect to LIMS (Lab Information Management System)
  async connectLIMS(config: LIMSConfig): Promise<void> {
    const connector = await this.createConnector({
      type: 'lims',
      name: config.systemName,
      connectionString: config.apiEndpoint,
      credentials: this.encrypt(config.credentials)
    });

    this.connectors.set('lims', connector);
  }

  // Connect to CTMS (Clinical Trial Management System)
  async connectCTMS(config: CTMSConfig): Promise<void> {
    // Similar to LIMS
  }

  // Connect to EDC (Electronic Data Capture)
  async connectEDC(config: EDCConfig): Promise<void> {
    // Connects to systems like Medidata Rave, Veeva Vault EDC
  }

  // Extract batch data from LIMS
  async extractBatchData(batchNumber: string): Promise<BatchData> {
    const connector = this.connectors.get('lims');
    const rawData = await connector.query({
      type: 'batch_record',
      batchNumber
    });

    return this.parseBatchData(rawData);
  }

  // Generate CMC table from LIMS data
  async generateCMCTable(
    documentId: string,
    tableType: 'batch_analysis' | 'stability' | 'impurities'
  ): Promise<Table> {
    const batchNumbers = await this.getProjectBatches(documentId);
    const batchData = await Promise.all(
      batchNumbers.map(b => this.extractBatchData(b))
    );

    const table = await this.formatCMCTable(batchData, tableType);
    
    // Link to source
    await this.linkTableToSource(documentId, table, {
      sourceType: 'lims',
      batchNumbers,
      extractedAt: new Date()
    });

    return table;
  }

  // Generate clinical data tables from EDC
  async generateDemographicsTable(
    studyId: string
  ): Promise<Table> {
    const connector = this.connectors.get('edc');
    const demographics = await connector.query({
      studyId,
      dataset: 'demographics'
    });

    const table = await this.formatDemographicsTable(demographics);
    
    // Auto-link to source
    await this.linkTableToSource(studyId, table, {
      sourceType: 'edc',
      studyId,
      dataset: 'demographics',
      extractedAt: new Date()
    });

    return table;
  }

  // Import SAS outputs
  async importSASOutput(
    sasFilePath: string,
    targetDocument: string
  ): Promise<ImportResult> {
    // Read SAS dataset
    const sasData = await this.readSASFile(sasFilePath);
    
    // Convert to formatted tables
    const tables = await this.convertSASToTables(sasData);
    
    // Insert into document
    for (const table of tables) {
      await this.insertTable(targetDocument, table);
      await this.linkTableToSource(targetDocument, table, {
        sourceType: 'sas',
        filePath: sasFilePath,
        extractedAt: new Date()
      });
    }

    return {
      tablesCreated: tables.length,
      sourceLinked: true
    };
  }
}
```

#### 4.4.2 Automated Table Generation UI

```tsx
// User experience for data-driven table generation

User: "Generate the batch analysis table for Module 3.2.P.5"

Lumen: "I'll generate the batch analysis table using data from your LIMS.

Connected to: Thermo Fisher LIMS v8.2
Retrieving batch data...

Found 6 batches for Product ABC-123:
  • Batch 2025-001 (Jan 15, 2026)
  • Batch 2025-002 (Jan 18, 2026)
  • Batch 2025-003 (Jan 22, 2026)
  • Batch 2024-012 (Dec 10, 2025)
  • Batch 2024-011 (Dec 5, 2025)
  • Batch 2024-010 (Nov 28, 2025)

Extracting analytical data:
  ✓ Assay (HPLC)
  ✓ Impurities (HPLC)
  ✓ Water content (KF titration)
  ✓ pH
  ✓ Particulates

Generating ICH-formatted table...

[Table appears in artifact panel]

┌──────────────────────────────────────────────────────────────┐
│  Table 3.2.P.5.4-1: Batch Analysis Results                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Batch    Assay    Impurity  Water   pH    Particulates     │
│  Number   (%)      A (%)     (%)           (particles/mL)    │
│  ────────────────────────────────────────────────────────── │
│  2025-001 99.8    0.05      0.3     6.5   <10               │
│  2025-002 99.9    0.04      0.2     6.6   <10               │
│  2025-003 99.7    0.06      0.3     6.4   <10               │
│  2024-012 99.8    0.05      0.3     6.5   <10               │
│  2024-011 99.9    0.04      0.2     6.6   <10               │
│  2024-010 99.8    0.05      0.3     6.5   <10               │
│  ────────────────────────────────────────────────────────── │
│  Spec     98.0-   ≤0.10     ≤0.5    6.0-  <25               │
│           102.0                      7.0                      │
│                                                               │
│  All results meet specifications ✓                           │
│                                                               │
│  📎 Source: Thermo Fisher LIMS (Batches 2024-010 through    │
│             2025-003)                                         │
│  📅 Extracted: Jan 27, 2026 10:45 AM                        │
│  🔗 Click any value to see source certificate of analysis   │
└──────────────────────────────────────────────────────────────┘

The table is ready and source-linked. If any batch data is updated in LIMS, I'll alert you to refresh this table.

Would you like me to generate the stability data table next?"
```

---

## 5. Simplified User Experience

### 5.1 One-Command Project Creation

**Before (v2.0):**
```
1. User clicks "New Project"
2. Fills out form (name, type, jurisdiction)
3. Uploads documents manually
4. Sets custom instructions manually
5. Starts chatting with agent
```

**After (v3.0):**
```
User: "Start a Phase 2 IND for my oncology drug targeting metastatic breast cancer"

System: [Instantly creates entire project structure]
  ✓ IND project created: IND-2026-004
  ✓ Workflow initialized (IND 7-stage workflow)
  ✓ eCTD Module structure created (Modules 1-5)
  ✓ PM Settings applied (IND defaults)
  ✓ Team roles assigned based on org chart
  ✓ Pre-IND meeting request template loaded
  
  I've created your IND project. Based on "Phase 2" and "metastatic breast cancer":
  
  • Study Phase: Phase 2
  • Indication: Metastatic Breast Cancer
  • Product Type: [Need to confirm - small molecule, biologic, other?]
  • Expected enrollment: ~150-300 patients (typical for Phase 2 oncology)
  
  Next steps:
  1. Upload your Phase 1 data (if available)
  2. Provide product information (API, formulation)
  3. Schedule Pre-IND meeting with FDA
  
  Would you like to start with the Pre-IND meeting request, or upload your Phase 1 data first?
```

### 5.2 Auto-Detect Document Type

```
User: [Uploads file "GLP_Toxicology_Study_13Week_Rats.pdf"]

System: "Analyzing document...

Detected: GLP Toxicology Study Report (13-week, Rats)
  Study ID: TOX-2024-001
  Sponsor: BioTech Alpha Inc.
  Test Article: ABC-123 (Drug Substance)
  Species: Sprague-Dawley Rats
  GLP: Yes (compliant)
  
  Key Data Extracted:
  • NOAEL: 150 mg/kg/day
  • MTD: >300 mg/kg/day
  • Target Organs: None identified
  • Reversibility: N/A (no findings)

This document is relevant to:
  ✓ IND Module 5 (Pharmacology/Toxicology)
  ✓ Investigator's Brochure (Section 5: Nonclinical Studies)

I've automatically:
  ✓ Filed to Module 5.3.3 (Repeat-Dose Toxicity)
  ✓ Extracted NOAEL for Investigator's Brochure
  ✓ Created source link for traceability
  
Would you like me to draft the toxicology summary for the IB now?"
```

### 5.3 Unified Google Docs-Style Editor

**No more "view mode" vs "edit mode" toggle.**

```tsx
// Always editable, always tracked

┌──────────────────────────────────────────────────────────────┐
│  Investigator's Brochure - Section 5.2: Toxicology          │
│                                                               │
│  [User types naturally - AI assists inline]                  │
│                                                               │
│  In the 13-week GLP toxicology study in rats, the NOAEL was │
│  established at 150 mg/kg/day.█                              │
│                                                               │
│  💡 AI Suggestion:                                           │
│     Consider adding: "This dose level is 50-fold higher     │
│     than the proposed clinical starting dose (3 mg/kg)."    │
│     [Accept] [Dismiss]                                       │
│                                                               │
│  🔗 Source: TOX-2024-001_Final_Report.pdf (Page 67)         │
│  ✅ Verified: Jan 20, 2026 by Patricia Martinez              │
│                                                               │
│  [Collaboration indicators: James is viewing this section]   │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Chat for Everything

```
User: "Who's reviewing the NDA Module 2.7?"

Lumen: "Module 2.7 (Clinical Summary) in NDA-2025-007:

Current Reviewer: Dr. Jennifer Liu (Medical Director)
  • Assigned: Jan 20, 2026
  • Due: Feb 1, 2026 (5 days remaining)
  • Progress: 60% complete
  • Comments Added: 8
  • Status: In progress

Previous Reviewer: James Martinez (Medical Writer)
  • Completed: Jan 19, 2026
  • Comments Addressed: 12/12

Would you like to:
[A] See review comments
[B] Check review timeline
[C] Send reminder to Jennifer
[D] Reassign review"

User: "C"

Lumen: "✓ Reminder sent to Jennifer Liu
Email: 'Gentle reminder: Module 2.7 Clinical Summary review due Feb 1 (5 days)'

I'll follow up if no progress by Jan 30."
```

---

## 6. Post-Submission Workflow (Weave.bio HAQ Manager Inspired)

### 6.1 Health Authority Question (HAQ) Management

**New Module: Post-Submission Phase**

```typescript
interface HealthAuthorityQuestion {
  id: string;
  submissionId: string;
  questionNumber: string;
  receivedDate: Date;
  dueDate: Date;
  category: 'clinical' | 'cmc' | 'nonclinical' | 'administrative';
  priority: 'routine' | 'urgent' | 'critical';
  questionText: string;
  affectedModules: string[];
  assignedTo: User;
  status: 'received' | 'in_progress' | 'draft_complete' | 'under_review' | 'submitted';
}

class HAQManager {
  async processIncomingQuestion(
    email: EmailFromFDA
  ): Promise<HealthAuthorityQuestion> {
    // Parse FDA email automatically
    const parsed = await this.parseFDAEmail(email);
    
    // Create HAQ record
    const haq = await this.createHAQ({
      submissionId: parsed.indNumber,
      questionNumber: parsed.questionId,
      questionText: parsed.extractedQuestion,
      receivedDate: new Date(),
      dueDate: this.calculateDueDate(parsed.responseDeadline),
      category: await this.categorizeQuestion(parsed.questionText)
    });

    // Auto-assign based on category
    const assignee = await this.autoAssign(haq.category);
    await this.assign(haq, assignee);

    // Identify affected documents
    const affectedDocs = await this.identifyAffectedDocuments(haq);
    
    // Create response workflow
    await this.createResponseWorkflow(haq, affectedDocs);

    // Notify assignee
    await this.notifyAssignee(haq, assignee);

    return haq;
  }

  async generateResponseDraft(haq: HealthAuthorityQuestion): Promise<Document> {
    // Pull relevant sections from original submission
    const relevantSections = await this.extractRelevantSections(
      haq.submissionId,
      haq.affectedModules
    );

    // Generate response using AI
    const draft = await this.aiGenerateResponse({
      question: haq.questionText,
      relevantSections,
      submissionContext: await this.getSubmissionContext(haq.submissionId),
      fdaGuidance: await this.getFDAGuidance(haq.category)
    });

    // Create document with source links
    const responseDoc = await this.createResponseDocument({
      haq,
      draft,
      sourceLinks: await this.createSourceLinks(draft, relevantSections)
    });

    return responseDoc;
  }

  async trackResponseTimeline(haq: HealthAuthorityQuestion): Promise<void> {
    // Monitor progress toward deadline
    const daysRemaining = this.calculateDaysRemaining(haq.dueDate);

    if (daysRemaining <= 7 && haq.status !== 'submitted') {
      await this.escalateUrgent(haq);
    }

    if (daysRemaining <= 3 && haq.status !== 'submitted') {
      await this.escalateCritical(haq);
    }
  }
}
```

### 6.2 HAQ Response Workflow

```
FDA Question Received
  ↓
Auto-Parsed & Categorized
  ↓
Assigned to Subject Matter Expert
  ↓
AI Generates Draft Response (pulls from original submission)
  ↓
SME Reviews & Refines
  ↓
QA Review (compliance check)
  ↓
RA Lead Approval
  ↓
Submitted to FDA via ESG
  ↓
Track Acceptance/Follow-up
```

**User Experience:**

```
User: "Did we get any FDA questions on the IND?"

Lumen: "Yes, FDA sent 3 questions on Jan 25, 2026 regarding IND-2025-003:

Question 1 (Clinical):
  FDA: 'Provide additional justification for the proposed starting dose of 50mg.'
  Category: Clinical Pharmacology
  Due: Feb 24, 2026 (28 days remaining)
  Status: Draft complete ✅
  Assigned: Dr. Marcus Chen (Clinical Pharmacologist)
  
Question 2 (CMC):
  FDA: 'Clarify the impurity specification for Impurity A.'
  Category: Chemistry, Manufacturing, Controls
  Due: Feb 24, 2026 (28 days remaining)
  Status: In progress 🟡
  Assigned: Dr. Rodriguez (CMC Lead)
  Progress: 40%
  
Question 3 (Nonclinical):
  FDA: 'Provide the full study report for the 13-week rat toxicology study.'
  Category: Pharmacology/Toxicology
  Due: Feb 24, 2026 (28 days remaining)
  Status: Complete, awaiting QA review ✅
  Assigned: Dr. Sarah Martinez (Toxicologist)

Overall Response Package:
  Progress: 80% complete
  On track for submission by Feb 20 (4 days ahead of deadline)

Would you like to:
[A] Review draft responses
[B] See detailed timeline
[C] Generate response package
[D] Submit to FDA"
```

---

## 7. CRO-Specific Enhancements

### 7.1 Multi-Client Management

```typescript
interface CROClient {
  id: string;
  name: string;
  parentOrgId: string; // CRO organization
  tier: 'startup' | 'biotech' | 'pharma';
  billingModel: 'hourly' | 'per_document' | 'retainer';
  hourlyRate?: number;
  whiteLabel: boolean;
  brandingConfig?: BrandingConfig;
  pmSettingsTemplate: PMSettings;
  documentTemplates: string[]; // Custom template IDs
}

class CROManagement {
  async createClientEngagement(
    clientId: string,
    projectType: SubmissionType
  ): Promise<Project> {
    const client = await this.getClient(clientId);
    
    // Create project with client-specific settings
    const project = await this.createProject({
      clientId,
      type: projectType,
      pmSettings: client.pmSettingsTemplate, // Client-specific defaults
      branding: client.whiteLabel ? client.brandingConfig : null,
      templates: client.documentTemplates
    });

    // Initialize billing tracker
    await this.initializeBilling(project, client.billingModel);

    return project;
  }

  async trackBillableTime(
    projectId: string,
    activity: Activity,
    hours: number
  ): Promise<void> {
    const project = await this.getProject(projectId);
    const client = await this.getClient(project.clientId);

    // Record billable activity
    await this.recordBillableHours({
      projectId,
      clientId: client.id,
      activity,
      hours,
      rate: client.hourlyRate,
      amount: hours * client.hourlyRate,
      timestamp: new Date()
    });

    // Update client invoice
    await this.updateInvoice(client.id, hours * client.hourlyRate);
  }

  async generateClientReport(
    clientId: string,
    period: DateRange
  ): Promise<ClientReport> {
    const projects = await this.getClientProjects(clientId, period);
    const billing = await this.getBillingData(clientId, period);

    return {
      client: await this.getClient(clientId),
      period,
      activeProjects: projects.filter(p => p.status === 'active').length,
      completedSubmissions: projects.filter(p => p.status === 'submitted').length,
      totalHours: billing.totalHours,
      totalCost: billing.totalCost,
      documentsCreated: await this.countDocuments(projects),
      averageSubmissionTime: await this.calculateAvgTime(projects)
    };
  }
}
```

### 7.2 Client Portal (Read-Only Access)

**External-facing portal for biotech clients of CROs:**

```tsx
// Client Portal Interface (biotech client logs in)

┌──────────────────────────────────────────────────────────────┐
│  CLIENT PORTAL - BioTech Alpha Inc.                          │
│  Serviced by: Regulatory Solutions CRO                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Active Projects                                              │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔬 IND-2025-003: Oncology Drug ABC                    │  │
│  │                                                         │  │
│  │ Progress: ████████████░░░░ 78%                        │  │
│  │ Stage: Module Preparation (Stage 3 of 6)              │  │
│  │ Target Submission: March 15, 2026 (47 days)           │  │
│  │ Status: On Track ✅                                    │  │
│  │                                                         │  │
│  │ Recent Activity:                                       │  │
│  │ • Module 2 (IB) completed - Jan 25                    │  │
│  │ • Module 3 (Protocol) 80% complete                    │  │
│  │ • CMC sections in progress                            │  │
│  │                                                         │  │
│  │ [View Documents] [Download Progress Report]           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Documents (Read-Only)                                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📄 Investigator's Brochure v3.2 (Final) - Jan 25     │  │
│  │ 📄 Clinical Protocol v2.1 (Draft) - Jan 27           │  │
│  │ 📄 CMC Drug Substance v1.5 (In Review) - Jan 26      │  │
│  │                                                         │  │
│  │ [View] [Download] [Request Changes]                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  Billing Summary (Current Month)                             │
│  Hours: 142.5 | Amount: $71,250                              │
│  [View Detailed Invoice]                                     │
│                                                               │
│  Messages                                                     │
│  [Send Message to CRO Team]                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Roadmap (Revised)

### Phase 1: Foundation + Mission Control (Weeks 1-4)

```yaml
Week 1: Core Infrastructure
  - PostgreSQL schemas (revised with new tables)
  - Workflow engine core
  - Mission Control dashboard skeleton
  - Portfolio view
  
Week 2: Workflow Orchestration
  - IND workflow definition
  - 510k workflow definition
  - NDA workflow definition
  - Auto-transition logic
  - Task assignment engine

Week 3: Mission Control Features
  - Resource allocator
  - Regulatory intelligence feeds
  - Cross-project dependency tracking
  - Bottleneck detection

Week 4: Integration Foundation
  - Data connector architecture
  - Source traceability schema
  - Compliance scoring engine
```

### Phase 2: Intelligent Document System (Weeks 5-8)

```yaml
Week 5: Source Traceability
  - Source linking engine
  - Traceability matrix
  - Source verification
  - Change detection

Week 6: Living Documents
  - Change propagation engine
  - Auto-update workflows
  - Impact analysis
  - Cascade updates

Week 7: Data Integrations
  - LIMS connector
  - EDC connector
  - SAS/R import
  - Automated table generation

Week 8: Compliance Engine
  - Real-time scoring
  - CFR citation validation
  - ICH format checking
  - eCTD validation
```

### Phase 3: Advanced Features (Weeks 9-12)

```yaml
Week 9: CRO Features
  - Multi-client management
  - Client portal
  - Billing tracker
  - White-label support

Week 10: Post-Submission
  - HAQ Manager
  - FDA email parsing
  - Response workflow
  - Amendment tracking

Week 11: User Experience Polish
  - One-command project creation
  - Auto-detect document type
  - Unified editor
  - Natural language improvements

Week 12: Testing & Deployment
  - End-to-end workflow tests
  - Performance optimization
  - Security audit
  - Production deployment
```

---

## 9. Technology Stack (Updated)

```yaml
Frontend:
  - React 18+ (TypeScript)
  - Tailwind CSS
  - Radix UI (accessible components)
  - TanStack Query (data fetching)
  - Zustand (state management)
  - ProseMirror (document editor)
  - D3.js (visualizations)

Backend:
  - Node.js 20+ (TypeScript)
  - Express.js
  - tRPC (type-safe API)
  - Zod (validation)

Database:
  - PostgreSQL 16 (Neon)
  - pgvector (embeddings)
  - Redis (caching, real-time)

AI:
  - KIMI AI (primary)
  - OpenAI GPT-4 (backup)
  - Claude Opus 4.5 (complex reasoning)

Data Integrations:
  - Node-RED (workflow integration)
  - Apache Kafka (event streaming)
  - REST APIs (LIMS, CTMS, EDC)

File Storage:
  - AWS S3 (documents)
  - CloudFront (CDN)

Monitoring:
  - Prometheus (metrics)
  - Grafana (dashboards)
  - Winston (logging)
  - Sentry (errors)

Infrastructure:
  - Docker (containerization)
  - Kubernetes (orchestration)
  - GitHub Actions (CI/CD)
```

---

## 10. Success Metrics (Enhanced)

### 10.1 Operational Metrics

```typescript
interface OperationalMetrics {
  // Workflow efficiency
  avgSubmissionPrepTime: number; // Target: 4 weeks (vs 12 weeks manual)
  bottleneckDetectionTime: number; // Target: <1 hour (real-time)
  autoTransitionAccuracy: number; // Target: 95%
  
  // Resource optimization
  resourceUtilization: number; // Target: 85% (no overallocation)
  workloadBalanceScore: number; // Target: >90%
  
  // Document quality
  firstTimeApprovalRate: number; // Target: 70% (vs 25% industry)
  complianceScoreAvg: number; // Target: >90/100
  sourceTraceabilityRate: number; // Target: 100% (all claims linked)
  
  // Data integration
  manualDataEntryReduction: number; // Target: 80% reduction
  tableGenerationTime: number; // Target: <5 min (vs 2+ hours)
  
  // Post-submission
  haqResponseTime: number; // Target: <20 days (vs 30 day deadline)
  haqQualityScore: number; // Target: FDA accepts without additional questions
}
```

### 10.2 Business Metrics

```typescript
interface BusinessMetrics {
  // Time savings
  totalTimeSaved: number; // hours per submission
  costSavingsPerSubmission: number; // dollars
  
  // CRO-specific
  clientSatisfactionScore: number; // Target: >4.5/5
  billingAccuracy: number; // Target: 100%
  clientRetentionRate: number; // Target: >95%
  
  // Competitive
  timeToMarketReduction: number; // Target: 40% faster
  deficiencyRate: number; // Target: <30% (vs 75%)
}
```

---

## Conclusion

This v3.0 revision represents a complete transformation of Concept2Cure from a "Claude.ai-style interface with regulatory AI" to a **comprehensive Regulatory Operating System** that:

✅ **Orchestrates** entire submission lifecycles with intelligent workflows  
✅ **Monitors** portfolio-wide status in real-time  
✅ **Integrates** with data sources (LIMS/CTMS/EDC) for automated document generation  
✅ **Traces** every claim to source data (Weave.bio-style)  
✅ **Scores** compliance in real-time as documents are edited  
✅ **Propagates** changes intelligently across linked documents  
✅ **Manages** post-submission FDA questions (HAQ Manager)  
✅ **Supports** CRO multi-client operations with white-label options  
✅ **Simplifies** UX with one-command project creation and natural language everything  

The result: A platform that doesn't just help create documents—it **orchestrates the entire regulatory submission process from concept to approval**.

*Next Step: Begin Phase 1 implementation with Mission Control dashboard and workflow engine.*
