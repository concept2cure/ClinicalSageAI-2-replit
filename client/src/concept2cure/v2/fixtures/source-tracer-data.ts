/* Source-tracer fixture data — ported from kit source-tracer.jsx.
   Mirrors the real backend routes:
     GET  /api/documents/:id/sources          -> { sources:SourceLink[], total }
     POST /api/documents/:id/sources          -> add a link
     POST /api/documents/:id/sources/analyze  -> { analyzed, claimsFound, sources, saved }
     POST /api/citations/verify { citations } -> { data:{ results, summary } }
*/

export interface StSentence {
  idx: number;
  sourceType: string;
  conf: number;
  text: string;
  sourceTitle: string;
  sourceId: string;
  surface?: string;
  pmid?: string;
  doi?: string;
  expect?: string;
}

export interface StSection {
  id: string;
  doc: string;
  sec: string;
  status: string;
  model: string;
  sentences: StSentence[];
}

export interface StSourceTypeInfo {
  label: string;
  tone: string;
}

export interface StVerifyResult {
  ref: string;
  id: string;
  pmid: string | null;
  status: string;
}

export interface StVerifySummary {
  total: number;
  verified: number;
  notFound: number;
  unverifiable: number;
  error: number;
}

export interface StVerifyOutput {
  results: StVerifyResult[];
  summary: StVerifySummary;
}

export const ST_SOURCETYPES: Record<string, StSourceTypeInfo> = {
  trial_data:          { label: 'Trial data',          tone: 'ok'   },
  literature:          { label: 'Literature',          tone: 'ai'   },
  regulatory_guidance: { label: 'Regulatory guidance', tone: 'idle' },
  internal_data:       { label: 'Internal data',       tone: 'warn' },
};

export const ST_SECTIONS: StSection[] = [
  {
    id: '2054', doc: '§2.5 Clinical Overview', sec: '2.5.4', status: 'approved', model: 'AnA / Clinical Overview',
    sentences: [
      { idx: 0, sourceType: 'trial_data', conf: 0.98, surface: 'csr-workflow',
        text: 'In the pivotal study BX-301-301, single-agent treatment produced a confirmed overall response rate of 63.2% (95% CI 55.1–70.8) in patients with relapsed or refractory multiple myeloma.',
        sourceTitle: 'CSR BX-301-301 §11.2 / Table 14.2.1', sourceId: 'CSR-301' },
      { idx: 1, sourceType: 'trial_data', conf: 0.97,
        text: 'The median time to first response was 1.1 months, and responses deepened with continued therapy.',
        sourceTitle: 'ADaM ADRS / responder analysis, n=142', sourceId: 'ADRS-301' },
      { idx: 2, sourceType: 'literature', conf: 0.90, pmid: '33626253', doi: '10.1056/NEJMoa2024850', expect: 'verified',
        text: 'These response rates are consistent with those reported for approved anti-BCMA therapies in comparable populations.',
        sourceTitle: 'Munshi NC, et al. N Engl J Med 2021;384:705–716', sourceId: 'c1' },
      { idx: 3, sourceType: 'literature', conf: 0.61, expect: 'not_found',
        text: 'Preliminary data suggest a potential benefit in patients with extramedullary disease.',
        sourceTitle: 'Conference abstract / ASH 2025 (abstr. 4721)', sourceId: 'c3' },
    ],
  },
  {
    id: '2061', doc: '§2.7.4 Summary of Clinical Safety', sec: '2.7.4.2', status: 'review', model: 'AnA / Summary of Clinical Safety',
    sentences: [
      { idx: 0, sourceType: 'trial_data', conf: 0.96,
        text: 'Grade >=3 treatment-related adverse events occurred in 41.5% of patients; the most common was neutropenia (24.6%).',
        sourceTitle: 'Pooled safety set / Table 14.3.1.2', sourceId: 'ADAE-301' },
      { idx: 1, sourceType: 'trial_data', conf: 0.95,
        text: 'Cytokine release syndrome was reported in 57.7% of patients and was predominantly Grade 1–2.',
        sourceTitle: 'ADaM ADAE / CRS analysis (ASTCT grading)', sourceId: 'ADAE-CRS' },
      { idx: 2, sourceType: 'literature', conf: 0.88, pmid: '24876563', expect: 'verified',
        text: 'The observed CRS profile is consistent with the mechanism-based class effect described for T-cell–engaging therapies.',
        sourceTitle: 'Lee DW, et al. Blood 2014;124:188–195', sourceId: 'c2' },
      { idx: 3, sourceType: 'regulatory_guidance', conf: 0.90,
        text: 'CRS and neutropenia were managed per guidance consistent with FDA labeling for the class.',
        sourceTitle: 'FDA Guidance / CRS management (2019)', sourceId: 'GUID-CRS' },
    ],
  },
  {
    id: '3041', doc: '§3.2.S.4.1 Specification', sec: '3.2.S.4.1', status: 'approved', model: 'AnA / CMC Drug Substance',
    sentences: [
      { idx: 0, sourceType: 'internal_data', conf: 0.99, surface: 'cmc',
        text: 'The drug-substance specification sets a purity acceptance criterion of >=98.0% by RP-HPLC.',
        sourceTitle: 'Method MV-114 / 21 release + stability lots', sourceId: 'SPEC-DS' },
      { idx: 1, sourceType: 'regulatory_guidance', conf: 0.97,
        text: 'Acceptance criteria were established in accordance with ICH Q6B for biotechnological products.',
        sourceTitle: 'ICH Q6B / Specifications', sourceId: 'ICH-Q6B' },
    ],
  },
];

/** Mirrors POST /api/citations/verify — status in verified|not_found|unverifiable|error */
export function stVerify(section: StSection): StVerifyOutput {
  const lits = section.sentences.filter(s => s.sourceType === 'literature');
  const results: StVerifyResult[] = lits.map(s => ({
    ref: s.sourceTitle, id: s.sourceId, pmid: s.pmid || null,
    status: s.expect || (s.pmid || s.doi ? 'verified' : 'unverifiable'),
  }));
  return {
    results,
    summary: {
      total: results.length,
      verified: results.filter(r => r.status === 'verified').length,
      notFound: results.filter(r => r.status === 'not_found').length,
      unverifiable: results.filter(r => r.status === 'unverifiable').length,
      error: results.filter(r => r.status === 'error').length,
    },
  };
}

export const ST_VSTATUS: Record<string, { t: string; l: string }> = {
  verified: { t: 'ok', l: 'verified' },
  not_found: { t: 'warn', l: 'not found' },
  unverifiable: { t: 'idle', l: 'unverifiable' },
  error: { t: 'warn', l: 'error' },
};
