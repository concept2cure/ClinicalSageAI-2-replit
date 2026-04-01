import type { ReportScope } from '@shared/schema/report-os';

export interface ReportTypeDefinition {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: ReportScope[];
  allowedPersonas: string[];
  allowedClientSegments: string[];
  dataDependencies: string[];
  artifactDependencies: string[];
  workflowDependencies: string[];
  anaModules: string[];
  exportTemplate: string;
  governanceRequirements: Record<string, unknown>;
  truthfulnessRules: Record<string, unknown>;
}

export interface ReportBundleDefinition {
  bundleId: string;
  label: string;
  description: string;
  personas: string[];
  allowedScopes: ReportScope[];
  reportTypeIds: string[];
  defaultDeliveryMode: 'platform_email' | 'save_pdf';
  exportFormats: Array<'pdf' | 'json' | 'csv'>;
}

export const REPORT_TYPE_SEED: ReportTypeDefinition[] = [
  {
    typeId: 'readiness.executive_digest',
    label: 'Executive Readiness Digest',
    family: 'readiness',
    allowedScopes: ['program', 'project', 'submission'],
    allowedPersonas: ['executive', 'ra_lead', 'pm'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['submission_readiness', 'section_status', 'artifact_lifecycle'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['project_sections', 'submission_ops'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'executive-board-pack',
    governanceRequirements: { part11: true, auditTrail: true },
    truthfulnessRules: { allowPartial: true, requireBlockers: true, forbidFinalIfMissingCritical: true },
  },
  {
    typeId: 'provenance.evidence_trace_report',
    label: 'Evidence & Provenance Trace Report',
    family: 'evidence_provenance',
    allowedScopes: ['project', 'submission', 'document'],
    allowedPersonas: ['ra_lead', 'medical_writer', 'qa'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['provenance_map', 'cross_refs', 'evidence_links'],
    artifactDependencies: ['concept2cure_artifacts', 'immutable_report_records'],
    workflowDependencies: ['editor_verify_panels'],
    anaModules: ['ana-ri'],
    exportTemplate: 'evidence-provenance-pack',
    governanceRequirements: { part11: true, provenanceCompleteness: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
  {
    typeId: 'compliance.audit_assurance_pack',
    label: 'Compliance & Audit Assurance Pack',
    family: 'compliance_audit',
    allowedScopes: ['project', 'submission', 'document'],
    allowedPersonas: ['qa', 'ra_lead', 'auditor'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['audit_events', 'signature_chain', 'compliance_scan'],
    artifactDependencies: ['immutable_report_records', 'report_seal_events'],
    workflowDependencies: ['signature_workflow', 'governance_boundary'],
    anaModules: ['ana-ri'],
    exportTemplate: 'qa-audit-pack',
    governanceRequirements: { part11: true, signatureChain: true },
    truthfulnessRules: { allowPartial: true, requireExplicitGaps: true },
  },
  {
    typeId: 'writing.medical_writer_review_packet',
    label: 'Medical Writer Review Packet',
    family: 'review_issues',
    allowedScopes: ['project', 'study', 'document'],
    allowedPersonas: ['medical_writer', 'reviewer', 'ra_lead'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['artifact_lifecycle', 'section_status', 'review_findings'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['editor_verify_panels', 'project_sections'],
    anaModules: ['ana-ri', 'working_memory'],
    exportTemplate: 'medical-writer-packet',
    governanceRequirements: { part11: true, reviewerVisibility: true },
    truthfulnessRules: { allowPartial: true, requireExplicitGaps: true },
  },
  {
    typeId: 'cmc.change_control_digest',
    label: 'CMC Change Control Digest',
    family: 'cmc_submission',
    allowedScopes: ['project', 'submission', 'document'],
    allowedPersonas: ['cmc_lead', 'qa', 'ra_lead'],
    allowedClientSegments: ['pharma', 'biotech'],
    dataDependencies: ['artifact_lifecycle', 'submission_readiness', 'compliance_scan'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['change_control', 'governance_boundary'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'cmc-control-pack',
    governanceRequirements: { part11: true, qualitySignals: true },
    truthfulnessRules: { allowPartial: true, requireExplicitGaps: true },
  },
  {
    typeId: 'investor.diligence_summary',
    label: 'Investor and Diligence Summary',
    family: 'investor_diligence',
    allowedScopes: ['account', 'program', 'project'],
    allowedPersonas: ['executive', 'bd', 'investor_relations'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['portfolio_status', 'submission_readiness', 'risk_register'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['project_sections'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'investor-diligence-pack',
    governanceRequirements: { boardReady: true, auditTrail: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
  {
    typeId: 'agency.response_issue_matrix',
    label: 'Agency Response Issue Matrix',
    family: 'agency_response',
    allowedScopes: ['submission', 'document', 'project'],
    allowedPersonas: ['ra_lead', 'qa', 'medical_writer'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['submission_readiness', 'correspondence_issues', 'artifact_lifecycle'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['submission_ops', 'response_workbench'],
    anaModules: ['ana-ri', 'working_memory'],
    exportTemplate: 'agency-response-pack',
    governanceRequirements: { part11: true, correspondenceAudit: true },
    truthfulnessRules: { allowPartial: true, requireBlockers: true, requireExplicitGaps: true },
  },
  {
    typeId: 'correspondence.deficiency_intelligence_digest',
    label: 'Deficiency Intelligence Digest',
    family: 'correspondence_intelligence',
    allowedScopes: ['project', 'submission', 'program', 'account'],
    allowedPersonas: ['ra_lead', 'executive', 'qa'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['correspondence_patterns', 'response_history', 'risk_register'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['communication_center'],
    anaModules: ['ana-ri', 'rim'],
    exportTemplate: 'deficiency-intelligence-digest',
    governanceRequirements: { auditTrail: true, intelligenceCapture: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
  {
    typeId: 'submission.dispatch_cover_pack',
    label: 'Submission Dispatch and Cover Pack',
    family: 'submission_dispatch',
    allowedScopes: ['submission', 'document', 'project'],
    allowedPersonas: ['ra_ops', 'ra_lead', 'publishops'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['submission_readiness', 'artifact_lifecycle', 'dispatch_metadata'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['submission_ops', 'publishops'],
    anaModules: ['ana-ri'],
    exportTemplate: 'dispatch-cover-pack',
    governanceRequirements: { part11: true, dispatchAudit: true },
    truthfulnessRules: { allowPartial: true, requireBlockers: true },
  },
];

export const REPORT_BUNDLE_SEED: ReportBundleDefinition[] = [
  {
    bundleId: 'executive-board-pack',
    label: 'Executive / Board Pack',
    description:
      'Portfolio-ready reporting for leadership teams covering readiness, diligence, and major correspondence themes.',
    personas: ['executive', 'board', 'client_partner'],
    allowedScopes: ['account', 'program', 'project'],
    reportTypeIds: [
      'readiness.executive_digest',
      'investor.diligence_summary',
      'correspondence.deficiency_intelligence_digest',
    ],
    defaultDeliveryMode: 'save_pdf',
    exportFormats: ['pdf', 'json'],
  },
  {
    bundleId: 'ra-lead-submission-pack',
    label: 'RA Lead Submission Pack',
    description:
      'Submission-focused reporting with readiness, provenance, response issue mapping, and dispatch support.',
    personas: ['ra_lead', 'submission_manager'],
    allowedScopes: ['project', 'submission', 'document'],
    reportTypeIds: [
      'readiness.executive_digest',
      'provenance.evidence_trace_report',
      'agency.response_issue_matrix',
      'submission.dispatch_cover_pack',
    ],
    defaultDeliveryMode: 'platform_email',
    exportFormats: ['pdf', 'json', 'csv'],
  },
  {
    bundleId: 'qa-audit-pack',
    label: 'QA / Audit Pack',
    description:
      'Audit-ready evidence of signatures, provenance, readiness gaps, and compliance posture.',
    personas: ['qa', 'auditor', 'ra_lead'],
    allowedScopes: ['project', 'submission', 'document'],
    reportTypeIds: [
      'compliance.audit_assurance_pack',
      'provenance.evidence_trace_report',
      'correspondence.deficiency_intelligence_digest',
    ],
    defaultDeliveryMode: 'save_pdf',
    exportFormats: ['pdf', 'json', 'csv'],
  },
  {
    bundleId: 'medical-writing-pack',
    label: 'Medical Writing Pack',
    description:
      'Document-centric packet for content quality, evidence traceability, and review routing.',
    personas: ['medical_writer', 'reviewer'],
    allowedScopes: ['project', 'study', 'document'],
    reportTypeIds: [
      'writing.medical_writer_review_packet',
      'provenance.evidence_trace_report',
    ],
    defaultDeliveryMode: 'save_pdf',
    exportFormats: ['pdf', 'json'],
  },
  {
    bundleId: 'cmc-pack',
    label: 'CMC Pack',
    description:
      'Change-control, quality, and submission readiness reporting for manufacturing-heavy programs.',
    personas: ['cmc_lead', 'qa', 'ra_lead'],
    allowedScopes: ['project', 'submission', 'document'],
    reportTypeIds: [
      'cmc.change_control_digest',
      'compliance.audit_assurance_pack',
      'submission.dispatch_cover_pack',
    ],
    defaultDeliveryMode: 'save_pdf',
    exportFormats: ['pdf', 'json', 'csv'],
  },
  {
    bundleId: 'agency-response-pack',
    label: 'Agency Response Pack',
    description:
      'Response-oriented bundle for outbound agency communication, issue matrices, and learned deficiency signals.',
    personas: ['ra_lead', 'qa', 'medical_writer'],
    allowedScopes: ['submission', 'project', 'document'],
    reportTypeIds: [
      'agency.response_issue_matrix',
      'submission.dispatch_cover_pack',
      'correspondence.deficiency_intelligence_digest',
    ],
    defaultDeliveryMode: 'platform_email',
    exportFormats: ['pdf', 'json', 'csv'],
  },
];
