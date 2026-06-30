import type { BaseTask, SubmissionPyramid } from './types.js';
import { buildPhase } from './types.js';

/**
 * IND Annual Report Pyramid
 *
 * Required by 21 CFR 312.33, sponsors must submit a brief report of the
 * progress of the investigation within 60 days of the anniversary date
 * that the IND went into effect.
 *
 * @module services/regulatory/pyramids/ind-annual-report-pyramid
 */
export function buildIndAnnualReportPyramid(): SubmissionPyramid {
  const phases: SubmissionPyramid['phases'] = [];

  // ─── Phase 1 — Data Collection & Planning ───────────────────────────────────

  const phase1 = buildPhase('phase1', 'Data Collection & Planning', 1, [
    {
      id: 'anniversary_deadline',
      name: 'Identify IND anniversary date and 60-day deadline',
      estimatedHours: 2,
      role: 'ra_lead',
      critical: true,
      description: 'Confirm the IND effective date, calculate the anniversary date, and establish the 60-day submission deadline per 21 CFR 312.33.',
      risk: {
        severity: 'critical',
        probability: 0.1,
        impact: 'Missing the 60-day filing window is a regulatory violation that may prompt FDA enforcement action',
        mitigations: [
          'Set calendar alerts 90 days before anniversary date',
          'Cross-reference IND acknowledgement letter for effective date',
          'Maintain a regulatory calendar with all IND milestone dates',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        keyConsiderations: [
          'Annual report must be submitted within 60 days of the anniversary date the IND went into effect',
          'Anniversary date is based on the original IND effective date, not subsequent amendments',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 1, regulatoryDeadlineDays: 60 },
      deliverables: ['IND anniversary date confirmation memo', 'Annual report project timeline'],
    },
    {
      id: 'study_status_collection',
      name: 'Collect individual study status summaries',
      estimatedHours: 6,
      role: 'clinical_lead',
      critical: true,
      description: 'Gather status updates from each active, completed, and planned clinical study conducted under the IND during the reporting period.',
      risk: {
        severity: 'high',
        probability: 0.3,
        impact: 'Incomplete study summaries lead to deficient annual report and potential FDA information request',
        mitigations: [
          'Distribute data collection templates to all study teams at least 8 weeks before deadline',
          'Track responses from each site/CRO with a collection log',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(1)',
        keyConsiderations: [
          'Must include individual study information: title, study design, dosing, enrollment status',
          'Cover all studies conducted under the IND during the reporting period',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 2 },
      deliverables: ['Individual study status summary forms', 'Data collection tracking log'],
    },
    {
      id: 'safety_data_compilation',
      name: 'Compile aggregate safety data for reporting period',
      estimatedHours: 8,
      role: 'drug_safety',
      critical: true,
      description: 'Aggregate all adverse event data, SAEs, and safety signals across all studies under the IND for the annual reporting period.',
      risk: {
        severity: 'critical',
        probability: 0.2,
        impact: 'Under-reporting of safety data can trigger FDA clinical hold or enforcement action',
        mitigations: [
          'Reconcile safety database with individual study databases before compilation',
          'Verify completeness against MedWatch/CIOMS submissions filed during the period',
          'Include all IND safety reports (7-day and 15-day) submitted during the period',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(2)',
        fdaGuidanceRef: 'Safety Reporting Requirements for INDs and BA/BE Studies',
        keyConsiderations: [
          'Summary must include most frequent and most serious adverse experiences',
          'Organized by body system with rates/counts for the most common AEs',
          'Must encompass all subjects exposed during the reporting period',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 3 },
      deliverables: ['Aggregate safety data tables', 'AE frequency tabulation by body system', 'Safety database reconciliation report'],
    },
    {
      id: 'cmc_updates',
      name: 'Collect manufacturing/CMC updates',
      estimatedHours: 5,
      role: 'cmc_lead',
      description: 'Gather information on any changes to the drug substance, drug product, manufacturing process, or specifications during the reporting period.',
      risk: {
        severity: 'medium',
        probability: 0.2,
        impact: 'Unreported manufacturing changes may constitute a regulatory violation',
        mitigations: [
          'Review all CMC change control records for the reporting period',
          'Cross-reference IND amendments submitted for manufacturing changes',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(5)',
        keyConsiderations: [
          'Summarize any manufacturing changes made during the period',
          'Include changes to drug substance, drug product, packaging, or labeling',
          'Note any new manufacturing sites or changes to existing sites',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 2 },
      deliverables: ['CMC change summary', 'Manufacturing site status update'],
    },
    {
      id: 'nonclinical_updates',
      name: 'Gather completed/planned nonclinical study updates',
      estimatedHours: 5,
      role: 'nonclinical_lead',
      description: 'Collect summaries of nonclinical studies completed, ongoing, or planned during the reporting period, including any new toxicology or pharmacology findings.',
      risk: {
        severity: 'medium',
        probability: 0.15,
        impact: 'New nonclinical findings not reported may affect ongoing clinical risk assessment',
        mitigations: [
          'Coordinate with CROs conducting nonclinical studies for interim/final reports',
          'Review IND amendments submitted for nonclinical data during the period',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(4)',
        keyConsiderations: [
          'Include preclinical studies completed or in progress during the period',
          'Summarize significant nonclinical findings that may affect clinical risk profile',
          'Note any planned nonclinical studies for the coming year',
        ],
      },
      timeline: { typicalStartWeek: 1, typicalDurationWeeks: 2 },
      deliverables: ['Nonclinical study status summary', 'Nonclinical findings update'],
    },
  ]);
  phases.push(phase1.phase);

  // ─── Phase 2 — Report Drafting ──────────────────────────────────────────────

  const phase2 = buildPhase('phase2', 'Report Drafting', 2, [
    {
      id: 'individual_study_summaries',
      name: 'Draft individual study information summaries',
      estimatedHours: 6,
      role: 'medical_writer',
      critical: true,
      description: 'Prepare narrative summaries for each study conducted under the IND, including study title, design, patient population, dosing information, and current enrollment/completion status.',
      risk: {
        severity: 'high',
        probability: 0.2,
        impact: 'Incomplete or inaccurate study summaries may trigger FDA information requests',
        mitigations: [
          'Use standardized template aligned with 21 CFR 312.33(a)(1)',
          'Cross-reference each summary against the study protocol and latest data',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(1)',
        keyConsiderations: [
          'Must cover each study: title, investigator, study design, dosing information',
          'Include enrollment status (number enrolled, completed, discontinued)',
          'Describe any protocol modifications made during the period',
        ],
      },
      timeline: { typicalStartWeek: 3, typicalDurationWeeks: 2 },
      deliverables: ['Individual study information summaries'],
      documentBindings: [
        { ctdSection: '5.3.5', sectionTitle: 'Individual Study Information — Annual Report', ectdLifecycleOp: 'append', artifactTypes: ['annual_report_study_summary'] },
      ],
    },
    {
      id: 'ae_summary',
      name: 'Draft summary of most frequent/serious AEs',
      estimatedHours: 6,
      role: 'drug_safety',
      critical: true,
      description: 'Prepare a summary of the most frequent and most serious adverse experiences by body system, including adverse event rates and any emerging safety signals.',
      risk: {
        severity: 'critical',
        probability: 0.15,
        impact: 'Failure to adequately summarize AEs may result in clinical hold or FDA safety review',
        mitigations: [
          'Verify AE tabulations against safety database queries',
          'Medical officer review of all serious adverse events',
          'Ensure consistency between AE tables and narrative descriptions',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(2)',
        fdaGuidanceRef: 'Safety Reporting Requirements for INDs and BA/BE Studies',
        keyConsiderations: [
          'Summary of most frequent adverse experiences listed by body system',
          'Summary of most serious adverse experiences and their outcomes',
          'Include all subjects exposed, not just those with AEs',
          'Provide context for interpretation (denominator, exposure duration)',
        ],
      },
      timeline: { typicalStartWeek: 3, typicalDurationWeeks: 2 },
      deliverables: ['AE summary by body system', 'Serious adverse experience narrative summaries'],
      documentBindings: [
        { ctdSection: '2.7.4', sectionTitle: 'Summary of Clinical Safety — Annual Report', ectdLifecycleOp: 'append', artifactTypes: ['safety_summary'] },
      ],
    },
    {
      id: 'ind_safety_reports_summary',
      name: 'Summary of IND safety reports (15-day/7-day) filed during period',
      estimatedHours: 5,
      role: 'drug_safety',
      critical: true,
      description: 'Compile and summarize all IND safety reports submitted during the reporting period, including 15-day alert reports and 7-day telephone/fax reports.',
      risk: {
        severity: 'high',
        probability: 0.15,
        impact: 'Discrepancies between safety reports filed and annual report summaries may raise FDA concerns',
        mitigations: [
          'Reconcile against FDA acknowledgment receipts for all safety reports',
          'Maintain a log of all IND safety reports submitted during the period',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(2)',
        fdaGuidanceRef: 'Safety Reporting Requirements for INDs (21 CFR 312.32)',
        keyConsiderations: [
          'List all IND safety reports (15-day and 7-day) filed during the reporting period',
          'Include brief description of each reported event',
          'Cross-reference IND sequence numbers for each safety report submission',
        ],
      },
      timeline: { typicalStartWeek: 3, typicalDurationWeeks: 1 },
      deliverables: ['IND safety reports log for reporting period', 'Safety report reconciliation summary'],
    },
    {
      id: 'enrollment_summary',
      name: 'Summary of subjects enrolled (total and per study)',
      estimatedHours: 4,
      role: 'clinical_lead',
      description: 'Prepare enrollment summary tables showing total number of subjects enrolled across all studies and broken down by individual study, including demographics where applicable.',
      risk: {
        severity: 'medium',
        probability: 0.2,
        impact: 'Inaccurate enrollment counts may misrepresent the scope of the clinical program',
        mitigations: [
          'Verify enrollment counts directly from IVRS/IXRS or EDC systems',
          'Reconcile against individual site enrollment logs',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(1)',
        keyConsiderations: [
          'Total subjects enrolled across all studies under the IND',
          'Per-study enrollment breakdown',
          'Include number of subjects who completed, discontinued, and are ongoing',
        ],
      },
      timeline: { typicalStartWeek: 4, typicalDurationWeeks: 1 },
      deliverables: ['Enrollment summary table (overall)', 'Per-study enrollment tables'],
    },
    {
      id: 'completed_discontinued_summary',
      name: 'Summary of completed/discontinued studies',
      estimatedHours: 4,
      role: 'clinical_lead',
      description: 'Summarize studies completed or discontinued during the reporting period, including reasons for discontinuation and any significant findings.',
      risk: {
        severity: 'medium',
        probability: 0.15,
        impact: 'Unreported study discontinuations may raise FDA questions about program viability',
        mitigations: [
          'Review all study closure documentation',
          'Include clear rationale for any study discontinuations',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(1)',
        keyConsiderations: [
          'Identify each study completed or discontinued during the period',
          'Provide reasons for discontinuation',
          'Summarize key findings from completed studies',
        ],
      },
      timeline: { typicalStartWeek: 4, typicalDurationWeeks: 1 },
      deliverables: ['Completed/discontinued studies summary'],
    },
    {
      id: 'manufacturing_changes_summary',
      name: 'Summary of manufacturing changes',
      estimatedHours: 4,
      role: 'cmc_lead',
      description: 'Draft a summary of all manufacturing, chemistry, and controls changes made during the reporting period.',
      risk: {
        severity: 'medium',
        probability: 0.2,
        impact: 'Unreported manufacturing changes may lead to product quality or compliance concerns',
        mitigations: [
          'Cross-reference CMC change control logs and IND amendments',
          'Ensure consistency with any chemistry amendments already filed',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(5)',
        keyConsiderations: [
          'Include changes to manufacturing process, specifications, or test methods',
          'Note any changes to drug substance or drug product suppliers',
          'Describe any changes to container closure systems or packaging',
          'Reference applicable IND amendment numbers where changes were filed',
        ],
      },
      timeline: { typicalStartWeek: 4, typicalDurationWeeks: 1 },
      deliverables: ['Manufacturing changes summary narrative'],
      documentBindings: [
        { ctdSection: '3.2.S', sectionTitle: 'Drug Substance — Manufacturing Changes Summary', ectdLifecycleOp: 'append' },
        { ctdSection: '3.2.P', sectionTitle: 'Drug Product — Manufacturing Changes Summary', ectdLifecycleOp: 'append' },
      ],
    },
    {
      id: 'investigational_plan_update',
      name: 'General investigational plan update for coming year',
      estimatedHours: 6,
      role: 'ra_lead',
      critical: true,
      description: 'Draft the forward-looking investigational plan describing studies planned for the coming year, any changes to the overall development strategy, and anticipated regulatory milestones.',
      risk: {
        severity: 'high',
        probability: 0.15,
        impact: 'Vague or missing investigational plan may signal program inactivity and prompt FDA inquiry',
        mitigations: [
          'Align with current clinical development plan',
          'Include specific timelines for planned protocol submissions',
          'Address any FDA feedback received during the period',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(6)',
        fdaGuidanceRef: 'Content and Format of INDs for Phase 1 Studies',
        keyConsiderations: [
          'Describe general investigational plan for the coming year',
          'Include any changes in the risk/benefit assessment',
          'Note any significant foreign marketing developments',
          'Address plans for any new studies or study modifications',
        ],
      },
      timeline: { typicalStartWeek: 4, typicalDurationWeeks: 2 },
      deliverables: ['General investigational plan update narrative'],
      documentBindings: [
        { ctdSection: '1.3', sectionTitle: 'General Investigational Plan — Annual Update', ectdLifecycleOp: 'append' },
      ],
    },
  ], phase1.completeId);
  phases.push(phase2.phase);

  // ─── Phase 3 — Review & Approval ───────────────────────────────────────────

  const phase3 = buildPhase('phase3', 'Review & Approval', 3, [
    {
      id: 'medical_review',
      name: 'Medical review of safety summaries',
      estimatedHours: 6,
      role: 'medical_monitor',
      critical: true,
      description: 'Medical officer review of all safety-related sections of the annual report, including AE summaries, IND safety report listings, and risk/benefit narrative.',
      risk: {
        severity: 'critical',
        probability: 0.15,
        impact: 'Undetected safety signals in the annual report may lead to FDA enforcement action or subject risk',
        mitigations: [
          'Independent medical officer review (not the study medical monitor)',
          'Signal detection analysis using MedDRA-coded AE data',
          'Compare AE rates against known class-effect safety profiles',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33(a)(2)',
        keyConsiderations: [
          'Medical reviewer should assess whether any new safety signals have emerged',
          'Evaluate whether the risk/benefit profile has materially changed',
          'Confirm consistency between safety summaries and individual safety reports',
        ],
      },
      timeline: { typicalStartWeek: 5, typicalDurationWeeks: 1 },
      deliverables: ['Medical review sign-off memo', 'Safety signal assessment'],
    },
    {
      id: 'qc_review',
      name: 'QC review of annual report',
      estimatedHours: 5,
      role: 'qa_manager',
      critical: true,
      description: 'Quality control review of the complete annual report for accuracy, completeness, internal consistency, and formatting compliance.',
      risk: {
        severity: 'high',
        probability: 0.25,
        impact: 'Errors or inconsistencies in the annual report undermine regulatory credibility',
        mitigations: [
          'Use QC checklist covering all 21 CFR 312.33 required elements',
          'Verify numerical consistency across all tables and narratives',
          'Confirm all referenced documents and appendices are included',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        keyConsiderations: [
          'Verify all sections required by 21 CFR 312.33(a)(1)-(6) are present',
          'Check for typographical and factual errors',
          'Confirm formatting meets eCTD specifications',
        ],
      },
      timeline: { typicalStartWeek: 6, typicalDurationWeeks: 1 },
      deliverables: ['QC review checklist (completed)', 'QC findings/deficiency log'],
      subTasks: [
        { id: 'content_check', name: 'Content completeness verification against 21 CFR 312.33', estimatedHours: 2 },
        { id: 'data_accuracy', name: 'Numerical accuracy and consistency check', estimatedHours: 2 },
        { id: 'format_check', name: 'Formatting and eCTD compliance check', estimatedHours: 1 },
      ],
    },
    {
      id: 'cross_reference_check',
      name: 'Cross-reference check against prior annual reports',
      estimatedHours: 4,
      role: 'ra_lead',
      description: 'Compare the current annual report against prior annual reports to ensure continuity, consistency in data presentation, and appropriate year-over-year trend discussion.',
      risk: {
        severity: 'medium',
        probability: 0.2,
        impact: 'Inconsistencies with prior annual reports may raise FDA questions about data integrity',
        mitigations: [
          'Side-by-side comparison of enrollment and safety data across reporting periods',
          'Verify that previously reported ongoing studies are accounted for',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        keyConsiderations: [
          'Ensure cumulative data presentation is consistent across annual reports',
          'Verify that studies reported as ongoing in prior reports have updated status',
          'Confirm any discrepancies from prior reports are explained',
        ],
      },
      timeline: { typicalStartWeek: 6, typicalDurationWeeks: 1 },
      deliverables: ['Cross-reference comparison report', 'Year-over-year data reconciliation'],
    },
    {
      id: 'sponsor_signoff',
      name: 'Sponsor sign-off',
      estimatedHours: 3,
      role: 'ra_lead',
      critical: true,
      description: 'Obtain sponsor (or authorized representative) sign-off on the final annual report before submission to FDA.',
      risk: {
        severity: 'high',
        probability: 0.1,
        impact: 'Delayed sign-off may cause the annual report to miss the 60-day filing deadline',
        mitigations: [
          'Schedule sign-off meeting at least 2 weeks before submission deadline',
          'Provide executive summary briefing to sponsor in advance of sign-off',
          'Have contingency for authorized delegate signature if sponsor unavailable',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        keyConsiderations: [
          'Annual report must be signed by the sponsor or sponsor-authorized representative',
          'Electronic signatures must comply with 21 CFR Part 11',
        ],
      },
      timeline: { typicalStartWeek: 7, typicalDurationWeeks: 1 },
      deliverables: ['Signed annual report approval page'],
    },
  ], phase2.completeId);
  phases.push(phase3.phase);

  // ─── Phase 4 — Submission ───────────────────────────────────────────────────

  const phase4 = buildPhase('phase4', 'Submission', 4, [
    {
      id: 'ectd_compile',
      name: 'Compile eCTD sequence for annual report',
      estimatedHours: 5,
      role: 'regulatory_ops',
      critical: true,
      description: 'Compile the annual report into an eCTD sequence, including proper module placement, lifecycle management, and technical validation.',
      risk: {
        severity: 'high',
        probability: 0.15,
        impact: 'eCTD validation failures will delay submission past the 60-day deadline',
        mitigations: [
          'Use FDA-recognized eCTD publishing tool',
          'Run technical validation and resolve all errors before submission',
          'Verify correct sequence numbering against IND submission history',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        fdaGuidanceRef: 'Providing Regulatory Submissions in Electronic Format — IND',
        keyConsiderations: [
          'Annual report is submitted as a new eCTD sequence under the existing IND',
          'Submission type should indicate annual report',
          'Include cover letter identifying this as the annual report per 21 CFR 312.33',
        ],
      },
      timeline: { typicalStartWeek: 7, typicalDurationWeeks: 1 },
      deliverables: ['Compiled eCTD sequence', 'eCTD validation report (no errors)'],
      documentBindings: [
        { ctdSection: '1.1', sectionTitle: 'Cover Letter — Annual Report', ectdLifecycleOp: 'new', artifactTypes: ['cover_letter'] },
        { ctdSection: '1.2', sectionTitle: 'Administrative — Annual Report', ectdLifecycleOp: 'append', artifactTypes: ['annual_report'] },
      ],
    },
    {
      id: 'submit_to_fda',
      name: 'Submit to FDA',
      estimatedHours: 2,
      role: 'regulatory_ops',
      critical: true,
      description: 'Submit the annual report eCTD sequence to FDA via the Electronic Submissions Gateway (ESG) within the 60-day deadline.',
      risk: {
        severity: 'critical',
        probability: 0.05,
        impact: 'Late submission is a regulatory violation and may prompt FDA enforcement action',
        mitigations: [
          'Submit at least 5 business days before the deadline to allow for ESG technical issues',
          'Have backup submission method documented',
          'Confirm ESG acknowledgment receipt immediately after submission',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.33',
        keyConsiderations: [
          'Must be submitted within 60 days of the IND anniversary date',
          'Submit via FDA ESG',
          'Retain FDA acknowledgment receipt as proof of timely submission',
        ],
      },
      timeline: { typicalStartWeek: 8, typicalDurationWeeks: 1, fdaMilestone: 'IND Annual Report Submission', regulatoryDeadlineDays: 60 },
      deliverables: ['FDA ESG submission acknowledgment', 'Submission confirmation record'],
    },
    {
      id: 'archive',
      name: 'Archive annual report',
      estimatedHours: 2,
      role: 'regulatory_ops',
      description: 'Archive the final annual report package including all source data, review documentation, and submission records per regulatory document retention requirements.',
      risk: {
        severity: 'low',
        probability: 0.1,
        impact: 'Poor archival practices may hinder future annual report preparation or FDA inspection readiness',
        mitigations: [
          'Use validated document management system for archival',
          'Include all supporting documentation and review records',
        ],
      },
      guidance: {
        cfrReference: '21 CFR 312.62',
        keyConsiderations: [
          'Retain records for at least 2 years after the IND is no longer in effect',
          'Archive should include the submitted eCTD, review records, and source data',
          'Ensure retrievability for future annual reports and FDA inspections',
        ],
      },
      timeline: { typicalStartWeek: 8, typicalDurationWeeks: 1 },
      deliverables: ['Archived annual report package', 'Archival log entry'],
    },
  ], phase3.completeId);
  phases.push(phase4.phase);

  // ─── Assemble Pyramid ──────────────────────────────────────────────────────

  const tasks = phases.flatMap(phase => phase.tasks);
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);
  const criticalPathIds = tasks.filter(t => t.critical).map(t => t.id);

  return { type: 'IND_ANNUAL_REPORT', phases, tasks, totalEstimatedHours, criticalPathIds };
}
