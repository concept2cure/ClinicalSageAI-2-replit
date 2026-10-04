/**
 * AnA's answer check (server/services/ana/answer-grounding.ts, checkAnswer):
 * what counts as a source, what a figure is, and when a claim is found.
 *
 * Founder-directed 2026-10-04 ("Enhance the reasoning layer of ANA"). The
 * check is the one deterministic comparison of an answer with what AnA
 * consulted; the trust strip, the stored message and the sealed turn record
 * report it. Rule 2: numbers and verdicts come from engines, the model
 * narrates — so a figure the model wrote is never evidence for itself.
 */
import { describe, expect, it } from 'vitest';
import {
  ANSWER_CHECK_VERSION,
  checkAnswer,
  toolEvidence,
  type EvidenceEntry,
} from '../../server/services/ana/answer-grounding';

const tool = (name: string, content: string, input: unknown = {}, generated: string[] = []): EvidenceEntry =>
  toolEvidence(name, { status: 'success', input, content, generated: { calls: generated.length, texts: generated, overflow: false } })!;

describe('checkAnswer — figures', () => {
  it('finds a figure a tool returned, and flags one it did not', () => {
    const entries = [tool('get_trial_details', '{"orr":"47%","enrolled":212}')];
    const c = checkAnswer('ORR was 47% in 212 patients; median PFS 9.1 months.', entries);
    expect(c.basis).toBe('sources');
    expect(c.found).toBe(2);
    expect(c.notFound).toEqual([{ kind: 'figure', text: '9.1 months' }]);
  });

  it('reads a percentage as its proportion too', () => {
    const c = checkAnswer('The response rate was 47%.', [tool('compute_rate', '{"rate":0.47}')]);
    expect(c.notFound).toEqual([]);
    expect(c.found).toBe(1);
  });

  it('needs both bounds of a confidence interval, and does not read "95% CI" as a result', () => {
    const entries = [tool('analyze', '{"hr":0.62,"ci":[0.48,0.81]}')];
    expect(checkAnswer('HR 0.62 (95% CI 0.48-0.81).', entries).notFound).toEqual([]);
    const c = checkAnswer('HR 0.62 (95% CI 0.48-0.91).', entries);
    expect(c.notFound.map((n) => n.text)).toEqual(['95% CI 0.48-0.91']);
    expect(c.claims).toBe(2);
  });

  it('does not credit a figure a tool only echoed from what the model passed in', () => {
    const entries = [tool('compute_fih_dose', '{"dose_mg":240,"note":"computed"}', { proposed_dose_mg: 240 })];
    const c = checkAnswer('The starting dose is 240 mg.', entries);
    expect(c.notFound).toEqual([{ kind: 'figure', text: '240 mg' }]);
  });

  it('does not credit a figure a model wrote inside the tool call', () => {
    const drafted = 'Section 2.7.3: ORR was 47% in 212 patients.';
    const entries = [tool('batch_draft_sections', JSON.stringify({ sections: [drafted] }), {}, [drafted])];
    const c = checkAnswer('The draft reports an ORR of 47%.', entries);
    expect(c.notFound).toEqual([{ kind: 'figure', text: '47%' }]);
  });

  it('a figure an engine returned beside a model-written one is still found', () => {
    const entries = [
      tool('batch_draft_sections', '{"text":"ORR 47%"}', {}, ['ORR 47%']),
      tool('get_trial_details', '{"orr":"47%"}'),
    ];
    expect(checkAnswer('ORR was 47%.', entries).notFound).toEqual([]);
  });
});

describe('checkAnswer — identifiers are matched whole', () => {
  const entries = [tool('search_literature', 'PMID 23456789; application NDA214360; doi 10.1056/NEJMoa2034577.')];

  it('finds the identifiers the evidence holds', () => {
    const c = checkAnswer('See PMID 23456789, NDA 214360 and doi 10.1056/NEJMoa2034577.', entries);
    expect(c.notFound).toEqual([]);
    expect(c.found).toBe(3);
  });

  it('does not find a truncated or altered identifier inside a longer one', () => {
    const c = checkAnswer('See PMID 3456789, NDA 21436 and doi 10.1056/NEJMoa203457.', entries);
    expect(c.notFound.map((n) => n.kind).sort()).toEqual(['doi', 'fda_nda', 'pmid']);
  });

  it('does not credit an identifier a model wrote inside the tool call', () => {
    const drafted = 'The pivotal study NCT09999999 met its endpoint.';
    const c = checkAnswer('The pivotal study was NCT09999999.', [tool('batch_draft_sections', drafted, {}, [drafted])]);
    expect(c.notFound).toEqual([{ kind: 'nct', text: 'NCT09999999' }]);
  });
});

/**
 * The search tools echo the request in every envelope: a hit, a zero-hit and
 * an outage all carry `query` (AnaToolExecutor search_clinical_evidence,
 * search_literature). So an id the model searched for and did NOT find read
 * as found. An identifier the model passed into a call is credited by that
 * call only where the result returns it inside a record — never where it
 * echoes the request (a top-level field, or a `query` field).
 */
describe('checkAnswer — an identifier the model asked for is not found by the echo of its own request', () => {
  const searched = (content: unknown) =>
    tool('search_clinical_evidence', JSON.stringify(content), { query: 'NCT04123456 PMID 31234567' });

  it('an outage envelope that echoes the query finds nothing', () => {
    const outage = searched({
      source: 'search',
      query: 'NCT04123456 PMID 31234567',
      note: 'ClinicalTrials.gov API unavailable — returning guidance for manual search',
      suggestion: 'Search ClinicalTrials.gov for: "NCT04123456 PMID 31234567"',
    });
    const c = checkAnswer('The study NCT04123456 (PMID 31234567) met its endpoint.', [outage]);
    expect(c.notFound.map((n) => n.kind).sort()).toEqual(['nct', 'pmid']);
  });

  it('a zero-hit result finds nothing, and neither does the query its provenance echoes', () => {
    const zero = searched({ source: 'ctgov', query: 'NCT04123456 PMID 31234567', totalCount: 0, resultCount: 0, studies: [], provenance: [] });
    expect(checkAnswer('NCT04123456 met its endpoint.', [zero]).notFound).toEqual([{ kind: 'nct', text: 'NCT04123456' }]);
    const otherHit = searched({
      query: 'NCT04123456',
      resultCount: 1,
      studies: [{ nctId: 'NCT05555555', title: 'Another study' }],
      provenance: [{ query: 'NCT04123456', citation: { identifier: 'NCT05555555' } }],
    });
    expect(checkAnswer('NCT04123456 met its endpoint.', [otherHit]).notFound).toEqual([{ kind: 'nct', text: 'NCT04123456' }]);
  });

  it('a hit returns the identifier in a record, and is found', () => {
    const hit = searched({
      query: 'NCT04123456',
      resultCount: 1,
      studies: [{ nctId: 'NCT04123456', title: 'The pivotal study' }],
    });
    expect(checkAnswer('NCT04123456 met its endpoint.', [hit]).notFound).toEqual([]);
  });

  it('a result that is not structured cannot tell an echo from data, and finds nothing the model asked for', () => {
    const text = tool('search_documents', 'No passage matched NCT04123456.', { query: 'NCT04123456' });
    expect(checkAnswer('NCT04123456 met its endpoint.', [text]).notFound).toEqual([{ kind: 'nct', text: 'NCT04123456' }]);
  });

  it('a quote the model searched for is found only in a returned passage', () => {
    const quote = 'the primary endpoint is overall survival in all randomised patients';
    const missed = tool('search_document_passages', JSON.stringify({ query: quote, results: [] }), { query: quote });
    expect(checkAnswer(`The protocol says "${quote}".`, [missed]).notFound.map((n) => n.kind)).toEqual(['quote']);
    const hit = tool(
      'search_document_passages',
      JSON.stringify({ query: quote, results: [{ text: `Section 3.2: ${quote}.` }] }),
      { query: quote },
    );
    expect(checkAnswer(`The protocol says "${quote}".`, [hit]).notFound).toEqual([]);
  });

  it('an identifier the model did not ask for is found wherever the result holds it', () => {
    const c = checkAnswer('See NCT04123456.', [tool('read_project_document', 'Pivotal study: NCT04123456.', { doc_id: 'd-1' })]);
    expect(c.notFound).toEqual([]);
  });

  it('a regulation looked up is found in the record the lookup returns, not in the echo of a miss', () => {
    const lookup = (content: unknown) => tool('lookup_ich_guideline', JSON.stringify(content), { guideline: 'E9(R1)' });
    const exact = lookup({ source: 'ICH Guidelines', match: 'exact', guideline: { code: 'E9(R1)', title: 'Estimands' } });
    expect(checkAnswer('ICH E9(R1) applies.', [exact]).notFound).toEqual([]);
    const miss = lookup({ source: 'ICH Guidelines', guideline: 'E9(R1)', guidelines: [], note: 'No ICH guideline matched "E9(R1)".' });
    expect(checkAnswer('ICH E9(R1) applies.', [miss]).notFound).toEqual([{ kind: 'ich', text: 'ICH E9(R1)' }]);
  });

  it('a citation formatted from what the model gave, and not verified, finds nothing', () => {
    const formatted = tool(
      'generate_citation',
      JSON.stringify({
        sourceType: '21cfr',
        sourceIdentifier: '820.30(g)',
        citation: '21 CFR 820.30(g).',
        verification: 'not_verified',
        note: 'Formatted from the identifier given; its existence and wording were not checked against a source.',
      }),
      { source_type: '21cfr', source_identifier: '820.30(g)' },
    );
    expect(checkAnswer('Design validation is in 21 CFR 820.30(g).', [formatted]).notFound).toEqual([
      { kind: 'cfr', text: '21 CFR 820.30(g)' },
    ]);
  });

  it('a citation the tool verified against a source is found', () => {
    const verified = tool(
      'generate_citation',
      JSON.stringify({ sourceType: 'journal_article', sourceIdentifier: 'PMID 31234567', citation: 'Smith J. A trial. N Engl J Med. 2019. PMID 31234567.', verification: 'verified', verifiedAgainst: 'pubmed' }),
      { source_type: 'journal_article', source_identifier: 'PMID 31234567' },
    );
    expect(checkAnswer('See PMID 31234567.', [verified]).notFound).toEqual([]);
  });

  it('a regulation a model wrote inside the tool call is not credited by it', () => {
    const drafted = 'Design validation per 21 CFR 820.30(g) was completed.';
    const c = checkAnswer('Per 21 CFR 820.30(g), validation is complete.', [tool('batch_draft_sections', drafted, {}, [drafted])]);
    expect(c.notFound).toEqual([{ kind: 'cfr', text: '21 CFR 820.30(g)' }]);
  });
});

describe('toolEvidence — what is a source', () => {
  const ok = { status: 'success', input: {}, content: 'NCT01234567', generated: { calls: 0, texts: [], overflow: false } };

  it('a successful result is a source, named by its tool', () => {
    expect(toolEvidence('get_trial_details', ok)?.source).toBe('tool:get_trial_details');
  });

  it('a failed, stopped or empty step is not', () => {
    expect(toolEvidence('get_trial_details', { ...ok, status: 'error' })).toBeNull();
    expect(toolEvidence('get_trial_details', { ...ok, status: 'cancelled' })).toBeNull();
    expect(toolEvidence('get_trial_details', { ...ok, content: '' })).toBeNull();
  });

  it('a governed write is not: its output is the content it stored', () => {
    expect(toolEvidence('draft_authoring_document', ok)).toBeNull();
  });

  it('a result whose generations are unknown, or too many to keep, is not', () => {
    expect(toolEvidence('run_shadow_review', { ...ok, generated: null })).toBeNull();
    expect(toolEvidence('batch_draft_sections', { ...ok, generated: { calls: 3, texts: [], overflow: true } })).toBeNull();
  });
});

describe('checkAnswer — the basis', () => {
  it('with only the person\'s own message, claims are unchecked, never "not found"', () => {
    const c = checkAnswer('Enrolment was 1,066 patients and ORR 47%.', [{ source: 'person', content: 'Our ORR was 47%.' }]);
    expect(c.basis).toBe('no_sources');
    expect(c.found).toBe(1);
    expect(c.notFound).toEqual([]);
    expect(c.unchecked).toEqual([{ kind: 'figure', text: '1,066 patients' }]);
  });

  it('a source the check cannot read is named, not counted as read', () => {
    const c = checkAnswer('ORR was 47%.', [{ source: 'attachment:Protocol.pdf', content: '', unreadable: true }]);
    expect(c.basis).toBe('sources');
    expect(c.unreadable).toEqual(['attachment:Protocol.pdf']);
    expect(c.notFound).toEqual([{ kind: 'figure', text: '47%' }]);
  });

  it('names the engine that checked', () => {
    expect(ANSWER_CHECK_VERSION).toMatch(/^answer-check\/\d+$/);
    expect(checkAnswer('', []).engine).toBe(ANSWER_CHECK_VERSION);
  });
});

describe('checkAnswer — verdicts', () => {
  it('names a readiness, compliance or approval verdict the answer states', () => {
    const c = checkAnswer(
      'The package is approvable. The submission is ready to file. The CMC section is fully compliant and meets all requirements.',
      [],
    );
    expect(c.verdicts.map((v) => v.text)).toEqual([
      'is approvable',
      'is ready to file',
      'is fully compliant',
      'meets all requirements',
    ]);
  });

  it('includes the §14 prohibited claims, and not a verdict the answer declines to give', () => {
    const c = checkAnswer('The NDA will be approved. Module 3 is not ready to file.', []);
    expect(c.verdicts.map((v) => v.text)).toEqual(['will be approved']);
  });
});
