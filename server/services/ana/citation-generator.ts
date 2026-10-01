/**
 * generate_citation's engine: a citation formatted only from what can be
 * stood behind, and labelled with which.
 *
 * - journal_article: the identifier (PMID, DOI, else a title) is looked up in
 *   PubMed / Crossref (citation-verification-service.ts). A verified record is
 *   formatted in Vancouver or AMA (reference-manager.ts). Anything else gets no
 *   citation — the tool used to return `[Author(s)]. "[Title]." [Journal]`.
 * - ich_guideline: the title comes from the ICH corpus (ich-guideline-corpus.ts);
 *   a code the corpus does not hold is formatted bare and says so.
 * - fda_guidance, 21cfr, eu_mdr, iso_standard: formatted from the identifier
 *   given and labelled not verified — no source for them is connected.
 *
 * @module server/services/ana/citation-generator
 */

import {
  verifyCitations,
  type CitationInput,
  type CitationMatch,
  type CitationVerificationResult,
} from '../citation-verification-service.js';
import { formatReference, type CitationStyle } from '../references/reference-manager.js';
import { getGuideline } from '../ana-ri/ich-guideline-corpus.js';

export const CITATION_SOURCE_TYPES = [
  'fda_guidance',
  'ich_guideline',
  'eu_mdr',
  'journal_article',
  '21cfr',
  'iso_standard',
] as const;
export type CitationSourceType = (typeof CITATION_SOURCE_TYPES)[number];

export interface GeneratedCitation {
  sourceType: CitationSourceType;
  sourceIdentifier: string;
  /** Null when nothing could be formatted without inventing it. */
  citation: string | null;
  verification:
    | 'verified'
    | 'identified'
    | 'not_in_corpus'
    | 'not_verified'
    | 'not_found'
    | 'unverifiable'
    | 'error';
  verifiedAgainst?: CitationMatch['source'] | 'ich_corpus';
  url?: string;
  retracted?: boolean;
  discrepancies?: string[];
  warning?: string;
  detail?: string;
  styleRequested: string;
  styleApplied: CitationStyle | 'regulatory';
  note?: string;
}

const DOI_RE = /10\.\d{4,9}\/[^\s"<>]+/i;
const PMID_RE = /^(?:pmid:?\s*)?(\d{1,9})$/i;

function lookupFor(identifier: string): CitationInput {
  const doi = identifier.match(DOI_RE)?.[0].replace(/[.,;)]+$/, '');
  if (doi) return { doi };
  const pmid = identifier.match(PMID_RE)?.[1];
  if (pmid) return { pmid };
  return { title: identifier };
}

/** PubMed names read "Smith JA"; the formatter expects "Smith, J A". */
function authorsOf(match: CitationMatch): string[] {
  const names = (match.authors ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  if (match.source !== 'pubmed') return names;
  return names.map((name) => {
    const parts = name.split(/\s+/);
    const initials = parts.length > 1 ? parts[parts.length - 1] : '';
    return /^[A-Z]{1,4}$/.test(initials)
      ? `${parts.slice(0, -1).join(' ')}, ${initials.split('').join(' ')}`
      : name;
  });
}

type CitationBody = Omit<GeneratedCitation, 'sourceType' | 'sourceIdentifier'>;

function notFormatted(result: CitationVerificationResult | undefined, styleRequested: string, styleApplied: CitationStyle): CitationBody {
  return {
    citation: null,
    verification: !result ? 'error' : result.status === 'verified' ? 'unverifiable' : result.status,
    detail: result?.detail,
    styleRequested,
    styleApplied,
    note:
      'No citation was formatted: the reference could not be verified in PubMed or Crossref. ' +
      'Supply the full reference from the source, or cite it marked unverified.',
  };
}

/** What a verified record carries beyond the citation: a retraction, discrepancies. */
function cautions(result: CitationVerificationResult): Partial<CitationBody> {
  return {
    ...(result.retracted
      ? { retracted: true, warning: 'The source marks this publication as retracted. Do not cite it as evidence.' }
      : {}),
    ...(result.discrepancies?.length ? { discrepancies: result.discrepancies } : {}),
  };
}

async function journalCitation(identifier: string, styleRequested: string): Promise<CitationBody> {
  const styleApplied: CitationStyle = styleRequested === 'ama' ? 'ama' : 'vancouver';
  const [result] = await verifyCitations([lookupFor(identifier)]);
  if (!result || result.status !== 'verified' || !result.match) {
    return notFormatted(result, styleRequested, styleApplied);
  }
  const { match } = result;
  const citation = formatReference(
    {
      authors: authorsOf(match),
      title: match.title ?? '',
      journal: match.journal,
      year: match.year !== undefined ? String(match.year) : undefined,
      doi: match.doi,
    },
    styleApplied,
  );
  return {
    citation,
    verification: 'verified',
    verifiedAgainst: match.source,
    url: match.url,
    ...cautions(result),
    styleRequested,
    styleApplied,
    ...(styleRequested === 'apa' ? { note: 'APA is not supported; formatted in Vancouver.' } : {}),
  };
}

function ichCitation(identifier: string, styleRequested: string): CitationBody {
  const code = identifier.replace(/^ICH[\s-]*/i, '').trim();
  const g = getGuideline(code);
  if (!g) {
    return {
      citation: `International Council for Harmonisation. ICH ${code}.`,
      verification: 'not_in_corpus',
      styleRequested,
      styleApplied: 'regulatory',
      note: `The ICH corpus holds current revisions and ${code} is not among them. Confirm the code and title on ich.org.`,
    };
  }
  const status = g.status === 'adopted' ? '' : ` [${g.status.replace('_', ' ')}]`;
  return {
    citation: `International Council for Harmonisation. ICH ${g.code}: ${g.title}${status}.`,
    verification: 'identified',
    verifiedAgainst: 'ich_corpus',
    styleRequested,
    styleApplied: 'regulatory',
  };
}

function trimEnd(s: string): string {
  return s.replace(/[.\s]+$/, '');
}

const FROM_IDENTIFIER: Record<'fda_guidance' | '21cfr' | 'eu_mdr' | 'iso_standard', (id: string) => string> = {
  fda_guidance: (id) => `U.S. Food and Drug Administration. ${trimEnd(id)}.`,
  '21cfr': (id) => `21 CFR ${trimEnd(id.replace(/^21\s*C\.?F\.?R\.?\s*/i, '').replace(/^part\s+/i, ''))}.`,
  eu_mdr: (id) =>
    `Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, ${trimEnd(id)}.`,
  iso_standard: (id) => `${trimEnd(id)}.`,
};

export async function generateCitation(input: {
  sourceType: unknown;
  sourceIdentifier: unknown;
  style?: unknown;
}): Promise<GeneratedCitation | { error: string }> {
  const sourceType = input.sourceType as CitationSourceType;
  if (!CITATION_SOURCE_TYPES.includes(sourceType)) {
    return { error: `source_type must be one of ${CITATION_SOURCE_TYPES.join(', ')}.` };
  }
  const sourceIdentifier = typeof input.sourceIdentifier === 'string' ? input.sourceIdentifier.trim() : '';
  if (!sourceIdentifier) return { error: 'source_identifier is required (a PMID, DOI, guideline code, CFR section, …).' };
  const styleRequested = typeof input.style === 'string' && input.style ? input.style : 'regulatory';

  if (sourceType === 'journal_article') {
    return { sourceType, sourceIdentifier, ...(await journalCitation(sourceIdentifier, styleRequested)) };
  }
  if (sourceType === 'ich_guideline') {
    return { sourceType, sourceIdentifier, ...ichCitation(sourceIdentifier, styleRequested) };
  }
  return {
    sourceType,
    sourceIdentifier,
    citation: FROM_IDENTIFIER[sourceType](sourceIdentifier),
    verification: 'not_verified',
    styleRequested,
    styleApplied: 'regulatory',
    note: 'Formatted from the identifier given; its existence and wording were not checked against a source.',
  };
}
