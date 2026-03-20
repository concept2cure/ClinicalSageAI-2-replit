// ============================================================================
// Concept2Cure Enablement Platform - Data Models & Static Data
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIMode = 'dr-sage' | 'ana' | 'both';

export interface LearningPath {
  id: string;
  title: string;
  role: string;
  promise: string;
  businessOutcome: string;
  estimatedTime: string;
  moduleIds: string[];
  certificationIds: string[];
  icon: string;
  color: string;
  aiHighlight: string;
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  category: string;
  roles: string[];
  clientTypes: string[];
  workflows: string[];
  productAreas: string[];
  certificationTrack: string;
  maturityLevel: number;
  aiMode: AIMode;
  estimatedMinutes: number;
  lessons: { title: string; description: string }[];
  status: 'available' | 'coming-soon';
  relatedCertificationId: string;
}

export interface Certification {
  id: string;
  title: string;
  description: string;
  competence: string;
  focus: 'dr-sage' | 'ana' | 'combined';
  requiredModuleIds: string[];
  badge: { from: string; to: string };
  unlockCriteria: string;
}

export interface ReleaseNote {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'feature' | 'improvement' | 'ai-update';
  impactArea: 'dr-sage' | 'ana' | 'both' | 'platform';
  ctaLabel?: string;
  ctaAction?: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'complete' | 'blocked' | 'action-needed';
  actor: 'dr-sage' | 'ana' | 'both';
  objectContext?: string;
  actionCta?: string;
}

export interface WorkflowScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  steps: WorkflowStep[];
}

export interface DrSageAction {
  id: string;
  label: string;
  description: string;
  type: 'help' | 'guide' | 'do-it' | 'ask-ana' | 'fix' | 'learn' | 'discover';
}

export interface ContextProfile {
  productType: string;
  userRole: string;
  clientType: string;
  activeProject?: string;
  activeModule?: string;
  workflowStage?: string;
}

// ---------------------------------------------------------------------------
// Learning Paths
// ---------------------------------------------------------------------------

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'path-regulatory-writer',
    title: 'Regulatory Writer',
    role: 'Regulatory Writer / Medical Writer',
    promise: 'Master governed document creation with AI-assisted drafting',
    businessOutcome:
      'Reduce first-draft cycle time by 60% while maintaining 21 CFR Part 11 compliance across all authored sections.',
    estimatedTime: '12 hours',
    moduleIds: [
      'mod-onboarding-platform',
      'mod-authoring-fundamentals',
      'mod-authoring-advanced',
      'mod-governance-basics',
      'mod-dossier-placement',
      'mod-export-readiness',
    ],
    certificationIds: ['cert-ana-fundamentals', 'cert-operations-master'],
    icon: 'FileEdit',
    color: '#6366f1',
    aiHighlight:
      'Dr. Sage guides you through document templates and section scaffolding while AnA 1.0 validates regulatory language, cross-references predicate evidence, and flags compliance gaps in real time.',
  },
  {
    id: 'path-regulatory-strategist',
    title: 'Regulatory Strategist',
    role: 'Regulatory Affairs Strategist / RA Lead',
    promise: 'Lead RI-grade evidence review and submission strategy with AnA 1.0',
    businessOutcome:
      'Increase submission acceptance rates by identifying evidence gaps 3x earlier in the regulatory lifecycle.',
    estimatedTime: '14 hours',
    moduleIds: [
      'mod-onboarding-platform',
      'mod-evidence-fundamentals',
      'mod-evidence-advanced',
      'mod-review-audit-basics',
      'mod-review-audit-advanced',
      'mod-dual-ai-strategy',
      'mod-platform-mastery',
    ],
    certificationIds: ['cert-intelligence-specialist', 'cert-compliance-champion'],
    icon: 'Target',
    color: '#8b5cf6',
    aiHighlight:
      'AnA 1.0 surfaces predicate device comparisons, literature contradictions, and regulatory precedent while Dr. Sage walks you through strategic gap analysis and submission pathway recommendations.',
  },
  {
    id: 'path-quality-cmc',
    title: 'Quality / CMC Specialist',
    role: 'Quality Assurance / CMC Specialist',
    promise: 'Manage Module 3 quality documentation with governed workflows',
    businessOutcome:
      'Achieve zero critical findings in CMC documentation audits through governed authoring and automated cross-referencing.',
    estimatedTime: '10 hours',
    moduleIds: [
      'mod-onboarding-platform',
      'mod-authoring-fundamentals',
      'mod-governance-basics',
      'mod-governance-advanced',
      'mod-dossier-placement',
      'mod-export-readiness',
    ],
    certificationIds: ['cert-ana-fundamentals', 'cert-compliance-champion'],
    icon: 'ShieldCheck',
    color: '#0ea5e9',
    aiHighlight:
      'Dr. Sage enforces section-level governance rules and version control while AnA 1.0 cross-validates manufacturing specifications against ICH Q8/Q9/Q10 requirements and flags discrepancies.',
  },
  {
    id: 'path-clinical-ops',
    title: 'Clinical Operations',
    role: 'Clinical Operations Manager / Submissions Lead',
    promise: 'Oversee clinical submissions, trial data integration, and audit readiness',
    businessOutcome:
      'Cut submission preparation time by 45% and maintain perpetual audit-ready state across all active clinical programs.',
    estimatedTime: '11 hours',
    moduleIds: [
      'mod-onboarding-platform',
      'mod-evidence-fundamentals',
      'mod-review-audit-basics',
      'mod-review-audit-advanced',
      'mod-governance-basics',
      'mod-export-readiness',
      'mod-dual-ai-operations',
    ],
    certificationIds: ['cert-operations-master', 'cert-compliance-champion'],
    icon: 'Activity',
    color: '#10b981',
    aiHighlight:
      'Dr. Sage orchestrates multi-section audit checklists and readiness workflows while AnA 1.0 continuously monitors trial data integrity, CSR consistency, and regulatory timeline adherence.',
  },
  {
    id: 'path-executive-overview',
    title: 'Executive Overview',
    role: 'VP Regulatory / Chief Medical Officer / Program Director',
    promise: 'Gain visibility into submission readiness, risk, and team output',
    businessOutcome:
      'Make data-driven go/no-go decisions with real-time portfolio-level submission health metrics and risk scoring.',
    estimatedTime: '4 hours',
    moduleIds: [
      'mod-onboarding-platform',
      'mod-executive-dashboards',
      'mod-dual-ai-strategy',
      'mod-platform-mastery',
    ],
    certificationIds: ['cert-platform-expert'],
    icon: 'BarChart3',
    color: '#f59e0b',
    aiHighlight:
      'Dr. Sage provides executive-level summaries and risk narratives while AnA 1.0 delivers real-time portfolio analytics, cross-program evidence coverage scores, and predictive submission outcome modeling.',
  },
];

// ---------------------------------------------------------------------------
// Learning Modules
// ---------------------------------------------------------------------------

export const LEARNING_MODULES: LearningModule[] = [
  // -- Onboarding --
  {
    id: 'mod-onboarding-platform',
    title: 'Platform Orientation & Navigation',
    description:
      'Get familiar with the Concept2Cure workspace, navigation, user settings, and the dual-AI assistant paradigm (Dr. Sage + AnA 1.0).',
    category: 'onboarding',
    roles: ['writer', 'strategist', 'quality', 'clinical-ops', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['setup', 'navigation'],
    productAreas: ['platform'],
    certificationTrack: 'cert-ana-fundamentals',
    maturityLevel: 1,
    aiMode: 'both',
    estimatedMinutes: 30,
    lessons: [
      { title: 'Welcome to Concept2Cure', description: 'Overview of the platform mission, regulatory intelligence capabilities, and the dual-AI model.' },
      { title: 'Workspace Layout & Navigation', description: 'Navigate the sidebar, command palette, project switcher, and contextual panels.' },
      { title: 'Meet Dr. Sage & AnA 1.0', description: 'Understand the distinct roles: Dr. Sage as your operational co-pilot, AnA 1.0 as your evidence intelligence engine.' },
      { title: 'Setting Up Your Profile', description: 'Configure role, therapeutic area, preferred regulatory frameworks, and notification preferences.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-ana-fundamentals',
  },
  // -- Evidence Intelligence --
  {
    id: 'mod-evidence-fundamentals',
    title: 'Evidence Intelligence Fundamentals',
    description:
      'Learn how AnA 1.0 discovers, ranks, and cross-references regulatory evidence from FDA databases, clinical literature, and predicate device histories.',
    category: 'evidence-intelligence',
    roles: ['strategist', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['evidence-search', 'literature-review'],
    productAreas: ['ana-engine', 'evidence-graph'],
    certificationTrack: 'cert-intelligence-specialist',
    maturityLevel: 2,
    aiMode: 'ana',
    estimatedMinutes: 45,
    lessons: [
      { title: 'The Evidence Graph', description: 'How AnA 1.0 builds and maintains a knowledge graph of regulatory evidence, device predicates, and clinical outcomes.' },
      { title: 'Searching & Filtering Evidence', description: 'Use structured queries, semantic search, and faceted filters to locate relevant evidence across FDA 510(k), PMA, De Novo, and global databases.' },
      { title: 'Evidence Scoring & Relevance', description: 'Understand the RI-grade scoring methodology AnA 1.0 uses to rank evidence by regulatory relevance, recency, and provenance quality.' },
      { title: 'Provenance & Citation Chains', description: 'Trace any evidence assertion back to its source document with full citation lineage and confidence scoring.' },
      { title: 'Exporting Evidence Packages', description: 'Generate evidence summary packages for internal review or regulatory submission appendices.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-intelligence-specialist',
  },
  {
    id: 'mod-evidence-advanced',
    title: 'Advanced Evidence Analysis & Comparative Intelligence',
    description:
      'Master AnA 1.0 comparative analysis: predicate equivalence mapping, literature contradiction detection, and cross-jurisdictional evidence alignment.',
    category: 'evidence-intelligence',
    roles: ['strategist'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['predicate-comparison', 'gap-analysis'],
    productAreas: ['ana-engine', 'evidence-graph', 'comparative-analysis'],
    certificationTrack: 'cert-intelligence-specialist',
    maturityLevel: 3,
    aiMode: 'ana',
    estimatedMinutes: 60,
    lessons: [
      { title: 'Predicate Equivalence Mapping', description: 'Use AnA 1.0 to build substantial equivalence arguments by mapping device characteristics against predicate portfolios.' },
      { title: 'Literature Contradiction Detection', description: 'Identify conflicting clinical evidence across publications and understand how AnA 1.0 flags discrepancies for reviewer attention.' },
      { title: 'Cross-Jurisdictional Alignment', description: 'Compare FDA, EMA, PMDA, and TGA regulatory requirements and map evidence coverage across jurisdictions.' },
      { title: 'Gap Analysis & Risk Scoring', description: 'Generate automated gap analysis reports with risk-weighted scoring to prioritize evidence acquisition.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-intelligence-specialist',
  },
  // -- Authoring --
  {
    id: 'mod-authoring-fundamentals',
    title: 'Governed Authoring Fundamentals',
    description:
      'Create regulatory documents using AI-assisted drafting with Dr. Sage guidance, template management, and section-level governance controls.',
    category: 'authoring',
    roles: ['writer', 'quality'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['document-creation', 'template-management'],
    productAreas: ['authoring-engine', 'templates'],
    certificationTrack: 'cert-operations-master',
    maturityLevel: 2,
    aiMode: 'dr-sage',
    estimatedMinutes: 50,
    lessons: [
      { title: 'Template Library & Selection', description: 'Browse ICH CTD, FDA eCTD, and custom templates; understand template inheritance and section scaffolding.' },
      { title: 'AI-Assisted First Drafts', description: 'Let Dr. Sage generate section drafts from structured inputs, prior submissions, and evidence packages.' },
      { title: 'Section-Level Governance', description: 'Apply approval workflows, lock states, and reviewer assignments at the section level.' },
      { title: 'Inline Evidence Linking', description: 'Embed AnA 1.0 evidence references directly into authored sections with automatic citation formatting.' },
      { title: 'Version Control & Change Tracking', description: 'Manage document versions, compare revisions, and generate change justification logs.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-operations-master',
  },
  {
    id: 'mod-authoring-advanced',
    title: 'Advanced Authoring & Multi-Section Orchestration',
    description:
      'Orchestrate complex multi-section documents, manage cross-references, and leverage Dr. Sage co-execution for parallel section drafting.',
    category: 'authoring',
    roles: ['writer'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['multi-section-authoring', 'cross-reference-management'],
    productAreas: ['authoring-engine', 'cross-references'],
    certificationTrack: 'cert-operations-master',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 55,
    lessons: [
      { title: 'Multi-Section Orchestration', description: 'Coordinate drafting across CTD modules with dependency tracking and parallel authoring workflows.' },
      { title: 'Cross-Reference Management', description: 'Build and maintain cross-reference networks across sections, modules, and supporting documents.' },
      { title: 'Dr. Sage Co-Execution Mode', description: 'Enable Dr. Sage to draft sections in parallel while you review, edit, and approve in real time.' },
      { title: 'Regulatory Language Validation', description: 'Use AnA 1.0 to validate regulatory terminology, check for ambiguous phrasing, and ensure jurisdictional compliance.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-operations-master',
  },
  // -- Governance --
  {
    id: 'mod-governance-basics',
    title: 'Governance & Compliance Basics',
    description:
      'Understand the governance framework: approval workflows, electronic signatures, audit trails, and 21 CFR Part 11 compliance controls.',
    category: 'governance',
    roles: ['writer', 'quality', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['approval-workflow', 'e-signatures'],
    productAreas: ['governance-engine', 'audit-trail'],
    certificationTrack: 'cert-compliance-champion',
    maturityLevel: 2,
    aiMode: 'dr-sage',
    estimatedMinutes: 40,
    lessons: [
      { title: 'Governance Framework Overview', description: 'Understand the layered governance model: organization, project, document, and section-level controls.' },
      { title: 'Approval Workflows', description: 'Configure sequential and parallel approval chains with role-based routing and escalation rules.' },
      { title: 'Electronic Signatures & Part 11', description: 'Apply 21 CFR Part 11 compliant electronic signatures with full audit trail capture.' },
      { title: 'Audit Trail Deep Dive', description: 'Navigate the immutable audit log, filter by user/action/date, and export audit packages for inspections.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-compliance-champion',
  },
  {
    id: 'mod-governance-advanced',
    title: 'Advanced Governance & Regulatory Compliance',
    description:
      'Master multi-jurisdictional compliance mapping, automated deviation detection, and continuous compliance monitoring with Dr. Sage alerts.',
    category: 'governance',
    roles: ['quality'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['compliance-monitoring', 'deviation-management'],
    productAreas: ['governance-engine', 'compliance-monitor'],
    certificationTrack: 'cert-compliance-champion',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 50,
    lessons: [
      { title: 'Multi-Jurisdictional Compliance Mapping', description: 'Map governance controls across FDA, EMA, PMDA, and Health Canada requirements simultaneously.' },
      { title: 'Automated Deviation Detection', description: 'Configure AnA 1.0 to continuously scan documents for compliance deviations and flag them for review.' },
      { title: 'Continuous Monitoring Dashboards', description: 'Set up real-time compliance health dashboards with Dr. Sage-powered alert notifications.' },
      { title: 'CAPA Integration & Remediation Tracking', description: 'Link compliance findings to corrective action workflows and track remediation through closure.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-compliance-champion',
  },
  // -- Review & Audit --
  {
    id: 'mod-review-audit-basics',
    title: 'Review & Audit Readiness',
    description:
      'Prepare submissions for internal review and regulatory audit with structured checklists, gap identification, and readiness scoring.',
    category: 'review-audit',
    roles: ['strategist', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['review-cycle', 'audit-preparation'],
    productAreas: ['review-engine', 'audit-readiness'],
    certificationTrack: 'cert-compliance-champion',
    maturityLevel: 2,
    aiMode: 'both',
    estimatedMinutes: 45,
    lessons: [
      { title: 'Structured Review Workflows', description: 'Set up multi-round review cycles with role-based assignments, comment threading, and resolution tracking.' },
      { title: 'Audit Readiness Checklists', description: 'Use Dr. Sage-generated checklists aligned to FDA, EMA, and ICH inspection expectations.' },
      { title: 'Gap Identification & Scoring', description: 'Let AnA 1.0 scan your submission for completeness gaps and assign risk-weighted readiness scores.' },
      { title: 'Mock Audit Simulations', description: 'Run simulated audit scenarios to test team preparedness and document accessibility.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-compliance-champion',
  },
  {
    id: 'mod-review-audit-advanced',
    title: 'Advanced Review Orchestration & Inspection Prep',
    description:
      'Manage complex multi-reviewer cycles, automated finding reconciliation, and real-time inspection response preparation.',
    category: 'review-audit',
    roles: ['strategist', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['multi-reviewer', 'inspection-response'],
    productAreas: ['review-engine', 'inspection-prep'],
    certificationTrack: 'cert-compliance-champion',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 55,
    lessons: [
      { title: 'Multi-Reviewer Coordination', description: 'Orchestrate parallel and sequential review assignments with conflict resolution and consensus tracking.' },
      { title: 'Automated Finding Reconciliation', description: 'Use AnA 1.0 to categorize, deduplicate, and prioritize review findings across multiple reviewers.' },
      { title: 'Inspection Response Preparation', description: 'Generate pre-populated response templates for common FDA Form 483 observations and EMA GMP findings.' },
      { title: 'Real-Time Evidence Assembly', description: 'Rapidly assemble supporting evidence packages during live inspections with Dr. Sage assistance.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-compliance-champion',
  },
  // -- Dossier Placement --
  {
    id: 'mod-dossier-placement',
    title: 'Dossier Structure & Document Placement',
    description:
      'Master eCTD/CTD module structure, document placement rules, and automated granularity validation for global submission dossiers.',
    category: 'dossier-placement',
    roles: ['writer', 'quality'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['dossier-assembly', 'placement-validation'],
    productAreas: ['dossier-engine', 'placement-rules'],
    certificationTrack: 'cert-operations-master',
    maturityLevel: 2,
    aiMode: 'dr-sage',
    estimatedMinutes: 40,
    lessons: [
      { title: 'eCTD Module Structure', description: 'Navigate the five-module CTD structure and understand regional variations for FDA, EMA, PMDA, and Health Canada.' },
      { title: 'Document Placement Rules', description: 'Apply ICH M4 placement guidance with Dr. Sage recommendations for optimal document positioning.' },
      { title: 'Granularity Validation', description: 'Ensure documents meet submission gateway technical validation rules before publishing.' },
      { title: 'Lifecycle Management', description: 'Manage document lifecycle sequences, replacements, and appendices across submission versions.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-operations-master',
  },
  // -- Export Readiness --
  {
    id: 'mod-export-readiness',
    title: 'Export, Publishing & Submission Readiness',
    description:
      'Prepare final submission packages: PDF rendering, hyperlink validation, gateway pre-checks, and regional format compliance.',
    category: 'export-readiness',
    roles: ['writer', 'quality', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['export-package', 'gateway-validation'],
    productAreas: ['export-engine', 'gateway-checks'],
    certificationTrack: 'cert-operations-master',
    maturityLevel: 2,
    aiMode: 'dr-sage',
    estimatedMinutes: 35,
    lessons: [
      { title: 'PDF Rendering & Bookmarking', description: 'Generate submission-grade PDFs with proper bookmarks, pagination, headers, and accessibility compliance.' },
      { title: 'Hyperlink & Cross-Reference Validation', description: 'Validate all internal and external hyperlinks across the dossier before export.' },
      { title: 'Gateway Pre-Check Suite', description: 'Run automated pre-submission validation against FDA ESG, EMA eSubmission, and PMDA gateway requirements.' },
      { title: 'Regional Format Compliance', description: 'Ensure format compliance for NeeS (EU), eCTD v4.0 (ICH), and regional-specific appendices.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-operations-master',
  },
  // -- Dual AI Workflows --
  {
    id: 'mod-dual-ai-strategy',
    title: 'Dual-AI Strategy: Dr. Sage + AnA 1.0 for Decision Makers',
    description:
      'Understand how the dual-AI model amplifies regulatory intelligence: when to rely on Dr. Sage guidance vs. AnA 1.0 evidence analysis.',
    category: 'dual-ai-workflows',
    roles: ['strategist', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['strategic-planning', 'portfolio-analysis'],
    productAreas: ['dr-sage', 'ana-engine'],
    certificationTrack: 'cert-platform-expert',
    maturityLevel: 2,
    aiMode: 'both',
    estimatedMinutes: 40,
    lessons: [
      { title: 'The Dual-AI Paradigm', description: 'Understand the architectural separation: Dr. Sage (operational co-pilot) vs. AnA 1.0 (evidence intelligence engine).' },
      { title: 'When to Ask Dr. Sage vs. AnA 1.0', description: 'Decision framework for routing questions to the right AI based on task type, context, and desired outcome.' },
      { title: 'Collaborative AI Workflows', description: 'Explore scenarios where Dr. Sage and AnA 1.0 work in concert: evidence-informed authoring, audit response, strategy formulation.' },
      { title: 'Measuring AI Impact', description: 'Track time savings, quality improvements, and risk reduction metrics attributed to dual-AI assistance.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-platform-expert',
  },
  {
    id: 'mod-dual-ai-operations',
    title: 'Dual-AI Operations: Hands-On Workflow Integration',
    description:
      'Practical hands-on workflows combining Dr. Sage orchestration with AnA 1.0 intelligence in day-to-day regulatory operations.',
    category: 'dual-ai-workflows',
    roles: ['clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['clinical-submission', 'trial-integration'],
    productAreas: ['dr-sage', 'ana-engine', 'workflow-engine'],
    certificationTrack: 'cert-platform-expert',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 50,
    lessons: [
      { title: 'Orchestrating Multi-Step Workflows', description: 'Use Dr. Sage to coordinate complex operational workflows spanning evidence gathering, authoring, review, and export.' },
      { title: 'Real-Time Evidence Integration', description: 'Embed AnA 1.0 evidence lookups directly into operational workflows for just-in-time intelligence.' },
      { title: 'Automated Quality Gates', description: 'Configure AI-powered quality gates that Dr. Sage enforces at each workflow stage with AnA 1.0 validation.' },
      { title: 'Exception Handling & Escalation', description: 'Set up automated escalation paths when AI confidence drops below thresholds or conflicting evidence is detected.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-platform-expert',
  },
  // -- Platform Mastery --
  {
    id: 'mod-platform-mastery',
    title: 'Platform Mastery & Advanced Configuration',
    description:
      'Advanced platform configuration: custom workflows, API integrations, role-based access tuning, and enterprise deployment patterns.',
    category: 'platform-mastery',
    roles: ['strategist', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['configuration', 'integration'],
    productAreas: ['platform', 'admin'],
    certificationTrack: 'cert-platform-expert',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 45,
    lessons: [
      { title: 'Custom Workflow Builder', description: 'Design and deploy custom regulatory workflows with conditional logic, parallel branches, and AI-powered decision nodes.' },
      { title: 'API & Integration Framework', description: 'Connect Concept2Cure to CDMS, EDC, document management, and regulatory publishing systems via REST and webhook APIs.' },
      { title: 'Role-Based Access & Permissions', description: 'Configure granular role-based access controls across projects, documents, and AI capabilities.' },
      { title: 'Enterprise Deployment Patterns', description: 'Understand multi-tenant deployment, SSO integration, data residency, and high-availability configuration.' },
      { title: 'Performance Monitoring & Analytics', description: 'Track platform usage metrics, AI utilization, and team productivity analytics from the admin console.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-platform-expert',
  },
  // -- Executive --
  {
    id: 'mod-executive-dashboards',
    title: 'Executive Dashboards & Portfolio Intelligence',
    description:
      'Navigate executive-level dashboards for submission health, portfolio risk, team velocity, and AI-powered predictive analytics.',
    category: 'platform-mastery',
    roles: ['executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['portfolio-review', 'risk-assessment'],
    productAreas: ['dashboards', 'analytics'],
    certificationTrack: 'cert-platform-expert',
    maturityLevel: 2,
    aiMode: 'both',
    estimatedMinutes: 35,
    lessons: [
      { title: 'Portfolio Health Overview', description: 'Read the portfolio dashboard: submission status, milestone tracking, and aggregate readiness scores.' },
      { title: 'Risk Heat Maps & Predictive Scoring', description: 'Interpret AnA 1.0 risk models that predict submission outcomes based on evidence coverage and document maturity.' },
      { title: 'Team Velocity & Utilization', description: 'Monitor team output metrics, AI-assisted vs. manual effort ratios, and bottleneck identification.' },
      { title: 'Board-Ready Report Generation', description: 'Generate executive summary reports with Dr. Sage narrative synthesis and AnA 1.0 data visualizations.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-platform-expert',
  },
  // -- Coming Soon --
  {
    id: 'mod-realtime-co-review',
    title: 'Real-Time Co-Review with Dr. Sage',
    description:
      'Collaborate with Dr. Sage in real time during document review sessions with inline suggestions, voice annotation, and automated comment resolution.',
    category: 'dual-ai-workflows',
    roles: ['writer', 'strategist', 'quality'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['co-review', 'real-time-collaboration'],
    productAreas: ['dr-sage', 'review-engine'],
    certificationTrack: 'cert-platform-expert',
    maturityLevel: 4,
    aiMode: 'dr-sage',
    estimatedMinutes: 40,
    lessons: [
      { title: 'Activating Co-Review Mode', description: 'Enter the real-time co-review interface and configure Dr. Sage review preferences.' },
      { title: 'Inline Suggestion Workflows', description: 'Review, accept, modify, or reject Dr. Sage inline suggestions with tracked rationale.' },
      { title: 'Comment Resolution Automation', description: 'Let Dr. Sage propose resolutions for reviewer comments based on regulatory guidance and evidence.' },
    ],
    status: 'coming-soon',
    relatedCertificationId: 'cert-platform-expert',
  },

  // ── AI Agents Modules ─────────────────────────────────────────────────────

  {
    id: 'mod-agents-overview',
    title: 'AI Agents Overview',
    description:
      'Understand the 35+ specialized AI agents that power Concept2Cure — how they collaborate, when they activate, and how to monitor their work.',
    category: 'ai-agents',
    roles: ['writer', 'strategist', 'quality', 'clinical-ops', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['all'],
    productAreas: ['agent-swarm', 'cognitive-ecosystem'],
    certificationTrack: 'cert-agent-specialist',
    maturityLevel: 1,
    aiMode: 'both',
    estimatedMinutes: 20,
    lessons: [
      { title: 'The Agent Architecture', description: 'How 10 specialized agents form an AI swarm that mirrors a regulatory team.' },
      { title: 'Agent Roles Explained', description: 'Coordinator, Drafter, Researcher, QC, Compliance, Reviewer, Compiler, Validator, Evidence, Translator.' },
      { title: 'Multi-Agent Council', description: 'The Drafter→Statistician→Critic→Synthesizer quality pipeline.' },
      { title: 'Human-in-the-Loop', description: 'How and when agents pause for your review at critical decision points.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-agent-specialist',
  },
  {
    id: 'mod-agents-configuration',
    title: 'Configuring Your AI Team',
    description:
      'Select which agents activate for your submission type, set automation levels, configure review gates, and tune agent behavior to your workflow.',
    category: 'ai-agents',
    roles: ['strategist', 'quality', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['510k', 'ind', 'nda', 'pma', 'cer'],
    productAreas: ['agent-swarm', 'agent-runtime'],
    certificationTrack: 'cert-agent-specialist',
    maturityLevel: 2,
    aiMode: 'both',
    estimatedMinutes: 25,
    lessons: [
      { title: 'Submission-Type Agent Mapping', description: 'Which agents activate for 510(k), IND, NDA, PMA, and CER workflows.' },
      { title: 'Automation Levels', description: 'Supervised, Guided, and Autonomous modes — what each means for your workflow.' },
      { title: 'Review Gate Configuration', description: 'Set mandatory human review points at critical workflow stages.' },
      { title: 'Agent Preferences', description: 'Fine-tune agent behavior, evidence thresholds, and compliance strictness.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-agent-specialist',
  },
  {
    id: 'mod-agents-monitoring',
    title: 'Monitoring Agent Workflows',
    description:
      'Use the Workflow Monitor to observe agent execution in real-time, review reasoning traces, manage HITL breakpoints, and audit agent decisions.',
    category: 'ai-agents',
    roles: ['writer', 'strategist', 'quality', 'clinical-ops'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['all'],
    productAreas: ['agent-runtime', 'cognitive-audit'],
    certificationTrack: 'cert-agent-specialist',
    maturityLevel: 2,
    aiMode: 'both',
    estimatedMinutes: 20,
    lessons: [
      { title: 'The Workflow Monitor', description: 'Real-time visibility into what each agent is doing, thinking, and producing.' },
      { title: 'Reasoning Traces', description: 'How to read and evaluate the reasoning behind every agent decision.' },
      { title: 'HITL Breakpoints', description: 'Approve, revise, or reject agent work at human review gates.' },
      { title: 'Audit Trail', description: '21 CFR Part 11 compliant record of every agent action for regulatory audits.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-agent-specialist',
  },
  {
    id: 'mod-agents-innovation',
    title: 'Innovation Platform Services',
    description:
      'Master the 8 innovation services: Regulatory Delta Radar, Evidence Confidence Heatmap, Submission Readiness Twin, Auto-Traceability, and more.',
    category: 'ai-agents',
    roles: ['strategist', 'quality', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice'],
    workflows: ['all'],
    productAreas: ['innovation-platform'],
    certificationTrack: 'cert-agent-specialist',
    maturityLevel: 3,
    aiMode: 'both',
    estimatedMinutes: 30,
    lessons: [
      { title: 'Regulatory Delta Radar', description: 'How the platform monitors regulatory changes across 30+ agencies and alerts you to impacts.' },
      { title: 'Evidence Confidence Heatmap', description: 'Visual confidence scoring that shows where your evidence is strong or thin.' },
      { title: 'Submission Readiness Twin', description: 'A digital twin of your submission that predicts readiness before you file.' },
      { title: 'Auto-Traceability & Compliance Guardrails', description: 'Automatic evidence-to-claim tracing and programmable compliance rules.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-agent-specialist',
  },
  {
    id: 'mod-agents-foresight',
    title: 'AnA Predictions Predictive Intelligence',
    description:
      'Leverage multi-modal clinical prediction, Monte Carlo simulation, protocol analysis, and the knowledge graph for data-driven regulatory strategy via AnA Predictions.',
    category: 'ai-agents',
    roles: ['strategist', 'clinical-ops', 'executive'],
    clientTypes: ['pharma', 'biotech', 'meddevice', 'cro'],
    workflows: ['ind', 'nda', 'pma', '510k', 'cer'],
    productAreas: ['ana-snowglobe'],
    certificationTrack: 'cert-agent-specialist',
    maturityLevel: 3,
    aiMode: 'ana',
    estimatedMinutes: 25,
    lessons: [
      { title: 'Predictive Analytics', description: 'Multi-modal outcome prediction using clinical, genomic, and biomarker data.' },
      { title: 'Monte Carlo Simulation', description: 'Probabilistic modeling for timeline risk and submission success rates.' },
      { title: 'Protocol Intelligence', description: 'NLP-based protocol analysis with therapeutic area benchmarking.' },
      { title: 'Knowledge Graph', description: 'Semantic relationships across regulatory data, precedents, and outcomes.' },
    ],
    status: 'available',
    relatedCertificationId: 'cert-agent-specialist',
  },
];

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

export const CERTIFICATIONS: Certification[] = [
  {
    id: 'cert-ana-fundamentals',
    title: 'AnA Fundamentals',
    description:
      'Demonstrates foundational competency in navigating the platform, understanding the dual-AI model, and performing basic governed authoring tasks.',
    competence: 'Platform Navigation & Basic Authoring',
    focus: 'ana',
    requiredModuleIds: ['mod-onboarding-platform', 'mod-authoring-fundamentals', 'mod-governance-basics'],
    badge: { from: '#6366f1', to: '#818cf8' },
    unlockCriteria: 'Complete all three foundational modules with passing quiz scores.',
  },
  {
    id: 'cert-intelligence-specialist',
    title: 'Intelligence Specialist',
    description:
      'Certifies advanced proficiency in AnA 1.0 evidence intelligence, including predicate analysis, gap scoring, and cross-jurisdictional evidence mapping.',
    competence: 'Evidence Intelligence & Comparative Analysis',
    focus: 'combined',
    requiredModuleIds: ['mod-evidence-fundamentals', 'mod-evidence-advanced', 'mod-review-audit-basics'],
    badge: { from: '#8b5cf6', to: '#a78bfa' },
    unlockCriteria: 'Complete all evidence intelligence modules and pass the comparative analysis assessment.',
  },
  {
    id: 'cert-operations-master',
    title: 'Operations Master',
    description:
      'Validates expertise in governed authoring workflows, dossier assembly, export readiness, and Dr. Sage co-execution for operational efficiency.',
    competence: 'Authoring, Dossier & Export Operations',
    focus: 'dr-sage',
    requiredModuleIds: [
      'mod-authoring-fundamentals',
      'mod-authoring-advanced',
      'mod-dossier-placement',
      'mod-export-readiness',
    ],
    badge: { from: '#10b981', to: '#34d399' },
    unlockCriteria: 'Complete all authoring and export modules and submit a sample dossier section.',
  },
  {
    id: 'cert-compliance-champion',
    title: 'Compliance Champion',
    description:
      'Recognizes mastery of governance frameworks, audit readiness, multi-jurisdictional compliance, and continuous monitoring with dual-AI assistance.',
    competence: 'Governance, Compliance & Audit Readiness',
    focus: 'combined',
    requiredModuleIds: [
      'mod-governance-basics',
      'mod-governance-advanced',
      'mod-review-audit-basics',
      'mod-review-audit-advanced',
    ],
    badge: { from: '#0ea5e9', to: '#38bdf8' },
    unlockCriteria: 'Complete all governance and review modules and pass the compliance scenario assessment.',
  },
  {
    id: 'cert-platform-expert',
    title: 'Platform Expert',
    description:
      'The highest certification level, demonstrating comprehensive mastery of the Concept2Cure platform including dual-AI orchestration, advanced configuration, and strategic intelligence.',
    competence: 'Full Platform Mastery & Dual-AI Orchestration',
    focus: 'combined',
    requiredModuleIds: [
      'mod-dual-ai-strategy',
      'mod-platform-mastery',
      'mod-executive-dashboards',
    ],
    badge: { from: '#f59e0b', to: '#fbbf24' },
    unlockCriteria: 'Complete all platform mastery modules, hold at least two other certifications, and pass the capstone assessment.',
  },
  {
    id: 'cert-agent-specialist',
    title: 'AI Agent Specialist',
    description:
      'Certifies expertise in configuring, monitoring, and optimizing the 35+ specialized AI agents across AnA Agents, Innovation Platform, Cognitive Ecosystem, and AnA Predictions.',
    competence: 'AI Agent Configuration, Monitoring & Optimization',
    focus: 'combined',
    requiredModuleIds: [
      'mod-agents-overview',
      'mod-agents-configuration',
      'mod-agents-monitoring',
      'mod-agents-innovation',
      'mod-agents-foresight',
    ],
    badge: { from: '#18181B', to: '#3f3f46' },
    unlockCriteria: 'Complete all five AI agent modules, configure agents for at least one project, and run a monitored workflow.',
  },
];

// ---------------------------------------------------------------------------
// Release Notes
// ---------------------------------------------------------------------------

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'rn-ana-evidence-graph',
    title: 'AnA 1.0 Evidence Graph',
    description:
      'The new Evidence Graph visualizes regulatory intelligence relationships across predicate devices, clinical literature, and regulatory decisions. Navigate interconnected evidence nodes, explore citation chains, and identify coverage gaps at a glance.',
    date: '2026-03-10',
    type: 'feature',
    impactArea: 'ana',
    ctaLabel: 'Explore Evidence Graph',
    ctaAction: 'navigate:/evidence-graph',
  },
  {
    id: 'rn-drsage-coexecution',
    title: 'Dr. Sage Co-Execution Mode',
    description:
      'Dr. Sage can now draft document sections in parallel with your work. Enable Co-Execution Mode to let Dr. Sage handle routine sections while you focus on critical content, with real-time synchronization and conflict resolution.',
    date: '2026-03-05',
    type: 'feature',
    impactArea: 'dr-sage',
    ctaLabel: 'Try Co-Execution',
    ctaAction: 'navigate:/authoring?mode=co-execution',
  },
  {
    id: 'rn-provenance-inspector',
    title: 'Real-Time Provenance Inspector',
    description:
      'Every AI-generated assertion now includes a clickable provenance badge. Hover to see confidence scores; click to open the full citation chain with source document links, extraction methodology, and validation status.',
    date: '2026-02-28',
    type: 'feature',
    impactArea: 'both',
    ctaLabel: 'Learn About Provenance',
    ctaAction: 'open:module/mod-evidence-fundamentals',
  },
  {
    id: 'rn-gateway-precheck-v2',
    title: 'Gateway Pre-Check Suite v2.0',
    description:
      'Expanded pre-submission validation now covers FDA ESG 4.0, EMA eSubmission v5, and PMDA eCTD v4. Includes automatic fix suggestions for common validation failures.',
    date: '2026-02-20',
    type: 'improvement',
    impactArea: 'platform',
    ctaLabel: 'Run Pre-Check',
    ctaAction: 'navigate:/export/pre-check',
  },
  {
    id: 'rn-ana-contradiction-detection',
    title: 'AnA 1.0 Literature Contradiction Detection',
    description:
      'AnA 1.0 now automatically identifies contradictory findings across clinical literature, FDA review memos, and advisory committee transcripts, presenting them as structured conflict summaries with confidence scoring.',
    date: '2026-02-15',
    type: 'ai-update',
    impactArea: 'ana',
  },
  {
    id: 'rn-compliance-dashboard',
    title: 'Continuous Compliance Dashboard',
    description:
      'New real-time compliance health dashboard monitors document governance status across all active projects. Includes trend analysis, deviation alerts, and one-click remediation initiation.',
    date: '2026-02-10',
    type: 'feature',
    impactArea: 'platform',
    ctaLabel: 'View Dashboard',
    ctaAction: 'navigate:/compliance/dashboard',
  },
  {
    id: 'rn-drsage-audit-assistant',
    title: 'Dr. Sage Audit Response Assistant',
    description:
      'During live audits, Dr. Sage can now rapidly assemble evidence packages, generate response drafts for inspector queries, and surface relevant SOPs and training records in under 30 seconds.',
    date: '2026-02-01',
    type: 'ai-update',
    impactArea: 'dr-sage',
  },
  {
    id: 'rn-cross-jurisdiction-mapping',
    title: 'Cross-Jurisdictional Requirement Mapping',
    description:
      'Map regulatory requirements across FDA, EMA, PMDA, Health Canada, and TGA simultaneously. AnA 1.0 highlights coverage overlaps and jurisdiction-specific gaps to streamline multi-market submission planning.',
    date: '2026-01-25',
    type: 'improvement',
    impactArea: 'ana',
    ctaLabel: 'View Mapping Tool',
    ctaAction: 'navigate:/evidence/cross-jurisdiction',
  },
];

// ---------------------------------------------------------------------------
// Workflow Scenarios
// ---------------------------------------------------------------------------

export const WORKFLOW_SCENARIOS: WorkflowScenario[] = [
  {
    id: 'wf-review-510k',
    title: 'Review a 510(k) Submission Package',
    description:
      'End-to-end review of a 510(k) substantial equivalence submission, from predicate identification through final quality check.',
    category: 'submission-review',
    steps: [
      {
        id: 'wf-review-510k-1',
        title: 'Identify Predicate Devices',
        description: 'AnA 1.0 searches FDA databases to identify candidate predicate devices based on device classification, intended use, and technological characteristics.',
        status: 'complete',
        actor: 'ana',
        objectContext: '510(k) Predicate Search',
        actionCta: 'View Predicate Candidates',
      },
      {
        id: 'wf-review-510k-2',
        title: 'Generate Substantial Equivalence Comparison',
        description: 'AnA 1.0 builds a structured comparison table mapping device characteristics against selected predicates with evidence scoring.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'SE Comparison Matrix',
      },
      {
        id: 'wf-review-510k-3',
        title: 'Draft Summary Section',
        description: 'Dr. Sage generates the 510(k) summary section using the SE comparison data, predicate history, and device description inputs.',
        status: 'running',
        actor: 'dr-sage',
        objectContext: 'Section 4 - 510(k) Summary',
        actionCta: 'Review Draft',
      },
      {
        id: 'wf-review-510k-4',
        title: 'Validate Regulatory Language',
        description: 'AnA 1.0 scans the drafted summary for regulatory language compliance, ambiguous terminology, and missing required elements.',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: 'wf-review-510k-5',
        title: 'Apply Governance & Route for Approval',
        description: 'Dr. Sage applies section-level governance controls, assigns reviewers, and initiates the approval workflow.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'Configure Approval Chain',
      },
      {
        id: 'wf-review-510k-6',
        title: 'Run Pre-Submission Gateway Check',
        description: 'Both AIs collaborate to run the full gateway pre-check suite against FDA ESG requirements and flag any validation errors.',
        status: 'pending',
        actor: 'both',
        objectContext: 'FDA ESG Validation',
      },
    ],
  },
  {
    id: 'wf-inspect-ind-readiness',
    title: 'Inspect IND Readiness',
    description:
      'Systematic assessment of IND application readiness across all CTD modules with gap analysis and risk scoring.',
    category: 'readiness-assessment',
    steps: [
      {
        id: 'wf-ind-1',
        title: 'Scan Module Completeness',
        description: 'AnA 1.0 scans all five CTD modules for document completeness against FDA IND requirements and flags missing sections.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'CTD Modules 1-5',
      },
      {
        id: 'wf-ind-2',
        title: 'Generate Readiness Scorecard',
        description: 'AnA 1.0 produces a weighted readiness scorecard across nonclinical, clinical, CMC, and administrative sections.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'IND Readiness Scorecard',
        actionCta: 'View Scorecard',
      },
      {
        id: 'wf-ind-3',
        title: 'Identify Critical Gaps',
        description: 'Dr. Sage interprets the gap analysis and prioritizes critical missing elements that would trigger an FDA clinical hold.',
        status: 'running',
        actor: 'dr-sage',
        objectContext: 'Gap Priority Matrix',
      },
      {
        id: 'wf-ind-4',
        title: 'Cross-Reference Safety Data',
        description: 'AnA 1.0 validates that all nonclinical safety study references are properly linked to Module 4 study reports.',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: 'wf-ind-5',
        title: 'Generate Remediation Plan',
        description: 'Dr. Sage creates a prioritized remediation plan with estimated timelines, resource requirements, and dependency mapping.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'View Remediation Plan',
      },
      {
        id: 'wf-ind-6',
        title: 'Schedule Pre-IND Meeting Prep',
        description: 'Dr. Sage drafts pre-IND meeting request materials and briefing document outlines based on identified gaps.',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: 'wf-ind-7',
        title: 'Final Readiness Certification',
        description: 'Both AIs perform a final validation pass and Dr. Sage generates the IND readiness certification summary for stakeholder sign-off.',
        status: 'pending',
        actor: 'both',
        actionCta: 'Certify Readiness',
      },
    ],
  },
  {
    id: 'wf-fix-compliance-gaps',
    title: 'Fix Compliance Gaps',
    description:
      'Detect, assess, and remediate compliance gaps across governed documents with automated deviation tracking and CAPA linkage.',
    category: 'compliance',
    steps: [
      {
        id: 'wf-compliance-1',
        title: 'Run Compliance Scan',
        description: 'AnA 1.0 performs a comprehensive compliance scan across all active documents against applicable regulatory requirements.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'All Active Documents',
      },
      {
        id: 'wf-compliance-2',
        title: 'Categorize & Prioritize Findings',
        description: 'AnA 1.0 categorizes findings by severity (critical, major, minor) and maps each to the specific regulatory requirement violated.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'Compliance Findings Report',
        actionCta: 'View Findings',
      },
      {
        id: 'wf-compliance-3',
        title: 'Generate Fix Recommendations',
        description: 'Dr. Sage produces specific fix recommendations for each finding with suggested text, reference updates, and governance adjustments.',
        status: 'running',
        actor: 'dr-sage',
      },
      {
        id: 'wf-compliance-4',
        title: 'Apply Automated Fixes',
        description: 'Dr. Sage applies approved automated fixes for minor findings and stages changes for review on major/critical items.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'Review & Approve Fixes',
      },
      {
        id: 'wf-compliance-5',
        title: 'Initiate CAPA for Critical Findings',
        description: 'Dr. Sage creates CAPA records for critical findings and links them to the appropriate quality management workflows.',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: 'wf-compliance-6',
        title: 'Re-Validate Post-Remediation',
        description: 'AnA 1.0 re-runs the compliance scan on remediated documents to verify all findings are resolved.',
        status: 'pending',
        actor: 'ana',
        actionCta: 'Run Re-Validation',
      },
    ],
  },
  {
    id: 'wf-prep-audit',
    title: 'Prepare for Regulatory Audit',
    description:
      'Comprehensive audit preparation workflow covering document assembly, trail verification, team readiness, and mock inspection simulation.',
    category: 'audit',
    steps: [
      {
        id: 'wf-audit-1',
        title: 'Generate Audit Scope Checklist',
        description: 'Dr. Sage generates a tailored audit preparation checklist based on the inspection type (GMP, GCP, GLP) and regulatory authority.',
        status: 'complete',
        actor: 'dr-sage',
        objectContext: 'FDA GCP Inspection',
        actionCta: 'View Checklist',
      },
      {
        id: 'wf-audit-2',
        title: 'Verify Audit Trail Integrity',
        description: 'AnA 1.0 validates the completeness and integrity of audit trails across all in-scope documents and systems.',
        status: 'complete',
        actor: 'ana',
      },
      {
        id: 'wf-audit-3',
        title: 'Assemble Document Packages',
        description: 'Dr. Sage compiles all required documents into organized packages matching the expected audit inquiry sequence.',
        status: 'running',
        actor: 'dr-sage',
        objectContext: 'Audit Document Package',
      },
      {
        id: 'wf-audit-4',
        title: 'Cross-Check Training Records',
        description: 'AnA 1.0 verifies that all personnel training records are current and align with their document authoring/review roles.',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: 'wf-audit-5',
        title: 'Run Mock Inspection Simulation',
        description: 'Dr. Sage conducts a simulated inspection scenario, posing common inspector questions and timing team response readiness.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'Start Mock Inspection',
      },
      {
        id: 'wf-audit-6',
        title: 'Generate Readiness Summary',
        description: 'Both AIs collaborate to produce the final audit readiness summary with confidence scoring and remaining action items.',
        status: 'pending',
        actor: 'both',
        objectContext: 'Audit Readiness Report',
        actionCta: 'View Readiness Report',
      },
    ],
  },
  {
    id: 'wf-compare-revisions',
    title: 'Compare Document Revisions',
    description:
      'Intelligent document comparison across revisions with regulatory impact assessment, change justification validation, and approval chain updates.',
    category: 'document-management',
    steps: [
      {
        id: 'wf-compare-1',
        title: 'Select Revisions for Comparison',
        description: 'Dr. Sage presents the document version history and recommends the most relevant revision pair for comparison.',
        status: 'complete',
        actor: 'dr-sage',
        objectContext: 'Document Version History',
      },
      {
        id: 'wf-compare-2',
        title: 'Generate Structural Diff',
        description: 'AnA 1.0 performs a deep structural comparison identifying additions, deletions, modifications, and moved content blocks.',
        status: 'complete',
        actor: 'ana',
        actionCta: 'View Diff Report',
      },
      {
        id: 'wf-compare-3',
        title: 'Assess Regulatory Impact',
        description: 'AnA 1.0 evaluates whether content changes affect regulatory claims, evidence linkages, or compliance posture.',
        status: 'running',
        actor: 'ana',
        objectContext: 'Impact Assessment',
      },
      {
        id: 'wf-compare-4',
        title: 'Validate Change Justifications',
        description: 'Dr. Sage checks that all substantive changes have documented justifications and that justifications align with the actual modifications.',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: 'wf-compare-5',
        title: 'Update Cross-References',
        description: 'Dr. Sage identifies and updates all cross-references affected by the revision changes across the dossier.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'Review Cross-Ref Updates',
      },
    ],
  },
  {
    id: 'wf-assess-evidence-coverage',
    title: 'Assess Evidence Coverage',
    description:
      'Comprehensive evidence coverage assessment across a submission dossier, identifying gaps, weak links, and opportunities to strengthen the regulatory argument.',
    category: 'evidence-analysis',
    steps: [
      {
        id: 'wf-evidence-1',
        title: 'Map Current Evidence Inventory',
        description: 'AnA 1.0 catalogs all evidence currently referenced in the submission and maps it to the regulatory requirements it supports.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'Evidence Inventory Map',
        actionCta: 'View Evidence Map',
      },
      {
        id: 'wf-evidence-2',
        title: 'Score Evidence Strength',
        description: 'AnA 1.0 assigns strength scores to each evidence item based on study design, sample size, relevance, and recency.',
        status: 'complete',
        actor: 'ana',
      },
      {
        id: 'wf-evidence-3',
        title: 'Identify Coverage Gaps',
        description: 'AnA 1.0 identifies regulatory requirements that lack supporting evidence or have only weak evidence linkages.',
        status: 'running',
        actor: 'ana',
        objectContext: 'Gap Analysis Report',
      },
      {
        id: 'wf-evidence-4',
        title: 'Recommend Evidence Acquisition',
        description: 'Dr. Sage recommends strategies to fill evidence gaps: additional literature search, new studies, or alternative evidence sources.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'View Recommendations',
      },
      {
        id: 'wf-evidence-5',
        title: 'Detect Contradictory Evidence',
        description: 'AnA 1.0 flags any contradictory findings across the evidence base and presents structured conflict summaries.',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: 'wf-evidence-6',
        title: 'Generate Coverage Summary',
        description: 'Both AIs produce a comprehensive evidence coverage summary with heatmap visualization and executive narrative.',
        status: 'pending',
        actor: 'both',
        objectContext: 'Coverage Summary Report',
        actionCta: 'View Coverage Summary',
      },
    ],
  },
  {
    id: 'wf-guide-dossier-placement',
    title: 'Guide Dossier Placement',
    description:
      'Intelligent guidance for placing documents into the correct eCTD module and section with validation against ICH M4 and regional requirements.',
    category: 'dossier-assembly',
    steps: [
      {
        id: 'wf-dossier-1',
        title: 'Analyze Document Type & Content',
        description: 'AnA 1.0 analyzes the document content, metadata, and type to determine the appropriate CTD module and section.',
        status: 'complete',
        actor: 'ana',
        objectContext: 'Document Classification',
      },
      {
        id: 'wf-dossier-2',
        title: 'Recommend Placement Location',
        description: 'Dr. Sage recommends the optimal placement within the eCTD structure, explaining the rationale based on ICH M4 guidance.',
        status: 'complete',
        actor: 'dr-sage',
        actionCta: 'View Placement Recommendation',
      },
      {
        id: 'wf-dossier-3',
        title: 'Check for Duplicate Placement',
        description: 'AnA 1.0 scans the existing dossier for duplicate or overlapping content that could create redundancy or conflict.',
        status: 'running',
        actor: 'ana',
      },
      {
        id: 'wf-dossier-4',
        title: 'Validate Regional Requirements',
        description: 'AnA 1.0 validates the placement against regional-specific requirements for all target submission markets.',
        status: 'pending',
        actor: 'ana',
        objectContext: 'Regional Validation',
      },
      {
        id: 'wf-dossier-5',
        title: 'Apply Lifecycle Metadata',
        description: 'Dr. Sage applies the correct lifecycle operation (new, replace, append, delete) and links to prior document versions.',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: 'wf-dossier-6',
        title: 'Update Dossier Table of Contents',
        description: 'Dr. Sage regenerates the dossier table of contents and updates all navigation references.',
        status: 'pending',
        actor: 'dr-sage',
        actionCta: 'Preview Updated TOC',
      },
      {
        id: 'wf-dossier-7',
        title: 'Run Placement Validation',
        description: 'Both AIs perform a final validation confirming the document is correctly placed, linked, and gateway-compliant.',
        status: 'pending',
        actor: 'both',
        objectContext: 'Placement Validation',
        actionCta: 'Confirm Placement',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Coming Soon Features
// ---------------------------------------------------------------------------

export const COMING_SOON_FEATURES = [
  {
    id: 'cs-realtime-co-review',
    title: 'Real-Time Co-Review',
    description:
      'Collaborate with Dr. Sage in real time during document review sessions. Dr. Sage provides inline regulatory suggestions, auto-resolves straightforward comments, and escalates complex findings to AnA 1.0 for evidence-backed resolution.',
    expectedDate: '2026-Q2',
    icon: 'Users',
  },
  {
    id: 'cs-global-regulatory-map',
    title: 'Global Regulatory Map',
    description:
      'Interactive world map showing regulatory requirements, approval timelines, and submission status across 60+ health authorities. AnA 1.0 continuously updates requirement changes and Dr. Sage alerts you to deadline risks.',
    expectedDate: '2026-Q3',
    icon: 'Globe',
  },
  {
    id: 'cs-automated-presub-package',
    title: 'Automated Pre-Sub Package',
    description:
      'One-click generation of complete pre-submission meeting packages including briefing documents, question lists, supporting evidence compilations, and meeting request letters, all assembled by the Dr. Sage and AnA 1.0 duo.',
    expectedDate: '2026-Q3',
    icon: 'Package',
  },
];

// ---------------------------------------------------------------------------
// Module Categories & Filters
// ---------------------------------------------------------------------------

export const MODULE_CATEGORIES: { id: string; label: string; description: string }[] = [
  { id: 'onboarding', label: 'Onboarding', description: 'Get started with the platform and dual-AI model' },
  { id: 'evidence-intelligence', label: 'Evidence Intelligence', description: 'Master AnA 1.0 evidence search, analysis, and comparative intelligence' },
  { id: 'authoring', label: 'Authoring', description: 'Create governed regulatory documents with AI-assisted drafting' },
  { id: 'governance', label: 'Governance', description: 'Manage compliance, approval workflows, and audit trails' },
  { id: 'review-audit', label: 'Review & Audit', description: 'Prepare for and execute reviews and regulatory audits' },
  { id: 'dossier-placement', label: 'Dossier Placement', description: 'Structure and place documents in eCTD dossiers' },
  { id: 'export-readiness', label: 'Export Readiness', description: 'Prepare, validate, and export submission packages' },
  { id: 'dual-ai-workflows', label: 'Dual-AI Workflows', description: 'Orchestrate Dr. Sage and AnA 1.0 for maximum impact' },
  { id: 'platform-mastery', label: 'Platform Mastery', description: 'Advanced configuration, integrations, and executive analytics' },
  { id: 'ai-agents', label: 'AI Agents', description: 'Configure, monitor, and optimize the 35+ specialized AI agents powering your workflows' },
];

export const MODULE_FILTERS = {
  roles: [
    { id: 'writer', label: 'Regulatory Writer' },
    { id: 'strategist', label: 'Regulatory Strategist' },
    { id: 'quality', label: 'Quality / CMC Specialist' },
    { id: 'clinical-ops', label: 'Clinical Operations' },
    { id: 'executive', label: 'Executive' },
  ],
  aiModes: [
    { id: 'dr-sage', label: 'Dr. Sage' },
    { id: 'ana', label: 'AnA 1.0' },
    { id: 'both', label: 'Both AIs' },
  ],
  maturityLevels: [
    { id: 1, label: 'Beginner' },
    { id: 2, label: 'Intermediate' },
    { id: 3, label: 'Advanced' },
    { id: 4, label: 'Expert' },
  ],
  statuses: [
    { id: 'available', label: 'Available Now' },
    { id: 'coming-soon', label: 'Coming Soon' },
  ],
  clientTypes: [
    { id: 'pharma', label: 'Pharmaceutical' },
    { id: 'biotech', label: 'Biotechnology' },
    { id: 'meddevice', label: 'Medical Device' },
    { id: 'cro', label: 'CRO / Consulting' },
  ],
};
