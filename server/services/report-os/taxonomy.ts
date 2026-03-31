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
];
