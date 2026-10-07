/** Preparation of existing biotech authoring documents. Pure planning data:
 * no client files read, no evidence certified, no readiness verdict minted.
 * Discussion markers avoid repeat questions; they are never proof of an answer.
 */
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy';
import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import { componentTemplateIdForRegistry, getDocumentTemplate } from './document-template-library';

export const PREPARATION_MARKETS = ['US', 'EU', 'CA', 'JP'] as const;
export type PreparationMarket = typeof PREPARATION_MARKETS[number];
export const PREPARATION_TOPICS = ['scope', 'source_versions', 'data_cutoff', 'statistical_results', 'estimands', 'safety', 'quality', 'local_requirements', 'japan_evidence', 'agency_commitments', 'review_owners'] as const;
export type PreparationTopic = typeof PREPARATION_TOPICS[number];
export interface PreparationQuestion {
  topic: PreparationTopic;
  question: string;
  why: string;
  requestedEvidence: string;
}
export interface PreparationInput {
  templateId?: string;
  registryId?: string;
  market?: PreparationMarket;
  discussedTopics?: PreparationTopic[];
  family?: string;
}

export interface DocumentPreparationScope {
  entry?: RegulatoryApplicationType;
  market?: PreparationMarket;
  templateId?: string;
}

/** Shared by conversation and drafting, so preparation is not just a tool the
 * model never knows to call. Questions belong in chat, never governed prose. */
export const BIOTECH_AUTHORING_GUIDANCE = `BIOTECH DOCUMENT PREPARATION:
Before a medicinal-product document build, use get_document_template with the exact template_id or registry_id and prepare:true. Pass the confirmed US/EU/CA/JP market when the document is global; never infer a jurisdiction from 'CTA', 'marketing application' or 'biologic'. Read every outline page using nextOffset. Use coverage:true to discover which existing filing outlines are indexed; an unavailable outline needs the current agency/client template, not a fabricated CTD fallback.
Read current project documents and prior client answers first. Ask one to three decisive preparation questions at a time, explain why each matters, integrate the reply and continue only where a material gap remains. discussed_topics only avoid repeated questions; they never verify evidence. Reconcile protocol/SAP versions and prespecification, cutoffs, estimands, validated analyses and TLFs, missing data, deviations, adverse results, safety exposure, manufacturing changes and agency commitments. Use deterministic tools for numbers; never manufacture a study finding. Link every scientific claim to the actual source/version and distinguish observation, inference, uncertainty and unresolved evidence.
EU trials use CTIS Part I/II; Canada CTA is not a full marketing dossier; Japan trial notifications differ from marketing approval. Establish local evidence, language, consent and disclosure requirements, and verify current guidance, adoption/effective dates and technical versions. Dedicated safety-message, dataset and package engines remain necessary.
For an incomplete draft, write supported portions with clearly marked unresolved facts. Keep preparation questions outside the formal document. Save through draft_authoring_document. An outline, draft, saved file, scientific review, approval and technically validated package are distinct; none alone proves filing readiness.`;

/** Section drafting has no conversation channel and may have no tools enabled.
 * Its contract is supported prose plus explicit gaps, not a promised interview. */
export const BIOTECH_DRAFTING_GUIDANCE = `BIOTECH EVIDENCE-BASED DRAFTING:
Draft only from the supplied current source versions and the section requirements. Reconcile protocol/SAP versions and prespecification, cutoffs, estimands, analysis populations, missing data, deviations, validated analyses/TLFs, adverse results, safety exposure, manufacturing changes and agency commitments as relevant. Use deterministic analysis outputs for numbers; do not invent findings, citations or evidence review. Distinguish prespecified findings from exploratory findings and observations from inferences. Preserve source/version references and disclose uncertainty.
If a decisive fact or source is absent or contradictory, leave a clearly marked unresolved placeholder in the draft rather than silently filling it. Keep preparation questions outside the formal document; the client interview occurs in conversation before this section drafting task. Do not claim to have called tools that this task does not provide, read files not supplied, saved a document, performed expert review or validated a package. An outline, draft, saved file, review approval and technically validated package are separate; this prose cannot establish filing readiness.
Apply the confirmed regional procedure and current agency/client template. Harmonized content does not establish identical requirements; verify product applicability, local requirements, adoption/effective dates and technical versions before approval.`;
const question = (topic: PreparationTopic, question: string, why: string, requestedEvidence: string): PreparationQuestion => ({ topic, question, why, requestedEvidence });
const QUESTIONS: Record<PreparationTopic, PreparationQuestion> = {
  scope: question('scope', 'Which product, indication, study phase, target authority/procedure and filing date does this document serve?', 'These determine applicability and the scientific claim the reviewer must evaluate.', 'Open project identity, intended use/indication and confirmed filing objective.'),
  source_versions: question('source_versions', 'Which current source versions govern this build, and do any records conflict or supersede earlier data?', 'A draft must follow the current evidence and preserve the history of changed findings.', 'Protocol/amendments, SAP approval and timing, IB, source reports and agency correspondence with version/date and source locations.'),
  data_cutoff: question('data_cutoff', 'What reporting cutoff or interval applies, and what is the database lock and outstanding-data status?', 'Interim findings cannot silently become final results; safety and efficacy may have different cutoffs.', 'Dated lock/cutoff records, reconciliation status and unresolved queries.'),
  statistical_results: question('statistical_results', 'Which validated analyses and TLFs support the claims, including failed endpoints, missing data, protocol deviations and sensitivity analyses?', 'A defensible report explains uncertainty and contradictory results, not just favorable findings.', 'Reviewed datasets, tables/listings/figures, analysis population denominators, estimands, effect sizes and confidence intervals; prespecified versus exploratory analyses.'),
  estimands: question('estimands', 'What are the estimands, intercurrent-event and missing-data strategies, multiplicity controls and planned sensitivity analyses?', 'The protocol and SAP must answer the same clinical question without inventing statistical assumptions.', 'Protocol objectives/endpoints, SAP versions, design assumptions and deterministic statistical calculation references.'),
  safety: question('safety', 'What exposure, serious events, deaths, discontinuations, emerging signals and reference safety information support the safety assessment?', 'Omitted unfavorable evidence or inconsistent denominators can change the benefit-risk conclusion.', 'Reconciled safety outputs, coding versions, exposure and event definitions, RSI version and medical review.'),
  quality: question('quality', 'Which manufacturing, formulation, assay, comparability and stability records represent the material used in the studies and proposed supply?', 'Clinical findings must remain connected to the actual tested product and control strategy.', 'Batch/source reports, validated methods, specifications, stability data and documented manufacturing changes.'),
  local_requirements: question('local_requirements', 'Which countries, languages, ethics/site requirements and publication or redaction obligations apply?', 'Harmonized content does not replace regional forms, participant protections or disclosure review.', 'Agency/current templates, participating-country requirements, consent/assent variants and disclosure plan.'),
  japan_evidence: question('japan_evidence', 'What Japanese enrollment, PK/PD and ethnic-sensitivity evidence is available, and what has PMDA agreed about use of foreign data?', 'Additional Japanese studies are not automatically needed; the decision depends on available evidence and PMDA advice.', 'Regional enrollment and PK/PD analyses, intrinsic/extrinsic factor assessment and PMDA consultation record.'),
  agency_commitments: question('agency_commitments', 'Which agency questions, meeting agreements, holds, deficiencies or commitments must this document answer?', 'A polished document can still miss the issue the agency asked the sponsor to resolve.', 'Agency letters, agreed minutes and a response/commitment matrix with evidence links.'),
  review_owners: question('review_owners', 'Who will perform the applicable medical, statistical, quality and regulatory reviews, and which gaps prevent their approval?', 'Draft generation, scientific review, approval and technical package validation are separate steps.', 'Named accountable reviewers and current approval/qualification records.'),
};

const PROFILES: Record<string, PreparationTopic[]> = {
  clinical_study_report: ['data_cutoff', 'statistical_results', 'safety'],
  clinical_overview: ['statistical_results', 'safety', 'quality'],
  clinical_summary: ['statistical_results', 'data_cutoff', 'safety'],
  protocol: ['estimands', 'safety', 'quality'],
  statistical_analysis_plan: ['estimands', 'data_cutoff'],
  investigators_brochure: ['safety', 'quality', 'data_cutoff'],
  investigator_brochure: ['safety', 'quality', 'data_cutoff'],
  informed_consent: ['safety', 'local_requirements'],
  dsur: ['data_cutoff', 'safety', 'statistical_results'],
  pbrer: ['data_cutoff', 'safety', 'statistical_results'],
  risk_management_plan: ['safety', 'statistical_results'],
  rmp: ['safety', 'statistical_results'],
  drug_substance: ['quality'], drug_product: ['quality'], quality_overall_summary: ['quality'],
  nonclinical_overview: ['safety', 'quality'],
  impd: ['quality', 'safety'], smpc: ['safety', 'statistical_results'],
  cover_letter: ['agency_commitments'],
};
const CHECKED = '2026-10-07';
const FDA_IND = 'https://www.fda.gov/drugs/types-applications/investigational-new-drug-application-ind';
const EMA_CTIS = 'https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines/clinical-trials-information-system-ctis';
const CANADA_CTA = 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/clinical-trials/clinical-trial-sponsors-applications.html';
const CANADA_FORMAT = 'https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/management-drug-submissions-applications/pre-application-filing.html';
const PMDA_ENGLISH = 'https://www.pmda.go.jp/files/000270639.pdf';
const PMDA_EVIDENCE = 'https://www.pmda.go.jp/files/000266773.pdf';
const basis = (ref: string, url: string): RegulatoryBasis => ({ ref, url, confidence: 'regulator-text', checked: CHECKED });

function regionalRoute(entry: RegulatoryApplicationType | undefined, market: PreparationMarket | undefined) {
  if (!market) return null;
  if (entry?.applicationFamily === 'clinical_trial') {
    if (market === 'EU') return { channel: 'CTIS', scope: 'Trial authorization: Part I scientific dossier and country-specific Part II; lifecycle changes and results are distinct deliverables.', basis: basis('EMA CTIS sponsor workspace; Regulation (EU) 536/2014', EMA_CTIS) };
    if (market === 'CA') return { channel: 'Health Canada CTA: eCTD or non-eCTD, verify current filing instructions', scope: 'CTA/CTA-A: Modules 1–3 as applicable; clinical/administrative material in Module 1 and supporting quality information in Modules 2–3.', basis: basis('Health Canada CTA guidance §2.3.2 and Appendix 3', CANADA_CTA), formatSource: basis('Health Canada management guidance: filing', CANADA_FORMAT) };
    if (market === 'JP') return { channel: 'PMDA clinical trial notification', scope: 'Trial notification and supporting clinical, quality and nonclinical evidence; verify the current notification procedure with PMDA.', basis: { ref: 'Trial-notification preparation route', confidence: 'platform-convention' as const } };
    return { channel: 'FDA IND', scope: 'IND clinical, nonclinical and manufacturing information; FDA forms and amendments as applicable. Confirm delivery specifications for the application.', basis: basis('FDA Investigational New Drug Application', FDA_IND) };
  }
  if (entry?.applicationFamily === 'marketing_authorization') return {
    channel: `${entry.agency}: ${entry.applicationType}`,
    scope: 'CTD Modules 2–5 with regional Module 1, product-specific evidence and current agency technical specifications; a shared CTD does not establish regional conformance.',
    basis: { ref: 'Existing filing registry and ICH CTD authoring plan', confidence: 'platform-convention' as const },
  };
  return { channel: `${market}: confirm document-specific delivery`, scope: 'Confirm the application, lifecycle operation and regional placement before assembling any package.', basis: { ref: 'Document-specific authoring plan', confidence: 'platform-convention' as const } };
}

function exactRegistryEntry(registryId: string | undefined): RegulatoryApplicationType | undefined {
  const entry = registryId ? getApplicationType(registryId) : undefined;
  if (registryId && (!entry || !entry.active)) throw new Error('Use an exact active registry id; the application has not been resolved.');
  return entry;
}

function preparationMarket(entry: RegulatoryApplicationType | undefined, requested: PreparationMarket | undefined): PreparationMarket | undefined {
  if (requested && !PREPARATION_MARKETS.includes(requested)) throw new Error('Unknown preparation market.');
  const entryMarket = entry && PREPARATION_MARKETS.includes(entry.region as PreparationMarket) ? entry.region as PreparationMarket : undefined;
  if (entry && entry.region !== 'GLOBAL' && !entryMarket) throw new Error('This preparation plan covers US, EU, Canada and Japan; use the market-specific tools for other regions.');
  if (entryMarket && requested && entryMarket !== requested) throw new Error('The requested market conflicts with the registry application. Resolve the filing identity first.');
  return entryMarket ?? requested;
}

function preparationTemplateId(input: PreparationInput): string | undefined {
  const named = input.templateId ? getDocumentTemplate(input.templateId) : undefined;
  const component = input.registryId ? componentTemplateIdForRegistry(input.registryId) : undefined;
  return named?.id ?? component ?? input.templateId;
}

function assertRegionalComponentScope(templateId: string | undefined, market: PreparationMarket | undefined): void {
  if (templateId && ['smpc', 'impd', 'risk_management_plan'].includes(templateId) && market && market !== 'EU') {
    throw new Error('This outline represents an EU document. Confirm the current regional and client template before a targeted non-EU build; reference use or a regional addendum is not represented by this API.');
  }
}

/** Exact identity and regional scope apply even to an outline-only lookup. */
export function resolveDocumentPreparationScope(input: PreparationInput): DocumentPreparationScope {
  const entry = exactRegistryEntry(input.registryId);
  const market = preparationMarket(entry, input.market);
  const templateId = preparationTemplateId(input);
  assertRegionalComponentScope(templateId, market);
  return { entry, market, templateId };
}

const DEVICE_FAMILIES = ['estar', 'eu_mdr', 'eu_ivdr'];
function isMedicinalRegistryEntry(entry: RegulatoryApplicationType): boolean {
  return entry.segment === 'pharma_biotech'
    || (entry.region === 'GLOBAL' && ['clinical_document', 'dossier_module', 'safety_report', 'quality_cmc'].includes(entry.applicationFamily));
}

function assertMedicinalPreparation(scope: DocumentPreparationScope, family: string | undefined): void {
  const template = scope.templateId ? getDocumentTemplate(scope.templateId) : undefined;
  const deviceTemplate = template && template.families.length > 0 && template.families.every(f => DEVICE_FAMILIES.includes(f));
  if ((scope.entry && !isMedicinalRegistryEntry(scope.entry)) || deviceTemplate || (family && DEVICE_FAMILIES.includes(family))) {
    throw new Error('This preparation plan is for biotech medicinal-product documents; confirm the product pathway.');
  }
}

function discussedPreparationTopics(input: PreparationInput): PreparationTopic[] {
  const discussedTopics = [...new Set(input.discussedTopics ?? [])];
  if (discussedTopics.some(t => !PREPARATION_TOPICS.includes(t))) throw new Error('Unknown preparation topic.');
  return discussedTopics;
}

function preparationTopics(scope: DocumentPreparationScope): PreparationTopic[] {
  return [...new Set<PreparationTopic>([
    'scope', 'source_versions', ...(PROFILES[scope.templateId ?? ''] ?? ['safety', 'quality', 'statistical_results']),
    'agency_commitments', 'local_requirements', ...(scope.market === 'JP' ? ['japan_evidence' as const] : []), 'review_owners',
  ])];
}

function regionalQuestion(topic: PreparationTopic, market: PreparationMarket | undefined): PreparationQuestion {
  const q = QUESTIONS[topic];
  if (market === 'JP' && topic === 'local_requirements') {
    return { ...q, question: `${q.question} For Japan, confirm whether the English-application trial measure is applicable and advance PMDA consultation is documented.` };
  }
  return q;
}

/** Scope validation fails on ambiguity; never use the registry's fuzzy search. */
export function buildDocumentPreparation(input: PreparationInput) {
  const scope = resolveDocumentPreparationScope(input);
  assertMedicinalPreparation(scope, input.family);
  const { entry, market } = scope;
  const discussedTopics = discussedPreparationTopics(input);
  const remaining = preparationTopics(scope).filter(t => !discussedTopics.includes(t));
  const questions = remaining.slice(0, 3).map(t => regionalQuestion(t, market));
  return {
    kind: 'document_preparation' as const,
    readiness: 'not_assessed' as const, evidenceReviewed: false as const,
    registryId: entry?.id ?? null, market: market ?? null,
    regionalRoute: regionalRoute(entry, market),
    questions, remainingTopics: remaining.slice(3), discussedTopics,
    discussionNotice: 'Discussion markers only prevent repeat questions. They do not verify answers, evidence, review approval or filing readiness. Read current project sources before asking the client for information already present.',
    applicabilityQuestions: [
      'Pediatric population: determine US iPSP and EU PIP applicability separately, including waivers or deferrals.',
      'Biologics, vaccines, biosimilars, cell or gene therapies: determine immunogenicity, potency, comparability and long-term follow-up needs from the product and evidence.',
      'Orphan, accelerated/conditional routes, GMO/environmental assessments, companion diagnostics and combination products: include only applicable regional obligations.',
    ],
    cautions: [
      'An outline is an authoring scaffold; its required flags are not a determination that every section applies or that this is every document the agency needs.',
      'E2B safety messages, validated datasets, define.xml and eCTD backbones require their dedicated recorded-data and technical validation workflows; prose authoring does not qualify them.',
      'Current protocol template, GCP revision, regional adoption/effective date and eCTD version must be checked through regulatory currency and agency sources at filing. A draft guidance is not an operative requirement.',
      ...(market === 'JP' ? ['Additional Japanese studies are not automatically required; assess ethnic factors and available safety evidence with PMDA advice.', 'The English-application trial measure requires qualifying scope and advance PMDA consultation; do not promise a language exemption.'] : []),
    ],
    regionalEvidenceSources: market === 'JP' ? [basis('PMDA/MHLW English application notice, 6 September 2024', PMDA_ENGLISH), basis('MHLW Japanese Phase I principles, 25 December 2023', PMDA_EVIDENCE)] : [],
    reviewGates: [
      'Read and cite current source versions; resolve contradictory and superseded evidence without deleting lineage.',
      'Use deterministic analyses for numbers; distinguish prespecified from exploratory findings and disclose uncertainty.',
      'Independent medical, statistical, quality and regulatory review as applicable.',
      'Save through draft_authoring_document; approval, filing, package validation and agency transmission remain separate.',
    ],
  };
}
