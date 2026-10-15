/**
 * A governed proposal's prose is checked before a person approves it
 * (GRD-2 / FIG-3, AnA reasoning round 3, 2026-10-05).
 *
 * When AnA proposes a write that stores her prose in a governed record — a
 * drafted authoring document, a vault version, a protocol section — the turn
 * is held for a person's approval. Until now the approval dialog showed the
 * draft as "sections: 3 items" and checked nothing, so a figure she invented
 * reached the record with a person's approval on it. The draft is now checked
 * by the same engine as her answers, against the same sources.
 */
import { describe, expect, it } from 'vitest';

import { toolEvidence, type EvidenceEntry } from '../../server/services/ana/answer-grounding';
import { checkProposal, proposalProse } from '../../server/services/ana/proposal-check';

const tool = (name: string, content: unknown, input: unknown = {}): EvidenceEntry =>
  toolEvidence(name, {
    status: 'success',
    input,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    generated: { calls: 0, texts: [], overflow: false },
  })!;
const texts = (claims: Array<{ text: string }>) => claims.map((c) => c.text);

const SEARCH = tool(
  'search_literature',
  { studies: [{ nctId: 'NCT01234567', briefTitle: 'A Phase 3 Study of Drug X', orr: '47%', enrolled: 212 }] },
  { query: 'pivotal study of drug X' },
);

describe('the prose a proposal would store', () => {
  it('reads every free-text field, at any depth, and no other field', () => {
    const prose = proposalProse({
      title: 'Clinical overview 2.5',
      reason: 'Drafting it as the team asked.',
      sections: [
        { title: 'Efficacy', content: 'The ORR was 47%.' },
        { title: 'Safety', content: '<p>Grade 3 events occurred in <strong>12%</strong> of patients.</p>' },
      ],
    });
    expect(prose).toContain('The ORR was 47%.');
    expect(prose).toContain('Grade 3 events occurred in 12% of patients.');
    expect(prose).not.toContain('<strong>');
    expect(prose).not.toContain('Clinical overview 2.5');
    expect(prose).not.toContain('Drafting it as the team asked.');
  });

  it('reads a list of paragraphs under a prose field', () => {
    expect(proposalProse({ content: ['First, 47%.', 'Then 212 patients.'] })).toBe('First, 47%.\n\nThen 212 patients.');
  });

  it('stops at a fixed depth, so no proposal shape can overflow the stack', () => {
    let deep: unknown = { content: 'The ORR was 47%.' };
    for (let i = 0; i < 100_000; i++) deep = { inner: deep };
    expect(() => proposalProse(deep)).not.toThrow();
  });
});

describe('a proposal checked against this turn\'s sources', () => {
  it('finds what the sources hold, and names what they do not', () => {
    const c = checkProposal(
      { sections: [{ title: 'Efficacy', content: 'In NCT01234567 the ORR was 47% in 212 patients; median PFS was 11.2 months.' }] },
      [SEARCH],
    );
    expect(c?.found).toBe(3);
    expect(texts(c?.notFound ?? [])).toEqual(['11.2 months']);
  });

  it('names a verdict the draft states', () => {
    const c = checkProposal({ content: 'The submission is ready to file.' }, [SEARCH]);
    expect(c?.verdicts.map((v) => v.text)).toEqual(['is ready to file']);
  });

  it('with nothing consulted, the draft\'s claims are not checked — never found', () => {
    const c = checkProposal({ content: 'The ORR was 47%.' }, [{ source: 'person', content: 'Draft the clinical overview.' }]);
    expect(c?.basis).toBe('no_sources');
    expect(texts(c?.unchecked ?? [])).toEqual(['47%']);
    expect(c?.found).toBe(0);
  });

  it('a proposal that stores no prose has nothing to check', () => {
    expect(checkProposal({ documentId: 'doc_1', status: 'in_review' }, [SEARCH])).toBeNull();
    expect(checkProposal({ content: '   ' }, [SEARCH])).toBeNull();
  });
});
