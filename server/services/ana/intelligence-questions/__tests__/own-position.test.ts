/**
 * A person can take a position the list does not offer, and AnA records it as
 * their words (founder's directive, 2026-10-12).
 *
 * AnA's interviews ask a question and offer a closed list of values. The
 * validator refuses anything that is not one of them:
 *
 *   errors.push({ fieldId, message: `${label}: "${value}" is not a valid option.` })
 *
 * So where the person's real position is not listed, their only moves are to
 * pick one that is wrong or to abandon the interview. Eleven questions in the
 * protocol flow (and a handful elsewhere) soften this with a hand-written
 * `{ value: 'other', label: 'Other' }` — which records the literal string
 * "other" and loses what they actually said; one of them reads "Other
 * (describe in notes)" for a field that has no notes. Every other flow
 * — 510(k), PMA, IND, NDA, BLA, CMC, stability, risk management — has no
 * escape at all. These answers feed document authoring and a Part 11 record,
 * so a forced wrong answer is a false statement in a regulated file.
 *
 * What this pins:
 *   - a field may declare `allowOther`, and then the person's own words are
 *     accepted, validated and kept;
 *   - a field that does NOT declare it still refuses anything unlisted, and
 *     says the list is closed rather than calling the answer invalid;
 *   - the words are stored apart from the listed values, so nothing
 *     downstream can mistake them for a position AnA offered;
 *   - the person is told, in the record, that AnA did not classify them.
 */
import { describe, it, expect, vi } from 'vitest';

import { OTHER_POSITION, otherFieldId } from '@shared/types/intelligence-questions';
import type { FlowDefinition } from '../types.js';

const PATHWAY_FLOW: FlowDefinition = {
  id: 'own-position-v1',
  category: 'cmc_specification',
  name: 'Own position reproduction',
  description: 'One question with a closed list, one with an escape hatch.',
  clientTypes: [],
  entryNode: 'closed_node',
  sections: [{ id: 's', label: 'S', nodeIds: ['closed_node', 'open_node'] }],
  nodes: [
    {
      id: 'closed_node',
      section: 'S',
      question: 'Which submission are you making?',
      fields: [
        {
          id: 'submission',
          label: 'Submission',
          type: 'select',
          required: true,
          options: [
            { value: 'ind', label: 'IND' },
            { value: 'nda', label: 'NDA' },
          ],
        },
      ],
      defaultNext: 'open_node',
    },
    {
      id: 'open_node',
      section: 'S',
      question: 'Which regulatory pathway are you taking?',
      fields: [
        {
          id: 'pathway',
          label: 'Pathway',
          type: 'select',
          required: true,
          options: [
            { value: 'b1', label: '505(b)(1)', commits: 'A full application on your own data.' },
            { value: 'b2', label: '505(b)(2)', commits: 'Reliance on another application, with bridging data.' },
          ],
          allowOther: { prompt: 'Which pathway, in your own words?' },
        },
      ],
      defaultNext: null,
    },
  ],
};

vi.mock('../flows/index.js', () => ({
  getFlowDefinition: () => PATHWAY_FLOW,
  getAvailableFlows: () => [],
  resolveFlowCategory: () => 'cmc_specification',
}));

import { startFlow, advanceFlow } from '../engine.js';

const CTX = { organizationId: 7, userId: 3, projectId: null };
const atOpenNode = () => advanceFlow(startFlow('cmc_specification', CTX).state, 'closed_node', { submission: 'ind' }, CTX).state;
const validationOf = (r: { event: { newIssues?: Array<{ checkId: string; message: string }> } | null }) =>
  (r.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'));

describe('a question that offers an escape hatch', () => {
  it("takes the person's own position and keeps their words", () => {
    const result = advanceFlow(
      atOpenNode(),
      'open_node',
      { pathway: OTHER_POSITION, [otherFieldId('pathway')]: '505(b)(2) relying on a listed drug we also own' },
      CTX,
    );
    expect(validationOf(result)).toEqual([]);
    expect(result.state.complete).toBe(true);
    // The answer is NOT one of the listed values, and says so.
    expect(result.state.answers.open_node.pathway).toBe(OTHER_POSITION);
    // Their words are kept, apart from the listed values.
    expect(result.state.ownWords?.open_node?.pathway).toBe('505(b)(2) relying on a listed drug we also own');
    /* And NOT inside the answers, where a consumer reading the record field by
       field could take them for a position AnA offered. */
    expect(Object.keys(result.state.answers.open_node)).toEqual(['pathway']);
  });

  it('says so on the record, rather than letting it read as a position AnA offered', () => {
    const result = advanceFlow(
      atOpenNode(),
      'open_node',
      { pathway: OTHER_POSITION, [otherFieldId('pathway')]: 'A pathway of my own' },
      CTX,
    );
    const noted = result.completeEvent?.issues.find(i => i.checkId === 'own_position_pathway');
    expect(noted, 'nothing on the record says this was the person’s own wording').toBeDefined();
    expect(noted!.severity).toBe('info');
    expect(noted!.message).toMatch(/own words/i);
    expect(result.completeEvent?.ownWords?.open_node?.pathway).toBe('A pathway of my own');
  });

  it('will not take the escape hatch with nothing written in it', () => {
    const result = advanceFlow(atOpenNode(), 'open_node', { pathway: OTHER_POSITION }, CTX);
    const errs = validationOf(result);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/Which pathway, in your own words\?/);
    expect(result.state.complete).toBe(false);
  });

  it('will not take words longer than the field can carry', () => {
    const result = advanceFlow(
      atOpenNode(),
      'open_node',
      { pathway: OTHER_POSITION, [otherFieldId('pathway')]: 'x'.repeat(2001) },
      CTX,
    );
    expect(validationOf(result)).toHaveLength(1);
  });

  it('still refuses a value that is neither listed nor the escape hatch', () => {
    const result = advanceFlow(atOpenNode(), 'open_node', { pathway: 'b3' }, CTX);
    expect(validationOf(result)).toHaveLength(1);
    expect(validationOf(result)[0].message).toMatch(/not a valid option/);
  });
});

describe('a question whose list is closed', () => {
  it('refuses the escape hatch, and says the list is closed rather than blaming the answer', () => {
    const result = advanceFlow(
      startFlow('cmc_specification', CTX).state,
      'closed_node',
      { submission: OTHER_POSITION, [otherFieldId('submission')]: 'Something else entirely' },
      CTX,
    );
    const errs = validationOf(result);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/only positions this question accepts/i);
    expect(result.state.complete).toBe(false);
    expect(result.state.ownWords?.closed_node).toBeUndefined();
  });
});
