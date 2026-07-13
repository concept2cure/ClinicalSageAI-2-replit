/**
 * Fixture data for the AnA Command Center surface (kit app/ana-command-data.jsx).
 *
 * Contract shapes match the real orchestration backend:
 *   - Portfolio: GET /api/report-os/portfolio/org (PortfolioSummary.attentionRanked[])
 *   - Continuity: POST /api/orchestration/continuity (ProjectContinuitySnapshot)
 *   - Recommendations: POST /api/orchestration/recommendations (RecommendationSet)
 *   - Templates: GET /api/orchestration/templates (WorkflowTemplate[])
 *   - Gate: POST /api/orchestration/pre-submission-gate
 *   - Roles: user role lens (RBAC enum)
 *
 * Program FACTS grounded in the app's own canonical fixtures:
 *   BX-301 (anti-BCMA BLA), BX-204 (Bextrelimab NDA), BX-099 (approved sNDA).
 */

/* ---- Types ---- */

export interface AcPortfolioItem {
  projectId: number;
  seg: string;
  code: string;
  name: string;
  app: string;
  indication: string;
  readiness: number;
  status: string;
  trajectory: string;
  targetDate: string;
  blockers: number;
  module: string;
}

export interface AcChange {
  type: string;
  description: string;
  targetType: string;
  targetId: string;
  timestamp: string;
}

export interface AcReadyItem {
  type: string;
  id: string;
  title: string;
}

export interface AcAttentionItem {
  type: string;
  id: string;
  title: string;
  reason: string;
}

export interface AcMetrics {
  readinessScore: number;
  documentCount: number;
  validatedCount: number;
  blockerCount: number;
  taskCompletionPercent: number;
}

export interface AcContinuity {
  projectId: number;
  summary: string;
  trajectory: string;
  metrics: AcMetrics;
  changes: AcChange[];
  newlyReady: AcReadyItem[];
  needsAttention: AcAttentionItem[];
}

export interface AcActionPayload {
  actionType: string;
  payload: Record<string, string>;
}

export interface AcRecommendation {
  id: string;
  recommendationType: string;
  severity: string;
  module: string;
  targetObjectType: string;
  targetObjectTitle: string;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  confidence: number;
  actionPayload: AcActionPayload;
}

export interface AcWorkflowStep {
  stepId: string;
  name: string;
  description: string;
  requiresApproval?: boolean;
}

export interface AcWorkflowTemplate {
  templateId: string;
  name: string;
  estimatedDurationMinutes: number;
  description: string;
  steps: AcWorkflowStep[];
}

export interface AcGateReadiness {
  overallScore: number;
  status: string;
  scores: Record<string, number>;
}

export interface AcGateCmc {
  contradictionCounts: { critical: number; high: number; medium: number; low: number; open: number; resolved: number };
}

export interface AcGateRisk {
  overallRisk: string;
  riskScore: number;
}

export interface AcGateIch {
  overallStatus: string;
  counts: { pass: number; warning: number; fail: number };
}

export interface AcGate {
  submissionType: string;
  verdict: string;
  verdictRationale: string[];
  readiness: AcGateReadiness;
  cmc: AcGateCmc;
  crl: AcGateRisk;
  rtf: AcGateRisk;
  ich: AcGateIch;
}

export interface AcRole {
  id: string;
  label: string;
  modules: string[];
}

/* ---- Portfolio roll-up ---- */

export const AC_PORTFOLIO: AcPortfolioItem[] = [
  { projectId: 301, seg: 'biotech', code: 'BX-301', name: 'anti-BCMA mAb', app: 'BLA · 351(a)', indication: 'Relapsed multiple myeloma',
    readiness: 64, status: 'in_progress', trajectory: 'improving', targetDate: '2026-11-14', blockers: 4, module: 'clinical' },
  { projectId: 204, seg: 'pharma', code: 'BX-204', name: 'Bextrelimab', app: 'NDA 212345', indication: 'Oncology · RTK-X solid tumors',
    readiness: 61, status: 'at_risk', trajectory: 'declining', targetDate: '2026-08-14', blockers: 6, module: 'cmc' },
  { projectId: 99, seg: 'biotech', code: 'BX-099', name: 'approved', app: 'sNDA · 211990', indication: 'Approved · lifecycle & safety',
    readiness: 82, status: 'on_track', trajectory: 'stable', targetDate: '2026-09-04', blockers: 2, module: 'safety' },
];

/* ---- ProjectContinuitySnapshot (POST /orchestration/continuity) ---- */

export const AC_CONTINUITY: Record<number, AcContinuity> = {
  301: {
    projectId: 301,
    summary: 'BX-301 (anti-BCMA) BLA advanced this week: the pivotal CSR from BX301-301 locked and Module 2.5 Clinical Overview cleared secondary validation. Two CMC drug-substance items remain the critical path to filing.',
    trajectory: 'improving',
    metrics: { readinessScore: 64, documentCount: 142, validatedCount: 96, blockerCount: 4, taskCompletionPercent: 71 },
    changes: [
      { type: 'validation_completed', description: 'Module 2.5 Clinical Overview passed secondary validation (compliance 94)', targetType: 'document', targetId: 'D-2050', timestamp: '2h ago' },
      { type: 'document_created', description: 'Pivotal CSR (BX301-301) database lock -- final CSR generated', targetType: 'document', targetId: 'D-5305', timestamp: '1d ago' },
      { type: 'artifact_promoted', description: 'Integrated Summary of Safety promoted to dossier §2.7.4', targetType: 'artifact', targetId: 'A-2740', timestamp: '2d ago' },
      { type: 'blocker_new', description: 'Drug-substance 24-month stability projection flagged below spec trend (§3.2.S.7.3)', targetType: 'cmc', targetId: 'S-7-3', timestamp: '3d ago' },
    ],
    newlyReady: [
      { type: 'document', id: 'D-2050', title: 'Module 2.5 Clinical Overview -- ready for QC sign-off' },
      { type: 'document', id: 'D-5305', title: 'Pivotal CSR (BX301-301) -- ready for medical review' },
    ],
    needsAttention: [
      { type: 'cmc', id: 'S-7-3', title: 'Drug-substance stability (§3.2.S.7.3)', reason: '24-month projection trends below the acceptance limit -- the filing-critical item' },
      { type: 'task', id: 'T-4471', title: 'DSUR annual report', reason: 'Due in 9 days; owner over capacity' },
    ],
  },
  204: {
    projectId: 204,
    summary: 'Bextrelimab (BX-204) NDA is in CRL remediation with PDUFA resubmission pressure. The FDA Complete Response Letter cited CMC comparability after the manufacturing change; that plus an open eCTD validation error sit on the critical path.',
    trajectory: 'declining',
    metrics: { readinessScore: 61, documentCount: 118, validatedCount: 70, blockerCount: 6, taskCompletionPercent: 64 },
    changes: [
      { type: 'blocker_new', description: 'CRL deficiency: CMC comparability evidence requested for the post-change drug substance', targetType: 'cmc', targetId: 'CRL-D2', timestamp: '5h ago' },
      { type: 'task_completed', description: 'USPI §6 ADVERSE REACTIONS updated and routed for the resubmission', targetType: 'task', targetId: 'T-8890', timestamp: '1d ago' },
    ],
    newlyReady: [{ type: 'document', id: 'D-6120', title: 'CRL response -- cover letter draft ready for review' }],
    needsAttention: [
      { type: 'cmc', id: 'CRL-D2', title: 'CMC comparability (CRL deficiency)', reason: 'The CRL-cited comparability package must be complete before the resubmission is filed' },
      { type: 'submission', id: 'SUB-204', title: 'NDA 212345 · resubmission sequence', reason: 'Validation has 1 open error; PDUFA resubmission clock is running' },
    ],
  },
  99: {
    projectId: 99,
    summary: 'BX-099 is approved and in lifecycle management. The immune-mediated pneumonitis signal (PRR 4.2, 27 cases) is the item to watch; it is under evaluation and an expedited safety report is drafted. Two lifecycle supplements are in flight.',
    trajectory: 'stable',
    metrics: { readinessScore: 82, documentCount: 64, validatedCount: 51, blockerCount: 2, taskCompletionPercent: 78 },
    changes: [
      { type: 'blocker_new', description: 'Immune-mediated pneumonitis signal crossed PRR threshold (4.2, 27 cases)', targetType: 'signal', targetId: 'SIG-8841', timestamp: '6h ago' },
      { type: 'document_created', description: 'sNDA 211990-001 (pediatric indication extension) filed -- PDUFA 2026-09-04', targetType: 'submission', targetId: 'sNDA-211990-001', timestamp: '2d ago' },
    ],
    newlyReady: [{ type: 'document', id: 'ICSR-8841', title: 'Expedited safety report -- drafted, awaiting medical review' }],
    needsAttention: [
      { type: 'signal', id: 'SIG-8841', title: 'Immune-mediated pneumonitis (PRR 4.2)', reason: 'Under evaluation; causality assessment and aggregate-report impact in progress' },
    ],
  },
};

/* ---- RecommendationSet (POST /orchestration/recommendations) ---- */

export const AC_RECS: Record<number, AcRecommendation[]> = {
  301: [
    { id: 'R-3011', recommendationType: 'readiness_gap', severity: 'critical', module: 'cmc', targetObjectType: 'cmc_section', targetObjectTitle: 'Drug-substance stability §3.2.S.7.3',
      reason: 'The 24-month stability projection trends below the acceptance limit -- the single filing-critical blocker on the anti-BCMA BLA.',
      evidence: ['Linear fit crosses the lower limit at ~26 months', 'Batch 3 shows the steepest slope', 'No comparability protocol on file for the process change'],
      suggestedAction: 'Run the stability projection with the latest timepoints and draft the §3.2.S.7.3 justification with a comparability protocol.', confidence: 0.86,
      actionPayload: { actionType: 'draft_validate_route', payload: { target: 'cmc-section', section: '3.2.S.7.3' } } },
    { id: 'R-3012', recommendationType: 'next_best_action', severity: 'high', module: 'clinical', targetObjectType: 'document', targetObjectTitle: 'Pivotal CSR (BX301-301)',
      reason: 'The pivotal CSR just locked and is ready for medical review -- clearing it unblocks §2.5 and §2.7.',
      evidence: ['Database lock completed 1d ago', 'Secondary validation passed on §2.5', '2 downstream summaries depend on it'],
      suggestedAction: 'Route the pivotal CSR to medical review and notify the §2.7 authors.', confidence: 0.91,
      actionPayload: { actionType: 'route_document', payload: { documentId: 'D-5305', to: 'medical-review' } } },
    { id: 'R-3013', recommendationType: 'overdue_task', severity: 'medium', module: 'safety', targetObjectType: 'task', targetObjectTitle: 'DSUR annual report',
      reason: 'The DSUR is due in 9 days and its owner is over capacity across two programs.',
      evidence: ['Due 2026-07-13', 'Owner assigned to 6 open tasks', 'Workload-balanced reassignment available'],
      suggestedAction: 'Rebalance the DSUR to an available medical writer and start the draft from study status.', confidence: 0.78,
      actionPayload: { actionType: 'rebalance_task', payload: { taskId: 'T-4471' } } },
  ],
  204: [
    { id: 'R-2041', recommendationType: 'readiness_gap', severity: 'critical', module: 'cmc', targetObjectType: 'cmc_deficiency', targetObjectTitle: 'CMC comparability (CRL deficiency)',
      reason: 'The Complete Response Letter requested comparability evidence for the post-change drug substance -- this is the gating item for the resubmission.',
      evidence: ['CRL deficiency D2 cites comparability', 'Bextrelimab is a CHO-produced IgG1κ mAb', 'Post-change lots need side-by-side characterization'],
      suggestedAction: 'Assemble the comparability package (side-by-side characterization + stability) and draft the CRL response to deficiency D2.', confidence: 0.82,
      actionPayload: { actionType: 'draft_validate_route', payload: { target: 'cmc-comparability', deficiency: 'CRL-D2' } } },
    { id: 'R-2042', recommendationType: 'validation_failure', severity: 'high', module: 'submission', targetObjectType: 'submission', targetObjectTitle: 'NDA 212345 · resubmission sequence',
      reason: 'The eCTD resubmission sequence has an open validation error that will fail the ESG gateway if transmitted now.',
      evidence: ['1 error, 5 warnings on last validation', 'PDUFA resubmission clock running', 'Gateway rejects on any error'],
      suggestedAction: 'Clear the validation error and re-validate before freezing the resubmission sequence.', confidence: 0.88,
      actionPayload: { actionType: 'draft_validate_route', payload: { target: 'submission', submissionId: 'SUB-204' } } },
  ],
  99: [
    { id: 'R-991', recommendationType: 'next_best_action', severity: 'high', module: 'safety', targetObjectType: 'document', targetObjectTitle: 'Expedited safety report (ICSR-8841)',
      reason: 'The pneumonitis case narrative is drafted and complete against ICH E3 §16 -- route it for medical review while the signal is under evaluation.',
      evidence: ['Narrative complete -- all E3 §16 elements present', 'Signal PRR 4.2 (27 cases), under evaluation', 'E2B(R3) transmission ready'],
      suggestedAction: 'Send ICSR-8841 for medical review, then transmit as an E2B(R3) ICSR.', confidence: 0.9,
      actionPayload: { actionType: 'route_document', payload: { documentId: 'ICSR-8841', to: 'medical-review' } } },
  ],
};

/* ---- WorkflowTemplate[] (GET /orchestration/templates) ---- */

export const AC_TEMPLATES: AcWorkflowTemplate[] = [
  { templateId: 'submission_readiness_review', name: 'Submission readiness review', estimatedDurationMinutes: 4,
    description: 'Assemble the cross-object payload, score readiness across all five subscores, list blockers, and recommend the next actions to close the gap to filing.',
    steps: [
      { stepId: 'assemble', name: 'Assemble cross-object payload', description: 'Gather documents, artifacts, validations, tasks, module map and CMC signals' },
      { stepId: 'score', name: 'Compute readiness assessment', description: 'Score completeness · quality · consistency · compliance · routing' },
      { stepId: 'blockers', name: 'Identify blockers', description: 'Surface critical/major/minor blockers with suggested resolutions' },
      { stepId: 'recommend', name: 'Generate recommendations', description: 'Rank next-best actions by severity and confidence' },
    ] },
  { templateId: 'draft_validate_route', name: 'Draft → validate → route', estimatedDurationMinutes: 6,
    description: 'Draft a document from its template and linked evidence, run compliance validation, and route it to the correct CTD module and reviewer.',
    steps: [
      { stepId: 'draft', name: 'Draft from evidence', description: 'AnA drafts the section grounded in linked, verified evidence', requiresApproval: true },
      { stepId: 'validate', name: 'Validate compliance', description: 'Run the validation engine; block on critical findings' },
      { stepId: 'route', name: 'Route to module', description: 'Place in the correct CTD module and assign the reviewer' },
    ] },
  { templateId: 'project_blocker_scan', name: 'Project blocker scan', estimatedDurationMinutes: 3,
    description: 'Scan the whole project for blocked workflows, overdue tasks, unvalidated and unrouted content, and stale sections -- then rank what to fix first.',
    steps: [
      { stepId: 'scan', name: 'Scan project objects', description: 'Sweep documents, tasks, artifacts and module placements' },
      { stepId: 'classify', name: 'Classify blockers', description: 'Group by category and severity' },
      { stepId: 'rank', name: 'Rank by impact', description: 'Order by filing impact and effort to resolve' },
    ] },
];

/* ---- Pre-submission gate (POST /orchestration/pre-submission-gate) ---- */

export const AC_GATE: Record<number, AcGate> = {
  301: { submissionType: 'BLA', verdict: 'conditional', verdictRationale: [
      'Readiness is on-track (64) but one critical CMC stability item is open.',
      'CRL risk is moderate; RTF risk is low.',
      'Resolve §3.2.S.7.3 and the gate clears to GO.'],
    readiness: { overallScore: 64, status: 'needs_attention', scores: { completeness: 72, quality: 81, consistency: 76, compliance: 88, routing: 69 } },
    cmc: { contradictionCounts: { critical: 1, high: 2, medium: 1, low: 0, open: 4, resolved: 9 } },
    crl: { overallRisk: 'moderate', riskScore: 42 },
    rtf: { overallRisk: 'low', riskScore: 14 },
    ich: { overallStatus: 'pass', counts: { pass: 22, warning: 3, fail: 0 } } },
  204: { submissionType: 'NDA', verdict: 'hold', verdictRationale: [
      'A CRL comparability deficiency is unresolved -- the gating item for the resubmission.',
      'The eCTD resubmission sequence has 1 open validation error.',
      'PDUFA resubmission clock is running; do not transmit until both clear.'],
    readiness: { overallScore: 61, status: 'at_risk', scores: { completeness: 66, quality: 73, consistency: 58, compliance: 79, routing: 64 } },
    cmc: { contradictionCounts: { critical: 2, high: 1, medium: 2, low: 1, open: 6, resolved: 5 } },
    crl: { overallRisk: 'high', riskScore: 61 },
    rtf: { overallRisk: 'high', riskScore: 58 },
    ich: { overallStatus: 'warning', counts: { pass: 18, warning: 5, fail: 1 } } },
  99: { submissionType: 'sNDA', verdict: 'ready', verdictRationale: [
      'The pediatric-indication sNDA package is complete and filed.',
      'The active pneumonitis signal has a drafted expedited report; no filing blocker.',
      'Routine lifecycle supplements are within their windows.'],
    readiness: { overallScore: 82, status: 'on_track', scores: { completeness: 84, quality: 86, consistency: 80, compliance: 88, routing: 79 } },
    cmc: { contradictionCounts: { critical: 0, high: 0, medium: 1, low: 2, open: 3, resolved: 8 } },
    crl: { overallRisk: 'low', riskScore: 12 },
    rtf: { overallRisk: 'low', riskScore: 9 },
    ich: { overallStatus: 'pass', counts: { pass: 20, warning: 1, fail: 0 } } },
};

/* ---- Role lens ---- */

export const AC_ROLES: AcRole[] = [
  { id: 'all', label: 'All work', modules: ['clinical', 'cmc', 'safety', 'submission', 'labeling', 'nonclinical'] },
  { id: 'ra', label: 'Reg. affairs', modules: ['submission', 'labeling', 'clinical'] },
  { id: 'cmc', label: 'CMC', modules: ['cmc', 'nonclinical'] },
  { id: 'biostat', label: 'Biostatistics', modules: ['clinical'] },
  { id: 'pv', label: 'Safety / PV', modules: ['safety'] },
  { id: 'exec', label: 'Executive', modules: ['clinical', 'cmc', 'safety', 'submission'] },
];
