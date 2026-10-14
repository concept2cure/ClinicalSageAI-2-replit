/**
 * The organization-wide discovery questionnaire contract. Respondent context is
 * shared with the organization; it does not replace a person's account persona.
 * Answers describe needs only: they never configure access, approve records,
 * create a project, grant modules, or decide regulatory submission readiness.
 */
import { z } from 'zod';

export const DISCOVERY_OPTIONS = {
  role: [
    { value: 'founder', label: 'Founder / company leader' },
    { value: 'regulatory', label: 'Regulatory affairs' },
    { value: 'clinical', label: 'Clinical development' },
    { value: 'quality', label: 'Quality / compliance' },
    { value: 'scientific', label: 'Scientific / technical' },
    { value: 'operations', label: 'Operations / administration' },
    { value: 'consultant', label: 'Consultant / service provider' },
    { value: 'other', label: 'Another role' },
  ],
  regulatoryExperience: [
    { value: 'first_submission', label: 'Preparing my first regulated project' },
    { value: 'working_knowledge', label: 'Some regulatory experience' },
    { value: 'experienced', label: 'Regularly manage regulated projects' },
    { value: 'expert', label: 'Lead regulatory strategy and submissions' },
  ],
  businessContext: [
    { value: 'sponsor', label: 'Developing our own product / program' },
    { value: 'service_provider', label: 'Delivering services for clients' },
    { value: 'research_institution', label: 'Academic / research institution' },
    { value: 'healthcare', label: 'Healthcare organization' },
    { value: 'other', label: 'Another context' },
  ],
  companyStage: [
    { value: 'forming', label: 'Forming the company / initiative' },
    { value: 'early', label: 'Early stage / first programs' },
    { value: 'growing', label: 'Growing team / multiple programs' },
    { value: 'established', label: 'Established organization' },
  ],
  productModalities: [
    { value: 'small_molecule', label: 'Small molecule' },
    { value: 'biologic', label: 'Biologic' },
    { value: 'cell_gene', label: 'Cell / gene therapy' },
    { value: 'medical_device', label: 'Medical device' },
    { value: 'diagnostic', label: 'Diagnostic / IVD' },
    { value: 'software', label: 'Software / digital health' },
    { value: 'combination', label: 'Combination product' },
    { value: 'other', label: 'Another product / service' },
  ],
  developmentStage: [
    { value: 'discovery', label: 'Discovery / concept' },
    { value: 'preclinical', label: 'Preclinical / feasibility' },
    { value: 'clinical', label: 'Clinical development / investigation' },
    { value: 'marketing', label: 'Marketing application / launch' },
    { value: 'post_market', label: 'Post-market / lifecycle' },
    { value: 'service_delivery', label: 'Client service delivery' },
  ],
  firstDeliverable: [
    { value: 'strategy', label: 'Project / regulatory strategy' },
    { value: 'protocol', label: 'Clinical protocol' },
    { value: 'regulatory_document', label: 'Regulatory document' },
    { value: 'submission', label: 'Submission package' },
    { value: 'quality_document', label: 'Controlled quality document' },
    { value: 'evidence_review', label: 'Evidence / gap review' },
    { value: 'portfolio_report', label: 'Project / portfolio report' },
  ],
  targetMarkets: [
    { value: 'us', label: 'United States' }, { value: 'eu', label: 'European Union' },
    { value: 'uk', label: 'United Kingdom' }, { value: 'japan', label: 'Japan' },
    { value: 'canada', label: 'Canada' }, { value: 'other', label: 'Another market / undecided' },
  ],
  workflowNeeds: [
    { value: 'projects', label: 'Project planning and tasks' },
    { value: 'vault', label: 'Source documents and evidence' },
    { value: 'authoring', label: 'Document authoring and review' },
    { value: 'submissions', label: 'Submission assembly' },
    { value: 'readiness', label: 'Submission readiness checks' },
    { value: 'quality', label: 'Controlled quality documents' },
    { value: 'analytics', label: 'Reporting and analytics' },
    { value: 'cmc', label: 'CMC / Module 3 preparation' },
  ],
  teamSize: [
    { value: 'solo', label: 'Just me' }, { value: '2_10', label: '2–10 people' },
    { value: '11_50', label: '11–50 people' }, { value: '51_200', label: '51–200 people' },
    { value: '201_plus', label: 'More than 200 people' },
  ],
  collaborationModel: [
    { value: 'solo', label: 'Working independently' },
    { value: 'internal', label: 'Internal team' },
    { value: 'external', label: 'External partners / client team' },
    { value: 'mixed', label: 'Internal and external teams' },
  ],
  dataReadiness: [
    { value: 'starting', label: 'Starting to collect sources' },
    { value: 'partial', label: 'Some sources available; gaps remain' },
    { value: 'organized', label: 'Sources organized for review' },
    { value: 'controlled', label: 'Controlled documents and review process' },
  ],
  securityNeeds: [
    { value: 'mfa', label: 'Multi-factor authentication' },
    { value: 'sso', label: 'Enterprise sign-in / SSO' },
    { value: 'access_review', label: 'Roles and access review' },
    { value: 'external_collaboration', label: 'External collaborator access' },
    { value: 'retention', label: 'Retention / legal hold requirements' },
    { value: 'residency', label: 'Data residency requirements' },
    { value: 'unsure', label: 'Help me establish the requirements' },
  ],
  supportPreference: [
    { value: 'guided', label: 'Guide me through each step' },
    { value: 'independent', label: 'I prefer to work independently' },
    { value: 'team_led', label: 'Coordinate setup with my team' },
  ],
  serviceScope: [
    { value: 'clinical', label: 'Clinical development / operations' },
    { value: 'regulatory', label: 'Regulatory affairs / writing' },
    { value: 'quality', label: 'Quality / compliance' },
    { value: 'scientific', label: 'Scientific / technical services' },
    { value: 'operations', label: 'Program management / operations' },
    { value: 'other', label: 'Other services' },
  ],
} as const;

function draftChoice<T extends readonly { value: string }[]>(options: T) {
  const values = ['', ...options.map(option => option.value)] as ['', ...T[number]['value'][]];
  return z.enum(values).default('');
}
function multipleChoice<T extends readonly { value: string }[]>(options: T) {
  const values = options.map(option => option.value) as [T[number]['value'], ...T[number]['value'][]];
  return z.array(z.enum(values)).max(options.length).refine(values => new Set(values).size === values.length, 'Select each option once.').default([]);
}
const narrative = z.string().trim().max(2000).default('');
const dateAnswer = z.string().refine(value => {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.').default('');

/** Blank strings and arrays are valid drafts; completion is assessed separately. */
export const onboardingDiscoveryAnswersSchema = z.object({
  role: draftChoice(DISCOVERY_OPTIONS.role),
  regulatoryExperience: draftChoice(DISCOVERY_OPTIONS.regulatoryExperience),
  businessContext: draftChoice(DISCOVERY_OPTIONS.businessContext),
  companyStage: draftChoice(DISCOVERY_OPTIONS.companyStage),
  companyGoal: narrative,
  productModalities: multipleChoice(DISCOVERY_OPTIONS.productModalities),
  developmentStage: draftChoice(DISCOVERY_OPTIONS.developmentStage),
  therapeuticAreas: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  indication: narrative,
  devicePurpose: narrative,
  serviceScope: multipleChoice(DISCOVERY_OPTIONS.serviceScope),
  projectName: z.string().trim().max(120).default(''),
  projectGoal: narrative,
  firstDeliverable: draftChoice(DISCOVERY_OPTIONS.firstDeliverable),
  targetMarkets: multipleChoice(DISCOVERY_OPTIONS.targetMarkets),
  targetDate: dateAnswer,
  workflowNeeds: multipleChoice(DISCOVERY_OPTIONS.workflowNeeds),
  teamSize: draftChoice(DISCOVERY_OPTIONS.teamSize),
  collaborationModel: draftChoice(DISCOVERY_OPTIONS.collaborationModel),
  dataReadiness: draftChoice(DISCOVERY_OPTIONS.dataReadiness),
  existingSystems: narrative,
  securityNeeds: multipleChoice(DISCOVERY_OPTIONS.securityNeeds),
  successCriteria: narrative,
  constraints: narrative,
  supportPreference: draftChoice(DISCOVERY_OPTIONS.supportPreference),
}).strict();

export type OnboardingDiscoveryAnswers = z.infer<typeof onboardingDiscoveryAnswersSchema>;
export type DiscoveryField = keyof OnboardingDiscoveryAnswers;
export const DISCOVERY_FIELD_LABELS: Record<DiscoveryField, string> = {
  role: 'Your role', regulatoryExperience: 'Regulatory experience',
  businessContext: 'Organization context', companyStage: 'Company stage', companyGoal: 'Company goal',
  productModalities: 'Product / service types', developmentStage: 'Development / delivery stage',
  therapeuticAreas: 'Therapeutic areas', indication: 'Indication / patient population',
  devicePurpose: 'Device / diagnostic intended use', serviceScope: 'Client services',
  projectName: 'First project name', projectGoal: 'Project goal', firstDeliverable: 'First deliverable',
  targetMarkets: 'Target markets', targetDate: 'Target date', workflowNeeds: 'Priority workflows',
  teamSize: 'Team size', collaborationModel: 'Collaboration model', dataReadiness: 'Source readiness',
  existingSystems: 'Existing systems', securityNeeds: 'Security requirements',
  successCriteria: 'Success criteria', constraints: 'Constraints', supportPreference: 'Support preference',
};

export function emptyDiscoveryAnswers(): OnboardingDiscoveryAnswers {
  return onboardingDiscoveryAnswersSchema.parse({});
}

const BASE_REQUIRED: readonly DiscoveryField[] = [
  'role', 'regulatoryExperience', 'businessContext', 'companyStage', 'companyGoal',
  'productModalities', 'developmentStage', 'projectName', 'projectGoal', 'firstDeliverable',
  'targetMarkets', 'workflowNeeds', 'teamSize', 'collaborationModel', 'dataReadiness',
  'securityNeeds', 'successCriteria', 'supportPreference',
];

/** Conditions use recorded answers; no model infers product classification. */
export function requiredDiscoveryFields(answers: OnboardingDiscoveryAnswers): DiscoveryField[] {
  const required = [...BASE_REQUIRED];
  if (answers.productModalities.some(value => ['small_molecule', 'biologic', 'cell_gene', 'combination'].includes(value))) {
    required.push('therapeuticAreas', 'indication');
  }
  if (answers.productModalities.some(value => ['medical_device', 'diagnostic', 'software', 'combination'].includes(value))) {
    required.push('devicePurpose');
  }
  if (answers.businessContext === 'service_provider') required.push('serviceScope');
  return required;
}

export interface DiscoveryRecommendation {
  id: string;
  title: string;
  description: string;
  surface: string;
  priority: 'first' | 'next';
}
export interface OnboardingDiscoveryAssessment {
  requiredFields: DiscoveryField[];
  missingFields: DiscoveryField[];
  completionPercent: number;
  readyToComplete: boolean;
  recommendations: DiscoveryRecommendation[];
}

interface RecommendationRule {
  when: (answers: OnboardingDiscoveryAnswers) => boolean;
  recommendation: DiscoveryRecommendation;
}
const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  { when: () => true, recommendation: { id: 'security-review', title: 'Review account security', description: 'Verify your second factor, organization security requirements and administrator responsibilities before inviting collaborators.', surface: 'setup', priority: 'first' } },
  { when: () => true, recommendation: { id: 'define-project', title: 'Create or select your first project', description: 'Carry the agreed goal, deliverable and market into project setup. Saving discovery does not create a project.', surface: 'projects', priority: 'first' } },
  {
    when: answers => answers.regulatoryExperience === 'first_submission' || answers.supportPreference === 'guided',
    recommendation: { id: 'guided-start', title: 'Start with guided planning', description: 'Use AnA to discuss the project goal, evidence gaps and next steps; review its proposals before applying changes.', surface: 'conversation-thread', priority: 'first' },
  },
  {
    when: answers => ['forming', 'early'].includes(answers.companyStage),
    recommendation: { id: 'organization-baseline', title: 'Establish the workspace baseline', description: 'Confirm the organization profile and decide who owns administration and review responsibilities.', surface: 'admin-console', priority: 'next' },
  },
  {
    when: answers => answers.businessContext === 'service_provider' || ['external', 'mixed'].includes(answers.collaborationModel) || answers.securityNeeds.includes('access_review'),
    recommendation: { id: 'collaborator-access', title: 'Plan collaborator access', description: 'Have an administrator verify client boundaries and grant the minimum access each collaborator needs.', surface: 'admin-console', priority: 'first' },
  },
  {
    when: answers => answers.securityNeeds.includes('sso'),
    recommendation: { id: 'enterprise-signin', title: 'Review enterprise sign-in requirements', description: 'Ask your administrator to review the supported identity configuration and coordinate SSO setup.', surface: 'identity-console', priority: 'next' },
  },
  {
    when: answers => answers.securityNeeds.some(value => ['residency', 'retention', 'unsure'].includes(value)),
    recommendation: { id: 'data-policy', title: 'Confirm data handling requirements', description: 'Review required retention, residency and data handling with your administrator before adding sensitive source documents.', surface: 'setup', priority: 'first' },
  },
  {
    when: answers => ['starting', 'partial'].includes(answers.dataReadiness) || answers.workflowNeeds.includes('vault') || answers.firstDeliverable === 'evidence_review',
    recommendation: { id: 'source-baseline', title: 'Organize your source evidence', description: 'Add available source documents to the Vault and identify remaining evidence gaps.', surface: 'vault', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('authoring') || ['protocol', 'regulatory_document'].includes(answers.firstDeliverable),
    recommendation: { id: 'document-review', title: 'Plan authoring and review', description: 'Choose the document to prepare and agree on its reviewers and approver before drafting.', surface: 'document-authoring', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('submissions') || answers.firstDeliverable === 'submission',
    recommendation: { id: 'submission-plan', title: 'Plan the submission package', description: 'Select the project and confirm the filing type and market in Submission Center. Supported scope and entitlements still apply.', surface: 'submission-center', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('readiness') || answers.firstDeliverable === 'submission',
    recommendation: { id: 'submission-checks', title: 'Review submission readiness', description: 'Run the project’s deterministic checks after assembling its sequence; discovery answers are not a filing verdict.', surface: 'dispatch-readiness', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('quality') || answers.firstDeliverable === 'quality_document',
    recommendation: { id: 'quality-documents', title: 'Set up controlled quality documents', description: 'Agree on document owners, review, approval and training responsibilities in the quality workspace.', surface: 'quality', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('analytics') || answers.firstDeliverable === 'portfolio_report',
    recommendation: { id: 'project-reporting', title: 'Review project reporting', description: 'Select the recorded project data and reports that support your success criteria.', surface: 'insights', priority: 'next' },
  },
  {
    when: answers => answers.workflowNeeds.includes('cmc') && answers.productModalities.length === 1 && answers.productModalities[0] === 'small_molecule' && answers.targetMarkets.includes('us') && ['preclinical', 'clinical'].includes(answers.developmentStage) && answers.firstDeliverable === 'submission',
    recommendation: { id: 'cmc-scope', title: 'Review CMC / Module 3 scope', description: 'CMC composition supports small-molecule Module 3 for a US IND. Confirm the actual filing type and access before preparing content.', surface: 'cmc', priority: 'next' },
  },
];

/** Deterministic guidance; completion is questionnaire coverage, never readiness to file. */
export function assessOnboardingDiscovery(answers: OnboardingDiscoveryAnswers): OnboardingDiscoveryAssessment {
  const requiredFields = requiredDiscoveryFields(answers);
  const missingFields = requiredFields.filter(field => {
    const value = answers[field];
    return Array.isArray(value) ? !value.some(entry => entry.trim().length > 0) : value.trim().length === 0;
  });
  const recommendations = RECOMMENDATION_RULES.filter(rule => rule.when(answers)).map(rule => ({ ...rule.recommendation }));
  return { requiredFields, missingFields, completionPercent: Math.round((requiredFields.length - missingFields.length) / requiredFields.length * 100), readyToComplete: missingFields.length === 0, recommendations };
}

export const onboardingDiscoveryRecordSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().positive(),
  answers: onboardingDiscoveryAnswersSchema,
  updatedAt: z.string().datetime(), updatedBy: z.number().int().positive(),
  completedAt: z.string().datetime().nullable(),
}).strict().superRefine((record, context) => {
  if (record.completedAt && !assessOnboardingDiscovery(record.answers).readyToComplete) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedAt'], message: 'Completed discovery must contain the required answers.' });
  }
});
export type OnboardingDiscoveryRecord = z.infer<typeof onboardingDiscoveryRecordSchema>;
export const onboardingDiscoveryPatchSchema = z.object({
  answers: onboardingDiscoveryAnswersSchema,
  expectedRevision: z.number().int().nonnegative(),
  complete: z.boolean().default(false),
  reason: z.string().trim().min(10, 'Explain this discovery update in at least 10 characters.').max(500),
}).strict();
export interface OnboardingDiscoveryResponse {
  discovery: OnboardingDiscoveryRecord | null;
  assessment: OnboardingDiscoveryAssessment;
  canEdit: boolean;
}
