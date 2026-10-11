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
Read current project documents and prior client answers first. Ask one to three decisive preparation questions at a time, explain why each matters, integrate the reply and continue only where a material gap remains. discussed_topics only avoid repeated questions; they never verify evidence. Apply them to the current document, source versions and filing scope; revisit affected topics when those change. Reconcile protocol/SAP versions and prespecification, cutoffs, estimands, validated analyses and TLFs, missing data, deviations, adverse results, safety exposure, manufacturing changes and agency commitments. Use deterministic tools for numbers; never manufacture a study finding. Link every scientific claim to the actual source/version and distinguish observation, inference, uncertainty and unresolved evidence.
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
  source_versions: question('source_versions', 'Which current source versions govern this build, and do any records conflict or supersede earlier data?', 'A draft must follow the current evidence and preserve the history of changed findings.', 'Study identifiers, protocol/amendments, SAP approval and timing, IB, source reports and agency correspondence with version/date and source locations, as applicable.'),
  data_cutoff: question('data_cutoff', 'What reporting cutoff or interval applies, and what is the database lock and outstanding-data status?', 'Interim findings cannot silently become final results; safety and efficacy may have different cutoffs.', 'Dated lock/cutoff records, reconciliation status and unresolved queries.'),
  statistical_results: question('statistical_results', 'Which validated analyses and TLFs support the claims, including failed endpoints, missing data, protocol deviations and sensitivity analyses?', 'A defensible report explains uncertainty and contradictory results, not just favorable findings.', 'Reviewed datasets, tables/listings/figures, analysis population denominators, endpoint definitions, units and timepoints, estimands, effect sizes and confidence intervals; prespecified versus exploratory analyses.'),
  estimands: question('estimands', 'What are the estimands, intercurrent-event and missing-data strategies, multiplicity controls and planned sensitivity analyses?', 'The protocol and SAP must answer the same clinical question without inventing statistical assumptions.', 'Protocol objectives/endpoints, SAP versions, design assumptions and deterministic statistical calculation references.'),
  safety: question('safety', 'What exposure, serious events, deaths, discontinuations, emerging signals and reference safety information support the safety assessment?', 'Omitted unfavorable evidence or inconsistent denominators can change the benefit-risk conclusion.', 'Reconciled safety outputs, coding versions, exposure and event definitions, RSI version and medical review.'),
  quality: question('quality', 'Which manufacturing, formulation, assay, comparability and stability records represent the material used in the studies and proposed supply?', 'Clinical findings must remain connected to the actual tested product and control strategy.', 'Batch/source reports, validated methods and units, specifications, stability conditions/timepoints and data, and documented manufacturing changes.'),
  local_requirements: question('local_requirements', 'Which countries, languages, ethics/site requirements and publication or redaction obligations apply?', 'Harmonized content does not replace regional forms, participant protections or disclosure review.', 'Agency/current templates, participating-country requirements, consent/assent variants and disclosure plan.'),
  japan_evidence: question('japan_evidence', 'What Japanese enrollment, PK/PD and ethnic-sensitivity evidence is available, and what has PMDA agreed about use of foreign data?', 'Additional Japanese studies are not automatically needed; the decision depends on available evidence and PMDA advice.', 'Regional enrollment and PK/PD analyses, intrinsic/extrinsic factor assessment and PMDA consultation record.'),
  agency_commitments: question('agency_commitments', 'Which agency questions, meeting agreements, holds, deficiencies or commitments must this document answer?', 'A polished document can still miss the issue the agency asked the sponsor to resolve.', 'Agency letters, agreed minutes and a response/commitment matrix with evidence links.'),
  review_owners: question('review_owners', 'Who will perform the applicable medical, statistical, quality and regulatory reviews, and which gaps prevent their approval?', 'Draft generation, scientific review, approval and technical package validation are separate steps.', 'Named accountable reviewers and current approval/qualification records.'),
};

/** Reuse an existing inquiry prompt without creating or validating a preparation
 * plan. A prompt is not evidence review; callers retain their document scope. */
export function getDocumentPreparationQuestion(topic: PreparationTopic): PreparationQuestion {
  return { ...QUESTIONS[topic] };
}

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
/** Inquiry profiles are platform planning prompts, not a mandatory-document or
 * evidence-sufficiency matrix. Reuse the existing topics so conversation markers
 * and tool schemas keep one contract; vary the question to fit the actual build. */
interface InquiryProfile {
  topics: PreparationTopic[];
  questions?: Partial<Record<PreparationTopic, PreparationQuestion>>;
}
const inquiryProfile = (topics: PreparationTopic[], questions: PreparationQuestion[] = []): InquiryProfile => ({
  topics, questions: Object.fromEntries(questions.map(q => [q.topic, q])),
});
const INQUIRY_PROFILES: Record<string, InquiryProfile> = {
  amendment: inquiryProfile(['agency_commitments', 'safety', 'quality', 'estimands'], [
    question('scope', 'What amendment or change is proposed, to which active trial/application and approved baseline, and what triggered it?', 'The change must be assessed against the actual existing authorization and procedure.', 'Application/study identifiers, amendment subtype, change rationale, affected countries/sites and proposed implementation date.'),
    question('source_versions', 'Which approved baseline and proposed versions show the amendment, and which downstream records need reconciliation?', 'A replacement protocol, IB or quality record must not silently erase the history of the change.', 'Approved baseline, proposed clean and tracked versions, comparison table, source links and consent/SAP/IB/quality impact assessment as applicable.'),
    question('agency_commitments', 'Is this a sponsor-initiated amendment, an agency-requested change or a response to a hold/deficiency, and which issues remain open?', 'These require different scope and supporting evidence; a draft does not establish permission to implement.', 'Agency letters, request/response matrix, trigger record, applicable approval/notification assessment and accountable regulatory review.'),
  ]),
  change: inquiryProfile(['quality', 'safety', 'statistical_results'], [
    question('scope', 'Which currently approved or authorized product/application is changing, what is the proposed change, and what regional procedure and implementation date have been assessed?', 'A lifecycle change is scoped to affected evidence and the established authorization.', 'Current authorization, approved conditions, change-control record, regional classification rationale and proposed implementation plan.'),
    question('source_versions', 'Which current approved and proposed versions, with tracked changes, identify every affected section and cross-reference?', 'Unchanged evidence can be referenced; changed claims need a traceable comparison.', 'Approved baseline, proposed clean/tracked text, affected-section matrix, related labels, source reports and prior sequences.'),
    question('quality', 'Which quality records are affected, and how have comparability, stability, clinical supply and any safety or efficacy impacts been assessed?', 'Manufacturing-only, labeling and indication changes need different evidence; do not assume every domain or a new study applies.', 'Affected change-control/CMC records, batch and method comparisons, stability/comparability assessment and documented justification for affected or unaffected scientific domains.'),
  ]),
  meeting: inquiryProfile(['agency_commitments', 'quality', 'estimands', 'safety'], [
    question('scope', 'Which authority, meeting/advice procedure and development milestone apply, and what decisions must the discussion resolve?', 'A useful briefing package is organized around a specific decision and current procedure.', 'Meeting/advice request, accepted scope and format, product development status and confirmed agency/client instructions.'),
    question('agency_commitments', 'What numbered questions and sponsor positions need agency advice, which supporting evidence answers each, and which uncertainties remain?', 'The client needs actionable advice rather than an undirected summary of the programme.', 'Numbered questions, sponsor positions with rationale/source links, alternatives, prior advice/minutes and unresolved issue matrix.'),
  ]),
  master_file: inquiryProfile(['quality', 'agency_commitments'], [
    question('quality', 'Which confidential quality records, holder/applicant responsibilities and rights of access or reference apply to this master file?', 'A master file and the applicant dossier must agree without exposing restricted content or presuming authority to reference it.', 'Current holder/applicant parts as applicable, letters of authorization/access, referenced version, manufacturer/site records, specifications and change-notification arrangements.'),
  ]),
  pediatric: inquiryProfile(['estimands', 'safety', 'agency_commitments'], [
    question('estimands', 'Which pediatric age groups and conditions are covered, what extrapolation and dose/formulation rationale is supported, and which studies or plan modifications are proposed?', 'The plan must connect the development question to the population, feasible design and existing agency decisions.', 'Current regional pediatric plan and decisions, waiver/deferral requests or decisions as applicable, age-group evidence, extrapolation rationale, formulations, endpoints and study/timeline proposals.'),
    question('safety', 'Which age-specific risks, feasible procedures, safety monitoring and participant-protection measures support the proposed pediatric studies?', 'Adult experience cannot silently establish acceptability for every pediatric group.', 'Age-specific exposure/safety data, nonclinical support as applicable, risk/procedure assessment, monitoring plan and local consent/assent review.'),
  ]),
  orphan: inquiryProfile(['statistical_results', 'agency_commitments'], [
    question('statistical_results', 'How is the proposed rare condition defined, and which current regional prevalence or other applicable rarity/eligibility evidence and medical rationale support designation?', 'Rarity and a plausible development rationale need reproducible evidence; designation does not prove efficacy or approval.', 'Condition definition, dated epidemiology sources and estimation methods, assumptions/uncertainty, product-specific nonclinical or clinical support and regional eligibility assessment.'),
  ]),
  biosimilar: inquiryProfile(['quality', 'statistical_results', 'safety'], [
    question('quality', 'Which reference product and lots underpin the comparative analytical evidence, and what residual uncertainty or bridging issue remains?', 'The comparative evidence and its limits must drive the development argument; do not prescribe a universal clinical study.', 'Reference-product identity/source and lot history, comparative analytical study reports, methods and quality attributes, differences, residual-uncertainty assessment and relevant agency advice.'),
    question('statistical_results', 'What comparative PK/PD, immunogenicity or other clinical evidence is available as applicable, and what supports any proposed indication extrapolation?', 'Comparative findings and indication-specific reasoning must be assessed together with analytical evidence.', 'Reviewed comparative analyses with prespecified methods, populations/denominators, immunogenicity outputs as applicable, extrapolation rationale and unresolved evidence or agency questions.'),
  ]),
  safety_case: inquiryProfile(['safety', 'agency_commitments'], [
    question('safety', 'What initial receipt/awareness and follow-up records identify this case, duplicate status, suspect products, seriousness, expectedness and causal assessment?', 'Case reconciliation and medical assessment must precede a reportability or timing decision; prose is not a validated safety message.', 'Source case and follow-up versions, receipt/awareness dates, reconciled patient/event/product records, RSI version, medical assessment, duplicate/linkage checks and regional reportability review.'),
  ]),
  ind_safety: inquiryProfile(['safety', 'agency_commitments'], [
    question('safety', 'Does this IND safety assessment concern an individual case, an aggregate finding or another important risk, and what receipt/awareness, follow-up and medical assessment support it?', 'An aggregate finding must not be forced into a single-case explanation or treated as a confirmed causal conclusion.', 'Current case/follow-up and duplicate records where applicable, aggregate comparison analyses and denominators where applicable, date the reporting criterion was recognized, RSI/source versions, medical review and regional reporting assessment.'),
  ]),
  risk_management: inquiryProfile(['safety', 'agency_commitments', 'statistical_results'], [
    question('safety', 'Which identified or potential risks and missing information justify the proposed risk-minimization or risk-control activities, and how will their implementation and effectiveness be assessed?', 'A risk-management plan connects evidence to specific actions and measurable assessment rather than merely listing events.', 'Current safety specification, regional agency decisions, applicable risk-control materials, responsible owners, implementation/assessment schedule and effectiveness evidence or study proposals.'),
  ]),
  signal: inquiryProfile(['safety', 'data_cutoff', 'statistical_results'], [
    question('safety', 'What evidence supports or refutes the proposed safety signal, which alternative explanations remain, and what medical review and follow-up actions are documented?', 'An alert or statistical association is not automatically an established causal risk.', 'Reconciled cases and aggregate analyses with denominators, case definitions, data/coding versions, literature, confounding/bias assessment, medical review and documented signal decisions/action history.'),
  ]),
  integral_device: inquiryProfile(['quality', 'agency_commitments'], [
    question('quality', 'Which integral device part, medicinal-product configuration and intended use are covered by the opinion, and which interface or compatibility issues remain?', 'A medicinal-product dossier and an opinion on the device part have related but distinct review scopes.', 'Device-part description, configuration/version, interface and compatibility evidence, risk/performance records, Notified Body opinion and questions, and affected medicinal-product dossier references.'),
  ]),
  aggregate: inquiryProfile(['data_cutoff', 'safety', 'statistical_results'], [
    question('data_cutoff', 'What reporting interval, data lock point and interval versus cumulative evidence apply, and which sources or partner data remain unreconciled?', 'A periodic report must not mix reporting periods or silently omit late and partner information.', 'Dated reporting calendar/lock record, interval and cumulative data specifications, reconciliation logs, partner agreements and prior-report identifiers.'),
  ]),
  annual: inquiryProfile(['data_cutoff', 'agency_commitments', 'safety', 'quality'], [
    question('data_cutoff', 'Which annual reporting period applies, and what interval and cumulative study, safety, distribution, labeling or quality information is applicable?', 'An annual lifecycle report and an aggregate safety report are distinct builds with different source scope.', 'Application-specific reporting calendar, period/cutoff records, interval and cumulative records, change history and applicable commitment/study status sources.'),
  ]),
  commitments: inquiryProfile(['agency_commitments', 'statistical_results', 'data_cutoff', 'safety'], [
    question('agency_commitments', 'Which actual post-marketing requirement or commitment is being addressed, and is this a plan, status update or final report?', 'A stated intention does not establish that an agency obligation or milestone has been fulfilled.', 'Agency obligation/commitment letter and amendments, protocol/SAP, milestone schedule, actual status and delays, evidence links and approved regulatory response history.'),
  ]),
  quality: inquiryProfile(['quality', 'agency_commitments']),
  comparability: inquiryProfile(['quality', 'agency_commitments'], [
    question('quality', 'Which manufacturing changes, pre-change and post-change materials, methods and prospective acceptance criteria define this comparability exercise?', 'Manufacturing comparability and biosimilarity to a reference product are different scientific questions.', 'Current/proposed process records, representative batches, analytical methods, predefined acceptance criteria, stability and comparability rationale, deviations and any applicable prior agency agreement.'),
  ]),
  stability: inquiryProfile(['quality', 'agency_commitments'], [
    question('quality', 'Which material, container closure, batches, storage conditions, timepoints, methods and acceptance criteria define the stability protocol?', 'The protocol must support the intended storage/shelf-life question for the actual product without inventing results.', 'Batch selection, packaging/storage rationale, study conditions and timepoints, validated methods/specifications, statistical plan as applicable and prior agency commitments.'),
  ]),
  nonclinical: inquiryProfile(['safety', 'quality'], [
    question('safety', 'Which nonclinical pharmacology, PK/toxicology findings, deviations and translational limits support the assessment, including adverse or contradictory results?', 'Nonclinical findings must retain their study context and cannot be presented as demonstrated human outcomes.', 'Current nonclinical study reports, GLP/compliance and deviation records as applicable, species/model and exposure rationale, tabulations and documented interpretation limits.'),
  ]),
  administrative: inquiryProfile(['local_requirements', 'agency_commitments']),
  technical: inquiryProfile(['local_requirements', 'agency_commitments'], [
    question('local_requirements', 'Which confirmed agency, technical version, lifecycle operation and validation specifications govern this electronic backbone?', 'A narrative outline cannot produce or qualify the technical exchange package.', 'Current agency technical specifications, application/sequence identifiers, lifecycle metadata, referenced documents and dedicated package validation results.'),
  ]),
};

/** Exact registry identity selects lifecycle inquiry. Product alternatives in a
 * broad application row (e.g. BLA) never establish this client's modality. */
const REGISTRY_INQUIRY_PROFILES: Readonly<Record<string, string>> = {
  US_IND_AMENDMENT: 'amendment', CA_CTA_A: 'amendment',
  US_351K: 'biosimilar', EU_BIOSIMILAR_MAA: 'biosimilar', JP_BIOSIMILAR: 'biosimilar',
  ICH_ICSR: 'safety_case', ICH_SUSAR: 'safety_case', US_ICSR_15DAY: 'safety_case',
  EU_EUDRAVIGILANCE_ICSR: 'safety_case', US_IND_SR: 'ind_safety',
  US_REMS: 'risk_management', EU_RMP: 'risk_management', ICH_SIGNAL: 'signal',
  EU_MDR_ART117_NBOP: 'integral_device',
  EU_PSUR: 'aggregate', US_PADER: 'aggregate', US_IND_ANNUAL: 'annual', US_NDA_ANNUAL: 'annual',
  US_PMR: 'commitments', ICH_COMPARABILITY: 'comparability', ICH_STABILITY_PROTOCOL: 'stability',
  ICH_CTD_M3: 'quality', ICH_CTD_M4: 'nonclinical', ICH_NONCLIN_SUMMARY: 'nonclinical',
  ICH_NONCLIN_OVERVIEW: 'nonclinical', ICH_CTD_M1: 'administrative', ICH_ECTD_BACKBONE: 'technical',
};
const FAMILY_INQUIRY_PROFILES: Readonly<Partial<Record<RegulatoryApplicationType['applicationFamily'], string>>> = {
  master_file: 'master_file', variation: 'change', supplement: 'change',
  pediatric: 'pediatric', orphan: 'orphan', pre_submission: 'meeting', quality_cmc: 'quality',
};
function registryInquiryProfile(entry: RegulatoryApplicationType | undefined): InquiryProfile | undefined {
  if (!entry) return undefined;
  const key = REGISTRY_INQUIRY_PROFILES[entry.id] ?? FAMILY_INQUIRY_PROFILES[entry.applicationFamily];
  return key ? INQUIRY_PROFILES[key] : undefined;
}
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
    || (entry.region === 'GLOBAL' && entry.segment === 'cross_cutting'
      && ['clinical_document', 'dossier_module', 'safety_report', 'quality_cmc'].includes(entry.applicationFamily));
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
    'scope', 'source_versions', ...(PROFILES[scope.templateId ?? ''] ?? registryInquiryProfile(scope.entry)?.topics ?? ['safety', 'quality', 'statistical_results']),
    'agency_commitments', 'local_requirements', ...(scope.market === 'JP' ? ['japan_evidence' as const] : []), 'review_owners',
  ])];
}

function regionalQuestion(topic: PreparationTopic, scope: DocumentPreparationScope): PreparationQuestion {
  const { entry, market } = scope;
  const q = registryInquiryProfile(entry)?.questions?.[topic] ?? QUESTIONS[topic];
  if (entry?.id === 'EU_ORPHAN' && topic === 'statistical_results') {
    return { ...q, question: `${q.question} Which authorized satisfactory methods exist, and what supports significant benefit when applicable?`, requestedEvidence: `${q.requestedEvidence} Current treatment assessment and significant-benefit rationale where applicable.` };
  }
  if (market === 'JP' && entry?.applicationFamily === 'marketing_authorization' && topic === 'local_requirements') {
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
  const japaneseMarketingApplication = market === 'JP' && entry?.applicationFamily === 'marketing_authorization';
  const remaining = preparationTopics(scope).filter(t => !discussedTopics.includes(t));
  const questions = remaining.slice(0, 3).map(t => regionalQuestion(t, scope));
  return {
    kind: 'document_preparation' as const,
    readiness: 'not_assessed' as const, evidenceReviewed: false as const,
    registryId: entry?.id ?? null, market: market ?? null,
    regionalRoute: regionalRoute(entry, market),
    questions, remainingTopics: remaining.slice(3), discussedTopics,
    discussionNotice: 'Discussion markers only prevent repeat questions. They do not verify answers, evidence, review approval or filing readiness. Read current project sources before asking the client for information already present. Revisit affected topics when the document, source versions or filing scope change.',
    applicabilityQuestions: [
      'Pediatric population: determine US iPSP and EU PIP applicability separately, including waivers or deferrals.',
      'Biologics, vaccines, biosimilars, cell or gene therapies: determine immunogenicity, potency, comparability and long-term follow-up needs from the product and evidence.',
      'Orphan, accelerated/conditional routes, GMO/environmental assessments, companion diagnostics and combination products: include only applicable regional obligations.',
    ],
    cautions: [
      'An outline is an authoring scaffold; its required flags are not a determination that every section applies or that this is every document the agency needs.',
      'E2B safety messages, validated datasets, define.xml and eCTD backbones require their dedicated recorded-data and technical validation workflows; prose authoring does not qualify them.',
      'Current protocol template, GCP revision, regional adoption/effective date and eCTD version must be checked through regulatory currency and agency sources at filing. A draft guidance is not an operative requirement.',
      ...(market === 'JP' ? ['Additional Japanese studies are not automatically required; assess ethnic factors and available safety evidence with PMDA advice.', ...(japaneseMarketingApplication ? ['The English-application trial measure requires qualifying scope and advance PMDA consultation; do not promise a language exemption.'] : [])] : []),
    ],
    regionalEvidenceSources: market === 'JP' ? [
      ...(japaneseMarketingApplication ? [basis('PMDA/MHLW English application notice, 6 September 2024', PMDA_ENGLISH)] : []),
      basis('MHLW Japanese Phase I principles, 25 December 2023', PMDA_EVIDENCE),
    ] : [],
    reviewGates: [
      'Read and cite current source versions; resolve contradictory and superseded evidence without deleting lineage.',
      'Use deterministic analyses for numbers; distinguish prespecified from exploratory findings and disclose uncertainty.',
      'Independent medical, statistical, quality and regulatory review as applicable.',
      'Save through draft_authoring_document; approval, filing, package validation and agency transmission remain separate.',
    ],
  };
}
