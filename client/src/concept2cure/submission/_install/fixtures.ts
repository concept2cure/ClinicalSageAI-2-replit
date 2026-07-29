/**
 * Submission Center — example payloads (DEV ONLY)
 *
 * Realistic, contract-typed sample responses so a UI kit can build, Storybook,
 * or MSW-mock without a live backend. NOT imported by any production path — this
 * file is for design/dev only. When wiring real data, use the hooks in ./hooks.
 *
 * Each fixture is typed against @shared/types/submission-api, so it breaks at
 * compile time if a contract changes — keeping the examples honest.
 */

import type {
  SubmissionResponse,
  SubmissionListResponse,
  SequenceListResponse,
  LeafListResponse,
  PlanResponse,
  ValidationExplainResponse,
  CrossRegionResponse,
  DispatchQcResponse,
  ProvenanceResponse,
  ConsistencyResponse,
  ShadowReviewRunResponse,
  ShadowFindingResponse,
  RegionProfileResponse,
} from '@shared/types/submission-api';

const now = '2026-06-05T12:00:00.000Z';

export const exampleSubmission: SubmissionResponse = {
  id: 1,
  title: 'C2C-001 IND (FDA)',
  productName: 'C2C-001',
  applicationType: 'ind',
  clientType: 'biotech',
  primaryRegion: 'fda',
  status: 'active',
  lifecycleStage: 'original',
  organizationId: 1,
  createdBy: 1,
  createdAt: new Date(now),
  updatedAt: new Date(now),
  deletedAt: null,
};

export const exampleSubmissions: SubmissionListResponse = [
  exampleSubmission,
  { ...exampleSubmission, id: 2, title: 'MDX-100 510(k) (FDA)', applicationType: '510k', clientType: 'mdx', lifecycleStage: 'planning', status: 'active' },
];

export const exampleSequences: SequenceListResponse = [
  {
    id: 1,
    submissionId: 1,
    region: 'fda',
    sequenceNumber: '0000',
    type: 'original',
    status: 'assembling',
    validationStatus: null,
    dispatchStatus: null,
    frozenAt: null,
    organizationId: 1,
    createdBy: 1,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deletedAt: null,
  },
];

export const exampleLeaves: LeafListResponse = [
  { id: 1, sequenceId: 1, sectionCode: '2.3', title: 'Quality Overall Summary', granularity: null, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 10, leafGuid: null, parentLeafId: null, checksum: null, organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
  { id: 2, sequenceId: 1, sectionCode: '2.5', title: 'Clinical Overview', granularity: null, lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 11, leafGuid: null, parentLeafId: null, checksum: null, organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
  { id: 3, sequenceId: 1, sectionCode: '2.7', title: 'Clinical Summary', granularity: null, lifecycleOp: 'replace', documentTable: 'coauthor_documents', documentId: 12, leafGuid: null, parentLeafId: null, checksum: null, organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
];

export const examplePlan: PlanResponse = {
  moduleMap: [
    { sectionCode: '1.2', title: 'Cover letter', required: true },
    { sectionCode: '2.5', title: 'Clinical Overview', required: true },
    { sectionCode: '3.2.S', title: 'Drug substance', required: true },
  ],
  forms: [
    { formId: '1571', region: 'fda', required: true },
    { formId: '3674', region: 'fda', required: true },
  ],
  timeline: [
    { milestone: 'IND safe-to-proceed', offsetDays: 30 },
  ],
  gaps: [{ sectionCode: '3.2.S.4.2', description: 'Stability data not yet linked.' }],
  dependencies: [{ before: '3.2.S', after: '2.3' }],
};

export const exampleValidationExplain: ValidationExplainResponse = {
  explained: [
    { ruleId: 'FDA-ESG-006', severity: 'error', leaf: '2.5', cause: 'The PDF is not PDF/A conformant.', fix: 'Re-export the document as PDF/A-1b and replace the leaf.' },
  ],
  summary: 'One blocking error: a non-PDF/A file in the Clinical Overview.',
  blocking: true,
};

export const exampleCrossRegion: CrossRegionResponse = {
  perRegion: [
    { region: 'eu', module1Deltas: ['EU Module 1 application form', 'All-language Product Information'], bridgingNeeded: true, bridgingRationale: 'ICH E5: ethnic sensitivity likely; a bridging study may be required.', translationScope: 'SmPC, PIL, labeling in all EU languages.', formatConversion: 'none (eCTD↔eCTD)' },
    { region: 'jp', module1Deltas: ['JP Module 1', 'Japanese-language application'], bridgingNeeded: true, bridgingRationale: 'ICH E5 bridging typically expected for PMDA.', translationScope: 'Core dossier summaries in Japanese.', formatConversion: 'none (eCTD↔eCTD)' },
  ],
};

export const exampleDispatchQc: DispatchQcResponse = {
  clearedToDispatch: false,
  blockers: ['One open error-severity validation finding (non-PDF/A in 2.5).'],
  warnings: ['Sequence has not been frozen.'],
  checklist: [
    { item: 'Required modules present', pass: true },
    { item: 'No open error-severity validation', pass: false },
    { item: 'No unacknowledged Shadow Review criticals', pass: true },
  ],
};

export const exampleProvenance: ProvenanceResponse = {
  submissionId: 1,
  targetSectionCode: '2.7.3',
  links: [
    { id: 1, submissionId: 1, targetSectionCode: '2.7.3', sourceDocumentTable: 'coauthor_documents', sourceDocumentId: 12, sourceLocator: '3 claim(s), 2 source(s)', direction: 'derives_from', confidence: 0.9, organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
  ],
};

export const exampleConsistency: ConsistencyResponse = [
  { id: 1, submissionId: 1, dimension: 'subject-counts', leftRef: '2.7.3', rightRef: '5.3.5.1', status: 'match', detail: null, organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
  { id: 2, submissionId: 1, dimension: 'spec-vs-qos', leftRef: '2.3', rightRef: '3.2.S.4.1', status: 'conflict', detail: 'Assay limit in 2.3 QOS (98.0%) does not match the Module 3 spec (98.5%).', organizationId: 1, createdBy: 1, createdAt: new Date(now), updatedAt: new Date(now), deletedAt: null },
];

export const exampleShadowRun: ShadowReviewRunResponse = {
  runId: 1,
  rtfRiskScore: 0.18,
  crlRiskScore: 0.31,
  summary: 'Two filing-readiness gaps and one benefit-risk weakness to resolve before submission.',
  findingCount: 3,
};

export const exampleShadowFindings: ShadowFindingResponse[] = [
  { id: 1, runId: 1, dimension: 'rtf', severity: 'major', title: 'Form 1571 is not signed', detail: 'Form 1571 is not signed', basis: '21 CFR 312.23(a)(1)', recommendation: 'Attach the signed Form 1571 under Module 1 (US).', leafRef: 'm1.us', status: 'open' },
  { id: 2, runId: 1, dimension: 'crl', severity: 'major', title: 'Benefit-risk integration is thin in 2.5', detail: 'Benefit-risk integration is thin in 2.5', basis: 'ICH M4E(R2)', recommendation: 'Strengthen the integrated benefit-risk in the Clinical Overview.', leafRef: '2.5', status: 'open' },
];

export const exampleRegionProfiles: RegionProfileResponse[] = [
  {
    region: 'fda',
    agency: 'FDA',
    language: 'en',
    currency: 'USD',
    pathways: ['ectd_v322', 'ectd_v40', 'estar'],
    module1Sections: [
      { number: '1.1', title: 'Comprehensive table of contents', required: true, description: 'Auto-generated listing of all documents.' },
      { number: '1.2', title: 'Cover letter', required: true, description: 'Submission cover letter to the review division.' },
    ],
    forms: [
      { name: 'FDA Form 1571', formId: '1571', required: true, description: 'Investigational New Drug Application.' },
    ],
    specificRequirements: ['eCTD format required', 'English language required'],
    validationRuleCount: 8,
  },
];
