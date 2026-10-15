/**
 * A branch reads every answer the interview holds, not just this question's
 * (founder's directive, 2026-10-12).
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `resolveNextNode` was given the answers to the CURRENT node only:
 *
 *     const nextNodeId = resolveNextNode(currentNode, answers, definition);
 *
 * So a branch whose predicate reads an earlier node's field — *"this is a
 * vaccine"*, *"the device contains software"*, *"the product is a device"* —
 * was evaluated against a record where that field is absent, and could never
 * match. **30 of the 63 branch predicates in these flows read an earlier
 * node's field**, so all 30 were dead, and with them:
 *
 *   - the oncology endpoint questions (protocol_development) and the oncology
 *     and vaccine efficacy questions (csr_report);
 *   - the 510(k) software classification, sterilisation, EMC and implant
 *     questions, and the PMA software documentation;
 *   - the cell-therapy and vaccine characterisation questions (BLA);
 *   - the SaMD and pharma hazard questions (risk_management);
 *   - the biologics stability questions, the CER novel-device assessment, the
 *     IND amendment summary, the NDA safety database and the briefing-book
 *     product overview.
 *
 * Every one of those is the subject-matter intelligence these interviews exist
 * for, written and unreachable. `visibleWhen` and the validator have always
 * read the flattened view; only branching did not.
 *
 * These tests use their own two-node flow so they hold the ENGINE's behaviour
 * rather than one flow's shape, and the shape of the defect is reproduced
 * exactly: the predicate names a field answered in the first node and the
 * branch is declared on the second.
 */
import { describe, expect, it, vi } from 'vitest';

import type { FlowDefinition } from '../types.js';

const FLOW: FlowDefinition = {
  id: 'branch-reads-every-answer-v1',
  category: 'cmc_specification',
  name: 'Branch reproduction',
  description: 'The product is named in the first question and branched on in the second.',
  clientTypes: [],
  entryNode: 'what_is_it',
  sections: [{ id: 's', label: 'S', nodeIds: ['what_is_it', 'common', 'vaccine_only', 'small_molecule_only'] }],
  nodes: [
    {
      id: 'what_is_it',
      section: 'S',
      question: 'What is the product?',
      fields: [
        {
          id: 'product_class',
          label: 'Product class',
          type: 'select',
          required: true,
          options: [
            { value: 'vaccine', label: 'Vaccine' },
            { value: 'small_molecule', label: 'Small molecule' },
          ],
        },
      ],
      defaultNext: 'common',
    },
    {
      id: 'common',
      section: 'S',
      question: 'Something every programme answers.',
      fields: [{ id: 'anything', label: 'Anything', type: 'text' }],
      /* The predicate reads the FIRST node's field. This is the shape of all
         30: a branch on what the programme already said it is. */
      branches: [{ when: { field: 'product_class', operator: 'eq', value: 'vaccine' }, goto: 'vaccine_only' }],
      defaultNext: 'small_molecule_only',
    },
    {
      id: 'vaccine_only',
      section: 'S',
      question: 'Lot release and potency.',
      fields: [{ id: 'potency_assay', label: 'Potency assay', type: 'text' }],
      defaultNext: null,
    },
    {
      id: 'small_molecule_only',
      section: 'S',
      question: 'Impurity qualification.',
      fields: [{ id: 'impurities', label: 'Impurities', type: 'text' }],
      defaultNext: null,
    },
    {
      /* A branch onto its own node. Reading every answer woke one of these in
         a real flow — an emergency IND asked `ind_review` for ever — so the
         engine refuses the shape (2026-10-12 review). */
      id: 'loops_on_itself',
      section: 'S',
      question: 'A question that branches to itself.',
      fields: [{ id: 'anything_else', label: 'Anything else', type: 'text' }],
      branches: [{ when: { field: 'product_class', operator: 'eq', value: 'vaccine' }, goto: 'loops_on_itself' }],
      defaultNext: null,
    },
  ],
};

vi.mock('../flows/index.js', () => ({
  getFlowDefinition: () => FLOW,
  getAvailableFlows: () => [],
  resolveFlowCategory: () => 'cmc_specification',
}));

import { advanceFlow, startFlow } from '../engine.js';

const CTX = { organizationId: 7, userId: 3, projectId: null };

const walk = (productClass: string) => {
  const started = startFlow('cmc_specification', CTX);
  const atCommon = advanceFlow(started.state, 'what_is_it', { product_class: productClass }, CTX);
  expect(atCommon.event?.node.id).toBe('common');
  return advanceFlow(atCommon.state, 'common', { anything: 'x' }, CTX);
};

describe('a branch on what the programme already said it is', () => {
  it('is taken — it was dead, because the predicate read the current node alone', () => {
    expect(walk('vaccine').event?.node.id, 'the vaccine questions were unreachable').toBe('vaccine_only');
  });

  it('is not taken when the earlier answer does not match it', () => {
    expect(walk('small_molecule').event?.node.id).toBe('small_molecule_only');
  });

  it('is still taken on the answer to the branching question itself', () => {
    /* The 33 predicates that read their own node's field kept working, and
       must keep working. */
    const own: FlowDefinition = {
      ...FLOW,
      nodes: FLOW.nodes.map(n =>
        n.id === 'common'
          ? { ...n, branches: [{ when: { field: 'anything', operator: 'eq', value: 'now' }, goto: 'vaccine_only' }] }
          : n,
      ),
    };
    const started = startFlow('cmc_specification', CTX);
    const atCommon = advanceFlow(started.state, 'what_is_it', { product_class: 'small_molecule' }, CTX);
    const node = own.nodes.find(n => n.id === 'common')!;
    expect(node.branches![0].when.field).toBe('anything');
    expect(advanceFlow(atCommon.state, 'common', { anything: 'x' }, CTX).event?.node.id).toBe('small_molecule_only');
  });

  it('is refused where it targets its own node, because that can only loop', () => {
    const started = startFlow('cmc_specification', CTX);
    const stated = advanceFlow(started.state, 'what_is_it', { product_class: 'vaccine' }, CTX);
    const result = advanceFlow(
      { ...stated.state, currentNodeId: 'loops_on_itself' },
      'loops_on_itself',
      { anything_else: 'x' },
      CTX,
    );
    expect(result.event, 'the next question must not be this one again').toBeNull();
    expect(result.completeEvent, 'it falls through to the node\u2019s own defaultNext').not.toBeNull();
  });

  it('prefers this question’s answer where both hold the same field', () => {
    /* The submitted answer is the newer statement of the same fact, so it
       wins — the same precedence the validator and `visibleWhen` use. */
    const started = startFlow('cmc_specification', CTX);
    const atCommon = advanceFlow(started.state, 'what_is_it', { product_class: 'small_molecule' }, CTX);
    const result = advanceFlow(atCommon.state, 'common', { anything: 'x', product_class: 'vaccine' }, CTX);
    expect(result.event?.node.id).toBe('vaccine_only');
  });
});
