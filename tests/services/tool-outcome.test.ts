/**
 * What a tool result says about itself, read deterministically (TP-RL-4, AnA
 * reasoning round 5, 2026-10-05).
 *
 * A search that found nothing, a service that could not be reached and a tool
 * that needs input it was not given all answer as successes: the loop treated
 * each as a step that worked, wrote no adaptation note, and left the model to
 * read the envelope — or not — before writing its answer. The tools say so
 * themselves (90 handlers return status 'needs_parameters', others
 * 'unavailable', 'lookup_failed', 'not_found', or an empty result list); this
 * reads those signals, and only those.
 */
import { describe, expect, it } from 'vitest';

import { buildShortfallNote, shortfallOf } from '../../server/services/ana/tool-outcome';

const j = (v: unknown) => JSON.stringify(v);

describe('what a tool result says about itself', () => {
  it('a tool that needs input it was not given', () => {
    expect(shortfallOf(j({ status: 'needs_parameters', message: 'text (the draft to critique) is required' }))).toEqual({
      kind: 'needs_input',
      detail: 'text (the draft to critique) is required',
    });
  });

  it('a service that could not be reached', () => {
    expect(shortfallOf(j({ status: 'unavailable', reason: 'openFDA timed out' }))?.kind).toBe('unavailable');
    expect(shortfallOf(j({ status: 'lookup_failed', message: 'registry error' }))?.kind).toBe('unavailable');
    expect(shortfallOf(j({ unavailable: true }))?.kind).toBe('unavailable');
    expect(
      shortfallOf(j({ source: 'PubMed', query: 'x', note: 'PubMed API unavailable — use manual search', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=x' })),
    ).toEqual({ kind: 'unavailable', detail: 'PubMed API unavailable — use manual search' });
  });

  it('a lookup or search that found nothing', () => {
    expect(shortfallOf(j({ status: 'not_found', message: 'No nonclinical template for "x".' }))?.kind).toBe('empty');
    expect(shortfallOf(j({ query: 'x', count: 0, articles: [] }))?.kind).toBe('empty');
    expect(shortfallOf(j({ query: 'x', totalCount: 0, studies: [] }))?.kind).toBe('empty');
    expect(shortfallOf(j({ results: [] }))?.kind).toBe('empty');
    expect(shortfallOf(j({ query: 'x', totalResults: 0 }))?.kind).toBe('empty');
  });

  it('a result that returned something is not a shortfall', () => {
    expect(shortfallOf(j({ query: 'x', count: 1, articles: [{ pmid: '1' }] }))).toBeNull();
    expect(shortfallOf(j({ status: 'computed', engine: 'x', n: 302 }))).toBeNull();
    expect(shortfallOf(j({ studies: [{ nctId: 'NCT01234567' }], note: 'Showing the first 10.' }))).toBeNull();
    expect(shortfallOf('Plain text result.')).toBeNull();
    // A refusal is the loop's failure path (refusalOf), not a shortfall too.
    expect(shortfallOf(j({ error: 'not permitted' }))).toBeNull();
    expect(shortfallOf(j({ error: 'search failed', results: [] }))).toBeNull();
  });

  it("a CMC lookup that found nothing indexed says so as found: 0 (cmc-knowledge-tools.ts)", () => {
    expect(shortfallOf(j({ found: 0, note: 'Not indexed in the platform’s CMC regulatory record.' }))?.kind).toBe('empty');
    expect(shortfallOf(j({ found: 2, documents: [{ id: 'q1' }, { id: 'q2' }] }))).toBeNull();
  });

  it('a vault passage search that matched nothing (document-passage-tools.ts)', () => {
    const none = { ok: true, query: 'x', passages: [], coverage: { total: 3, indexed: 3 }, message: 'No passage matched "x".' };
    expect(shortfallOf(j(none))?.kind).toBe('empty');
    expect(shortfallOf(j({ ...none, passages: [{ documentTitle: 'CSR', locator: '§12.2' }] }))).toBeNull();
  });

  it("a project search that answers in a sentence of its own (project_knowledge_search)", () => {
    expect(shortfallOf('No matching passages were found in this project’s knowledge for "drug X".')).toEqual({
      kind: 'empty',
      detail: 'No matching passages were found in this project’s knowledge for "drug X".',
    });
    expect(shortfallOf("No matching passages were found in this project's knowledge across 3 sub-queries.")?.kind).toBe('empty');
    expect(shortfallOf('No query provided for project_knowledge_search.')?.kind).toBe('needs_input');
    expect(
      shortfallOf('No active project is in context, so project knowledge cannot be searched. Ask the user to open a project first.')?.kind,
    ).toBe('needs_input');
  });

  it('a sentence that is a finding, or an analysis that opens with one, is a result', () => {
    expect(shortfallOf('No issues found. The document passes all checks.')).toBeNull();
    const analysis = `No studies were found that enrolled patients under 18; ${'across the twelve trials reviewed the exposure was adult only, '.repeat(8)}`;
    expect(shortfallOf(analysis)).toBeNull();
  });

  it('records under a field this reader does not know still count as returned', () => {
    // An empty list under a known name beside records under another name is
    // not "nothing usable": the model would be told to doubt what it holds.
    expect(shortfallOf(j({ results: [], molecules: [{ chemblId: 'CHEMBL25' }] }))).toBeNull();
    expect(shortfallOf(j({ count: 0, preprints: [{ doi: '10.1101/x' }] }))).toBeNull();
  });
});

describe('the note the model reads after the round', () => {
  const step = (label: string, result: unknown, status = 'success', heldBack = false) => ({ label, status, heldBack, result: j(result) });

  it('names each step that returned nothing usable, and says what to do instead of presenting it as found', () => {
    const note = buildShortfallNote(
      [
        step('Searched the literature', { count: 0, articles: [] }),
        step('Looked up the label', { status: 'unavailable', reason: 'openFDA timed out' }),
        step('Critiqued the draft', { status: 'needs_parameters', message: 'text is required' }),
        step('Searched trials', { studies: [{ nctId: 'NCT01234567' }] }),
      ],
      4,
    );
    expect(note).toContain('[Adaptation note]');
    expect(note).toContain('3 of 4 tool calls this round returned nothing usable');
    expect(note).toContain('Searched the literature — returned no results');
    expect(note).toContain('Looked up the label — the service could not be reached (openFDA timed out)');
    expect(note).toContain('Critiqued the draft — needs input it was not given (text is required)');
    expect(note).not.toContain('Searched trials');
    expect(note).toMatch(/Do not present what these did not return as found/);
  });

  it('is empty when every step returned something, and ignores failed or held steps', () => {
    expect(buildShortfallNote([step('Searched trials', { studies: [{ nctId: 'NCT01234567' }] })], 1)).toBe('');
    expect(buildShortfallNote([step('Searched', { results: [] }, 'error')], 1)).toBe('');
    expect(buildShortfallNote([step('Drafted', { status: 'needs_parameters' }, 'success', true)], 1)).toBe('');
  });
});
