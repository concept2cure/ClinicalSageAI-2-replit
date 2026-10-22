/**
 * "Which documents govern this question?" must answer for every authority the
 * record covers — including through the ICH baseline that authority adopted.
 *
 * ## What was measured
 *
 * 13 authorities × 7 CMC topics, asked of both knowledge tools
 * (docs/evidence/CMC-M3-GA/2026-10-19/13-adopted-ich-baseline/):
 *
 *     get_cmc_requirements answers   91/91
 *     find_cmc_guidance answers      49/91
 *
 * `findCmcRequirements` had always included the ICH baseline — its own comment
 * says "the named authority's own requirements before the ICH baseline it
 * adopts" — and `findCmcGuidance` filtered strictly. So "which documents govern
 * stability for an EU CTA?" found **nothing**, and AnA was instructed to answer
 * *not indexed* about ICH Q1A(R2): a guideline the record holds, under ICH, and
 * the EU has adopted.
 *
 * Forty-two of the ninety-one questions were in that state, across EMA, MHRA,
 * ANVISA, Swissmedic, MFDS, HSA, CDSCO, PMDA, NMPA, TGA, Health Canada and WHO.
 *
 * ## What must stay true
 *
 * Including the baseline must not make the tool dishonest in the other
 * direction: an unknown authority must still match nothing (so the tool's "No
 * authority X in the record" error fires rather than a list of ICH documents
 * answering a question about nobody), the authority's OWN documents must come
 * first, and every citation must name its issuer so an ICH guideline is never
 * read as the authority's own text.
 */
import { describe, expect, it } from 'vitest';
import { findCmcGuidance, findCmcRequirements, citeSource, CMC_RECORD } from '../index';
import { cmcGuidance } from '../../../ana/cmc-knowledge-tools';

/** Every authority the record holds a source for, except ICH itself. */
const ADOPTERS = [...new Set(CMC_RECORD.sources.map((s) => s.authority))].filter(
  (a) => a !== 'ICH' && a !== 'Literature',
);
const TOPICS = ['stability', 'specification', 'process validation', 'impurities', 'GMP', 'batch release', 'container closure'];

/**
 * The pairs that were silent before the baseline was included, and are not
 * now. Named rather than counted, because a count can move for the wrong
 * reason — and did: the first attempt gave every document of the named
 * authority a flat rank bonus, which defeated the topical filter and made
 * coverage read 91/91 while "which documents govern container closure for
 * ANVISA?" returned ANVISA's whole shelf.
 */
const WAS_SILENT: Array<[authority: string, topic: string]> = [
  ['EMA', 'stability'],
  ['MHRA', 'specification'],
  ['MHRA', 'impurities'],
  ['ANVISA', 'process validation'],
  ['Swissmedic', 'impurities'],
  ['MFDS', 'stability'],
  ['CDSCO', 'specification'],
  ['PMDA', 'batch release'],
  ['WHO', 'impurities'],
];

/**
 * The topic no source's code, title or scope carries for any authority: ICH
 * Q6A governs it, inside its REQUIREMENT statements, and no document is titled
 * for it. The document search stays silent here and the requirements tool
 * answers — which is the honest division, and is asserted rather than left as
 * an unexplained gap.
 */
const STILL_SILENT_TOPIC = 'container closure';

describe('the document search reaches the ICH baseline the authority adopted', () => {
  it('answers the questions that were answered as "not indexed"', () => {
    const silent = WAS_SILENT.filter(([a, t]) => findCmcGuidance(t, a, 3).total === 0)
      .map(([a, t]) => `${a} / ${t}`);
    expect(
      silent,
      'the governing document is an ICH guideline the authority has adopted, and the search filtered it out',
    ).toEqual([]);
  });

  it('leaves no question both tools are silent about', () => {
    /* The claim worth making, and the only one that stays true as the record
       grows: a client's question is answered by one tool or the other. Measured
       over 17 authorities × 7 topics = 119 questions — 14 of which the DOCUMENT
       search cannot answer, all of them one topic (see STILL_SILENT_TOPIC), and
       none of which the requirements tool is silent about. */
    const unanswerable: string[] = [];
    const docsSilent: string[] = [];
    for (const authority of ADOPTERS) {
      for (const topic of TOPICS) {
        const docs = findCmcGuidance(topic, authority, 1).total;
        const reqs = findCmcRequirements({ authority, topic }, 1).total;
        if (docs === 0) docsSilent.push(`${authority} / ${topic}`);
        if (docs === 0 && reqs === 0) unanswerable.push(`${authority} / ${topic}`);
      }
    }
    expect(unanswerable, 'a question neither tool can answer is a gap in the record, not a retrieval choice').toEqual([]);
    /* Every remaining silence is the one topic no document is titled for —
       pinned so a NEW silence cannot hide among the known ones. */
    expect(
      [...new Set(docsSilent.map((q) => q.split(' / ')[1]))],
      `unexpected topic in the silent set: ${docsSilent.join('; ')}`,
    ).toEqual([STILL_SILENT_TOPIC]);
  });

  it('is silent about the one topic no document is titled for, where it is', () => {
    /* Three authorities hold their own container-closure document; the other
       fourteen do not, and ICH governs it inside Q6A's requirement statements
       rather than in any document's title or scope. Asserted as a property —
       silent OR answered, never invented — because which three they are is the
       record's business and changes as it is updated. */
    for (const authority of ADOPTERS) {
      const docs = findCmcGuidance(STILL_SILENT_TOPIC, authority, 3);
      expect(findCmcRequirements({ authority, topic: STILL_SILENT_TOPIC }, 1).total, authority).toBeGreaterThan(0);
      for (const d of docs.matches) {
        const text = `${d.code} ${d.title} ${d.scope}`.toLowerCase();
        expect(/container|closure/.test(text), `${authority}: ${d.code} answers nothing about ${STILL_SILENT_TOPIC}`).toBe(true);
      }
    }
  });

  it('does not return a document that matches the question in no way', () => {
    /* The regression the flat bonus caused: every document of the named
       authority outranking the topical filter. A question no document answers
       must come back empty, not with the authority's whole shelf. */
    expect(findCmcGuidance('xyzzy plugh nothing', 'TGA', 50).total).toBe(0);
    expect(findCmcGuidance('xyzzy plugh nothing', 'FDA', 50).total).toBe(0);
  });
});

describe('the authority’s own documents come first', () => {
  it('ranks an authority’s own stability document above the ICH baseline', () => {
    /* WHO holds its own stability standard (TRS 1010 Annex 10), so a WHO
       stability question must lead with it, not with ICH Q1A(R2). */
    const { matches } = findCmcGuidance('stability', 'WHO', 6);
    expect(matches.length).toBeGreaterThan(1);
    expect(matches[0].authority).toBe('WHO');
    expect(matches.some((s) => s.authority === 'ICH')).toBe(true);
  });

  it('still lets a materially better topical match win, whoever issued it', () => {
    /* A code asked for by name is the strongest signal there is: asking for
       Q1A(R2) while naming an authority must return Q1A(R2), not that
       authority's loosely related document. */
    const { matches } = findCmcGuidance('Q1A(R2)', 'TGA', 4);
    expect(matches[0].code).toMatch(/Q1A/);
    expect(matches[0].authority).toBe('ICH');
  });
});

describe('the baseline is never lent to an authority the record does not know', () => {
  it('matches nothing for an unresolvable authority', () => {
    /* `resolveAuthorities` answers `[]` for a word it does not know. If the
       baseline were included on an empty list, a question about an authority
       the record has never heard of would come back with ICH documents and
       read as answered. */
    for (const unknown of ['Atlantis Medicines Agency', 'European Commission of Nowhere', 'zzz']) {
      expect(findCmcGuidance('stability', unknown, 3).total, unknown).toBe(0);
    }
  });

  it('the tool still refuses an unknown authority by name', () => {
    const out = JSON.parse(cmcGuidance({ query: 'stability', authority: 'Atlantis Medicines Agency' }));
    expect(out.error).toMatch(/No authority "Atlantis Medicines Agency" in the record/);
    expect(out.documents).toBeUndefined();
  });

  it('searches every authority when none is named', () => {
    const all = findCmcGuidance('stability', undefined, 50);
    expect(all.total).toBeGreaterThan(findCmcGuidance('stability', 'WHO', 50).total);
  });
});

describe('an adopted guideline is cited as ICH, and said to be adopted', () => {
  it('names the issuer in every citation, so a baseline is never read as the authority’s own text', () => {
    const { matches } = findCmcGuidance('stability', 'EMA', 6);
    const ich = matches.filter((s) => s.authority === 'ICH');
    expect(ich.length).toBeGreaterThan(0);
    for (const s of ich) expect(citeSource(s)).toMatch(/^ICH /);
  });

  it('marks each adopted document as adopted, by the authority that adopted it', () => {
    const out = JSON.parse(cmcGuidance({ query: 'stability', authority: 'EMA' }));
    expect(out.found).toBeGreaterThan(0);
    const docs: Array<{ cite: string; adopted_by?: string }> = out.documents;
    const ich = docs.filter((d) => d.cite.startsWith('ICH '));
    expect(ich.length).toBeGreaterThan(0);
    for (const d of ich) expect(d.adopted_by).toBe('EMA/EC');
    /* And the authority's OWN documents are not marked adopted. */
    for (const d of docs.filter((x) => !x.cite.startsWith('ICH '))) expect(d.adopted_by).toBeUndefined();
    expect(out.adopted).toMatch(/through adoption/);
  });

  it('marks nothing adopted when the question IS about ICH', () => {
    const out = JSON.parse(cmcGuidance({ query: 'stability', authority: 'ICH' }));
    expect(out.found).toBeGreaterThan(0);
    expect(out.adopted).toBeUndefined();
    for (const d of out.documents as Array<{ adopted_by?: string }>) expect(d.adopted_by).toBeUndefined();
  });

  it('marks nothing adopted when no authority was named', () => {
    const out = JSON.parse(cmcGuidance({ query: 'stability' }));
    expect(out.found).toBeGreaterThan(0);
    expect(out.adopted).toBeUndefined();
    for (const d of out.documents as Array<{ adopted_by?: string }>) expect(d.adopted_by).toBeUndefined();
  });

  it('never describes a document the result does not carry', () => {
    /* The flag travels with the document it is about. One note saying "this
       list includes the ICH baseline" could outlive the trim `fit` performs to
       meet the result budget and describe a document that had been dropped —
       which is how this case first failed. */
    for (const authority of ['TGA', 'WHO', 'FDA', 'EMA', 'PMDA']) {
      for (const query of ['GMP clearance overseas manufacturer', 'stability', 'specification']) {
        const out = JSON.parse(cmcGuidance({ query, authority }));
        const docs: Array<{ cite: string; adopted_by?: string }> = out.documents ?? [];
        const marked = docs.filter((d) => d.adopted_by);
        for (const d of marked) expect(d.cite.startsWith('ICH '), `${authority}/${query}: ${d.cite}`).toBe(true);
        if (marked.length === 0 && docs.length > 0) {
          expect(docs.every((d) => !d.cite.startsWith('ICH ')), `${authority}/${query}`).toBe(true);
        }
      }
    }
  });
});
