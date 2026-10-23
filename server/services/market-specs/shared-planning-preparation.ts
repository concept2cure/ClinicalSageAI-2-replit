/** Inquiry prompts for the existing four shared planning records. These are
 * internal authoring questions, not another outline or requirement registry. */
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy';
import type { PreparationMarket, PreparationQuestion, PreparationTopic } from './document-preparation';

export const SHARED_PLANNING_AUTHORING_GUIDANCE = `SHARED PLANNING DOCUMENT PREPARATION:
Regulatory strategy (RI_STRATEGY), gap analysis (RI_GAP_ANALYSIS), competitive landscape (RI_COMPETITIVE) and health-authority meeting minutes (RI_HA_MEETING) are shared working documents for device, diagnostics, biotech, pharma, lab and research teams. Use get_document_template with the exact registry_id or builtin template_id and prepare:true to obtain the existing outline and its internal preparation questions. Confirm purpose, audience, decision limits, source versions, as-of date and accountable reviewers; ask one to three unresolved questions at a time and read existing sources before asking again. No market is mandatory; an optional market narrows the analysis, not a delivery route. Do not impose medicinal-product questions or invent an ICH-required template, receiving authority, legal-completeness verdict or permission to submit. Separate evidence, interpretation, recommendations, proposed commitments and confirmed meeting records. Retain and cite originals; drafting and discussion do not verify evidence, approve a document or transmit it.`;

const questions: Record<'scope' | 'source_versions' | 'data_cutoff' | 'agency_commitments' | 'review_owners', PreparationQuestion> = {
  scope: { topic: 'scope', question: 'What is this document’s purpose, audience and decision or discussion, and what is explicitly outside its scope?',
    why: 'A working analysis needs an agreed objective before its findings or recommendations can be interpreted.',
    requestedEvidence: 'Project objective, intended readers, decision owner and stated analysis boundaries; identify any optional market focus.' },
  source_versions: { topic: 'source_versions', question: 'Which exact source versions support the analysis, and which records, claims or interpretations conflict or remain uncertain?',
    why: 'The analysis must preserve provenance and distinguish recorded facts from interpretation and missing evidence.',
    requestedEvidence: 'Source identifiers, versions, dates and locations, source-selection criteria, contradictory records and unresolved claims.' },
  data_cutoff: { topic: 'data_cutoff', question: 'What is the analysis as-of date, source cutoff and search scope, and which source currency or review checks remain incomplete?',
    why: 'An analysis reflects the information examined at a stated time; a date alone does not establish that sources are current or complete.',
    requestedEvidence: 'Dated source inventory and searches, inclusion/exclusion boundaries, current-reference checks and known information gaps.' },
  agency_commitments: { topic: 'agency_commitments', question: 'Which meeting statements are proposals, discussion notes, confirmed decisions or actual commitments, and whose confirmation is recorded?',
    why: 'Working minutes must not turn a proposal or unconfirmed note into an agreed authority position or accepted commitment.',
    requestedEvidence: 'Meeting date and participants, original correspondence or supplied records, draft/agreed status, attributed statements and confirmation records.' },
  review_owners: { topic: 'review_owners', question: 'Who owns factual review and approval of the analysis, and which assumptions, findings or recommendations still require accountable review?',
    why: 'A useful working document separates proposed conclusions from reviewed facts and approved decisions.',
    requestedEvidence: 'Named accountable reviewers, factual/source checks, unresolved assumptions and the applicable document review and approval records.' },
};

function sourceQuestion(entry: RegulatoryApplicationType): PreparationQuestion {
  const base = questions.source_versions;
  if (entry.id === 'RI_GAP_ANALYSIS') return { ...base,
    requestedEvidence: `${base.requestedEvidence} Identify the exact project, standard or client requirement basis and revision against which each gap is assessed; a gap list is not a completeness verdict.` };
  if (entry.id === 'RI_COMPETITIVE') return { ...base,
    requestedEvidence: `${base.requestedEvidence} Identify the compared organizations/products, dated primary sources and comparison criteria; distinguish public facts from interpretation.` };
  return { ...base };
}

/** Called after the canonical shared-entry predicate and exact scope checks. */
export function buildSharedPlanningPreparation(entry: RegulatoryApplicationType, market: PreparationMarket | undefined, discussedTopics: PreparationTopic[]) {
  const topics: Array<keyof typeof questions> = ['scope', 'source_versions', 'data_cutoff',
    ...(entry.id === 'RI_HA_MEETING' ? ['agency_commitments' as const] : []), 'review_owners'];
  const remaining = topics.filter(topic => !discussedTopics.includes(topic));
  const inquiry = (topic: keyof typeof questions): PreparationQuestion => topic === 'source_versions' ? sourceQuestion(entry)
    : { ...questions[topic] };
  return {
    kind: 'document_preparation' as const, readiness: 'not_assessed' as const, evidenceReviewed: false as const,
    registryId: entry.id, market: market ?? null, regionalRoute: null,
    questions: remaining.slice(0, 3).map(inquiry), remainingTopics: remaining.slice(3), discussedTopics: [...discussedTopics],
    discussionNotice: 'Discussion markers only prevent repeat questions. They do not verify answers, source currency, evidence, review approval or readiness. Read current project sources first and revisit affected topics when the objective, source versions or analysis scope changes.',
    applicabilityQuestions: [],
    cautions: [
      'These are internal working analyses, not ICH-mandated templates or a determination of legal applicability. The registry’s ICH/GLOBAL classification does not identify a recipient or delivery destination.',
      'An optional market narrows the analysis only; this plan creates no agency filing, delivery route, approval or permission to submit.',
      'Retain original source records and separate facts, interpretation, recommendations, proposed commitments and confirmed decisions. Working notes are not agreed authority minutes.',
    ],
    regionalEvidenceSources: [],
    reviewGates: [
      'Read and cite exact source versions; preserve contradictory, superseded and missing information without deleting lineage.',
      'Use deterministic source-backed analyses for figures; distinguish evidence from interpretation and disclose unresolved assumptions.',
      'Review factual accuracy and recommendations with accountable document owners; confirm any recorded meeting decisions and commitments against originals.',
      'Save through the existing document workflow. Drafting, source review, approval and any later applicable filing or transmission are separate.',
    ],
  };
}
