/** Deterministic heading-coverage review and evidence-review prompts for AnA.
 * Headings are evidence of structure only, never scientific completeness,
 * compliance, approval or filing readiness. No project sources are read here.
 */
import { getDocumentTypeStandard, listMedicalWritingCatalog, type DocumentTypeStandard } from './medical-writing.js';
import { extractHeadingOutline } from './document-search-core.js';
import { getDocumentPreparationQuestion, type PreparationQuestion, type PreparationTopic } from '../market-specs/document-preparation.js';

export interface SectionCoverage {
  section: string;
  present: boolean;
  /** Actual heading evidence, not narrative keyword matches. */
  matchedHeadings: string[];
}

export interface ChecklistItem {
  category: 'structure' | 'requirement' | 'pitfall';
  item: string;
  status: 'present' | 'missing' | 'review';
}

export interface MedicalWritingReview {
  documentType: string | null;
  label: string | null;
  governingStandards: string[];
  /** Present only when nonempty draft text was supplied. */
  structureCoverage?: SectionCoverage[];
  missingSections?: string[];
  structureStatus: 'checked' | 'not_checked';
  detectedHeadings: string[];
  evidenceReviewed: false;
  scientificCompleteness: 'not_assessed';
  approvalStatus: 'not_assessed';
  inquiryScope: 'medicinal_document' | 'writing_standard' | 'unavailable';
  clarificationQuestions: PreparationQuestion[];
  clarificationNotice: string;
  checklist: ChecklistItem[];
  readiness: string;
  availableDocumentTypes?: string[];
}

const CLARIFICATION_NOTICE = 'Read current project sources and prior answers first; ask only where a material unknown or conflict remains. These prompts do not verify evidence and are not proof that a requirement has been met. Keep questions outside the formal document.';
const UNASSESSED = {
  evidenceReviewed: false as const,
  scientificCompleteness: 'not_assessed' as const,
  approvalStatus: 'not_assessed' as const,
  clarificationNotice: CLARIFICATION_NOTICE,
};

/** Compare whole heading labels, allowing numbering and descriptive annotations,
 * not individual words or substrings. This deliberately fails closed on aliases
 * not represented in the indexed standard. */
function normalizedHeading(heading: string): string {
  return heading.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '')
    .replace(/^\d+(?:\.\d+)*\.?\s+/, '').replace(/\([^)]*\)/g, '')
    .replace(/&/g, ' and ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Format adaptation only: delegate heading detection to the existing pure
 * outline extractor. HTML headings and exact standalone indexed plain titles
 * survive; paragraph mentions, lists and fenced examples do not become titles. */
function reviewHeadings(text: string, expected: string[], knownHeadings: string[]): string[] {
  const expectedLabels = new Set(expected.map(normalizedHeading));
  const adapted = text.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi, '\n# $1\n')
    .replace(/<\/(?:p|div|li|tr|section|article)\s*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  let fence: string | undefined;
  const lines = adapted.split('\n').map(raw => {
    const line = raw.trim();
    const marker = line.match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = undefined;
      return '';
    }
    if (fence) return '';
    if (/^#{5,6}\s+/.test(line)) return line.replace(/^#{5,6}/, '#');
    if (!/^[-*+>|]/.test(line) && !/[.!?:;]\s*$/.test(line) && expectedLabels.has(normalizedHeading(line))) {
      return `# ${line}`;
    }
    return line;
  });
  return [...new Set([...knownHeadings.filter(heading => heading.trim()), ...extractHeadingOutline(lines.join('\n'), lines.length)])];
}

function clarificationQuestions(doc: DocumentTypeStandard, text: string): PreparationQuestion[] {
  const sources = getDocumentPreparationQuestion('source_versions');
  if (doc.segment !== 'drug') {
    sources.requestedEvidence = `Version/date and source locations for the ${doc.label} and its supporting study reports, datasets and referenced evidence, as applicable; reconcile contradictory sources.`;
  }
  if (doc.segment === 'device' || doc.segment === 'ivd') {
    return [sources, {
      topic: 'statistical_results',
      question: `Which supporting evidence and unresolved gaps address this indexed ${doc.label} standard: ${doc.keyRequirements.join('; ')}?`,
      why: 'Heading presence cannot establish the scientific validity or applicability of the supporting evidence.',
      requestedEvidence: 'Traceable source reports and appraisal records for the indexed requirements, with methods, populations, units, uncertainty and contradictory findings as applicable; accountable scientific review.',
    }, getDocumentPreparationQuestion('review_owners')];
  }
  let topic: PreparationTopic = 'statistical_results';
  if (doc.id === 'protocol') topic = 'estimands';
  else if (doc.id === 'ib' || doc.id === 'rmp') topic = 'safety';
  else if (doc.id === 'meeting_package' || doc.id === 'regulatory_response') topic = 'agency_commitments';
  const third: PreparationTopic = doc.segment === 'drug' && /\b(?:CMC|manufactur\w*|formulation|assay|comparability|stability|batch(?:es)?)\b/i.test(text)
    ? 'quality' : doc.id === 'csr' || doc.id === 'clinical_summary' ? 'data_cutoff' : 'review_owners';
  return [sources, getDocumentPreparationQuestion(topic), getDocumentPreparationQuestion(third)];
}

function headingReadiness(doc: DocumentTypeStandard, hasDraft: boolean, missingSections?: string[]): string {
  const limit = 'Heading presence does not establish substantive completeness, scientific validity, compliance, approval or filing readiness. Human scientific and evidence review is still required for every requirement and pitfall.';
  if (!hasDraft) return `Pre-draft checklist for ${doc.label} (${doc.governingStandards.join('; ')}); structure not checked. ${limit}`;
  if (missingSections?.length) return `NOT READY for structural handoff: ${missingSections.length} expected heading(s) not detected — ${missingSections.join(', ')}. Check applicability and the current agency/client template; undetected headings do not prove absent content. ${limit}`;
  return `All expected headings detected for ${doc.label} against the indexed outline. ${limit}`;
}

/** Review indexed heading coverage. Other checklist items always require human
 * and evidence QC; no supplied text or answer can certify that review here.
 * knownHeadings preserves titles held separately by the existing authoring gate.
 */
export function reviewMedicalWriting(documentType: string, draftText?: string, knownHeadings: string[] = []): MedicalWritingReview {
  const doc = getDocumentTypeStandard(documentType);
  if (!doc) {
    return {
      ...UNASSESSED,
      documentType: null, label: null, governingStandards: [], checklist: [],
      structureStatus: 'not_checked', detectedHeadings: [], inquiryScope: 'unavailable',
      readiness: 'Unknown document type — cannot review against an indexed standard; evidence review and approval remain unassessed.',
      availableDocumentTypes: listMedicalWritingCatalog().documentTypes.map(type => type.id),
      clarificationQuestions: [{
        ...getDocumentPreparationQuestion('scope'),
        question: 'Which indexed document type and current agency/client template should this review use?',
        requestedEvidence: 'Confirmed document type, product scope and current agency/client template; unsupported types require an applicable standard rather than an invented outline.',
      }],
    };
  }

  const text = draftText ?? '';
  const hasDraft = text.trim().length > 0;
  const detectedHeadings = hasDraft ? reviewHeadings(text, doc.structure, knownHeadings) : [];
  const checklist: ChecklistItem[] = [];
  let structureCoverage: SectionCoverage[] | undefined;
  let missingSections: string[] | undefined;
  if (hasDraft) {
    structureCoverage = doc.structure.map(section => {
      const matchedHeadings = detectedHeadings.filter(heading => normalizedHeading(heading) === normalizedHeading(section));
      return { section, present: matchedHeadings.length > 0, matchedHeadings };
    });
    missingSections = structureCoverage.filter(section => !section.present).map(section => section.section);
    for (const section of structureCoverage) {
      checklist.push({ category: 'structure', item: `Expected heading detected: ${section.section}`, status: section.present ? 'present' : 'missing' });
    }
  } else {
    for (const section of doc.structure) checklist.push({ category: 'structure', item: `Check expected heading: ${section}`, status: 'review' });
  }
  for (const req of doc.keyRequirements) checklist.push({ category: 'requirement', item: req, status: 'review' });
  for (const pit of doc.commonPitfalls) checklist.push({ category: 'pitfall', item: `Avoid: ${pit}`, status: 'review' });

  return {
    ...UNASSESSED,
    documentType: doc.id, label: doc.label, governingStandards: doc.governingStandards,
    structureStatus: hasDraft ? 'checked' : 'not_checked', detectedHeadings,
    structureCoverage, missingSections, checklist, readiness: headingReadiness(doc, hasDraft, missingSections),
    inquiryScope: doc.segment === 'drug' ? 'medicinal_document' : 'writing_standard',
    clarificationQuestions: clarificationQuestions(doc, text),
  };
}
