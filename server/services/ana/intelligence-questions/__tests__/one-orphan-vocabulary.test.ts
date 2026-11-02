/**
 * Orphan designation is asked one way, read one way (founder's directive,
 * 2026-10-12: positions a person can take, with their own words beside them,
 * consistent across every scenario).
 *
 * Before 2026-11-02 five interviews asked it four ways: a yes/no in the
 * protocol, the BLA and the labeling (the labeling's asked of devices too); a
 * granted / applied / not-applicable select in the IND and the NDA; and orphan
 * checkboxes in two of the protocol's other lists. The natural-history gates
 * read two of those ways, and the cross-node rule read six, so the rule waited
 * on answers that could never open the question it needed.
 *
 * This holds four things:
 *   - every question that asks it offers the same positions, and the person's
 *     own words;
 *   - no other list offers an orphan position, except the four named below;
 *   - for every value ever offered or saved, the gate and the reader agree;
 *   - the war game's fee findings read the designation, so a granted one is an
 *     exemption to confirm, not a critical.
 */
import { describe, expect, it } from 'vitest';

import { OTHER_POSITION } from '../../../../../shared/types/intelligence-questions.js';
import { evaluatePredicate } from '../../../../../shared/ana/question-predicate.js';
import type { FlowCategory, FlowEngineContext, QuestionField } from '../types.js';
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';
import { statesOrphanDesignation } from '../cross-node-context.js';
import {
  EU_ORPHAN_POSITIONS,
  ORPHAN_FIELDS,
  ORPHAN_PROGRAMME_READINGS,
  US_ORPHAN_POSITIONS,
  orphanReadingOf,
} from '../flows/ind-submission-orphan-designation.js';
import { runWarGame } from '../war-game/engine.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };

const fieldsOf = (category: FlowCategory): QuestionField[] =>
  getFlowDefinition(category, CTX)!.nodes.flatMap(n => n.fields);

const everyField = (): Array<{ flow: FlowCategory; field: QuestionField }> =>
  getAvailableFlows(CTX).flatMap(f => fieldsOf(f.category).map(field => ({ flow: f.category, field })));

const POSITIONS = { orphan_designation: US_ORPHAN_POSITIONS, eu_orphan_designation: EU_ORPHAN_POSITIONS } as const;

describe('every question that asks the designation', () => {
  it('is asked where it was, and the EU one only in the protocol', () => {
    const askers = (id: string) => everyField().filter(x => x.field.id === id).map(x => x.flow).sort();
    expect(askers('orphan_designation')).toEqual(
      ['bla_submission', 'ind_submission', 'labeling', 'nda_submission', 'protocol_development'],
    );
    expect(askers('eu_orphan_designation')).toEqual(['protocol_development']);
  });

  it('offers the same positions, each with what it commits to and its authority, and the person’s own words', () => {
    for (const { flow, field } of everyField().filter(x => (ORPHAN_FIELDS as readonly string[]).includes(x.field.id))) {
      const expected = POSITIONS[field.id as keyof typeof POSITIONS];
      expect(field.type, `${flow}.${field.id}`).toBe('select');
      expect(field.options?.map(o => o.value), `${flow}.${field.id}`).toEqual(expected.map(o => o.value));
      expect(field.options?.every(o => o.commits && o.authority), `${flow}.${field.id}`).toBe(true);
      expect(field.allowOther?.prompt, `${flow}.${field.id}`).toBeTruthy();
    }
  });

  it('is asked in the labeling only of a drug or a biologic', () => {
    const gate = fieldsOf('labeling').find(f => f.id === 'orphan_designation')!.visibleWhen!;
    for (const t of ['rx_drug', 'biologic', 'biosimilar', 'combination']) expect(evaluatePredicate(gate, { product_type: t })).toBe(true);
    for (const t of ['medical_device', 'ivd']) expect(evaluatePredicate(gate, { product_type: t })).toBe(false);
  });
});

/**
 * Lists that still offer an orphan value, and why. Anything else that does is
 * the designation asked a second time.
 */
const NAMED: Readonly<Record<string, string>> = {
  'nda_submission.exclusivity_claims=orphan_7yr': 'an exclusivity claim, which the designation is checked against',
  'ind_submission.prea_applicable=orphan_exempt': 'a PREA position (the paediatric family)',
  'nda_submission.prea_applicable=orphan_exempt': 'a PREA position (the paediatric family)',
  'nda_submission.user_fee_paid=orphan_exempt': 'the fee exemption a grant gives, judged against it (nda-submission-user-fee.ts)',
  'bla_submission.user_fee_paid=orphan_exempt': 'the fee exemption a grant gives, judged against it (nda-submission-user-fee.ts)',
  'csr_report.expedited_pathways=orphan_drug': 'the expedited family redraws this list',
  'briefing_book.expedited_designations=orphan': 'the expedited family redraws this list',
};

describe('no other list', () => {
  it('offers an orphan position, except those named with a reason', () => {
    const offered = everyField()
      .filter(x => !(ORPHAN_FIELDS as readonly string[]).includes(x.field.id))
      .flatMap(x => (x.field.options ?? []).filter(o => /orphan/i.test(o.value)).map(o => `${x.flow}.${x.field.id}=${o.value}`));
    expect([...new Set(offered)].sort()).toEqual(Object.keys(NAMED).sort());
  });
});

/** Every value any version of the questions offered, and blanks. */
const VALUES: unknown[] = [
  ...US_ORPHAN_POSITIONS.map(o => o.value),
  OTHER_POSITION,
  true, false, 'yes', 'no', 'Yes', ' y ', 'TRUE', 'false', '1', '0', 'not_applicable',
  '', undefined, null, 'granted ', 'designated',
];

describe('the gate and the reader', () => {
  const gates = (getAvailableFlows(CTX).map(f => f.category) as FlowCategory[]).flatMap(category => {
    const nh = fieldsOf(category).find(f => f.id === 'natural_history' && f.visibleWhen);
    return nh ? [{ category, gate: nh.visibleWhen! }] : [];
  });

  it('every natural-history gate is in the four interviews the rule applies to', () => {
    expect(gates.map(g => g.category).sort()).toEqual(['bla_submission', 'ind_submission', 'nda_submission', 'protocol_development']);
  });

  it.each(VALUES.map(v => [JSON.stringify(v) ?? 'undefined', v]))('agree on %s, in every interview', (_label, value) => {
    const programme = ORPHAN_PROGRAMME_READINGS.has(orphanReadingOf(value)!);
    for (const { category, gate } of gates) {
      const answers = { orphan_designation: value, ind_type_selection: 'commercial' };
      expect(evaluatePredicate(gate, answers), `${category} gate on ${String(value)}`).toBe(programme);
      expect(statesOrphanDesignation(answers), `rule on ${String(value)}`).toBe(programme);
    }
  });

  it('agree on the EU designation in the protocol', () => {
    const gate = gates.find(g => g.category === 'protocol_development')!.gate;
    for (const value of [...EU_ORPHAN_POSITIONS.map(o => o.value), OTHER_POSITION]) {
      const programme = ORPHAN_PROGRAMME_READINGS.has(orphanReadingOf(value)!);
      expect(evaluatePredicate(gate, { eu_orphan_designation: value }), value).toBe(programme);
      expect(statesOrphanDesignation({ eu_orphan_designation: value }), value).toBe(programme);
    }
  });

  it('does not take a PREA position or an exclusivity claim for the designation', () => {
    /* Both are claims the designation is checked against. Read as evidence of
       it, they made the rule wait on answers that open no gate. */
    expect(statesOrphanDesignation({ prea_applicable: 'orphan_exempt' })).toBe(false);
    expect(statesOrphanDesignation({ exclusivity_claims: ['orphan_7yr'] })).toBe(false);
    expect(statesOrphanDesignation({ regulatory_pathway: ['orphan_drug'], ema_designations: ['orphan'] })).toBe(false);
  });

  it('never reads a saved yes as a grant', () => {
    for (const v of [true, 'yes', 'Y']) expect(orphanReadingOf(v)).toBe('stated');
    for (const v of [false, 'no', 'not_applicable']) expect(orphanReadingOf(v)).toBe('not_held');
  });
});

describe('the war game reads the designation on the user fee', () => {
  const fee = (category: 'nda' | 'bla', flow: FlowCategory, answers: Record<string, unknown>) =>
    runWarGame(category, getFlowDefinition(flow, CTX)!.id, { n: answers }).findings.find(f => /user_fee/.test(f.id));

  it('NDA: a granted designation makes an unpaid fee an exemption to confirm, not a critical', () => {
    expect(fee('nda', 'nda_submission', { user_fee_paid: false, orphan_designation: 'granted' })?.severity).toBe('info');
    expect(fee('nda', 'nda_submission', { user_fee_paid: false, orphan_designation: 'not_requested' })?.severity).toBe('critical');
  });

  it('NDA: a pending request, or a pre-2026-11-02 yes, is not a grant', () => {
    const pending = fee('nda', 'nda_submission', { user_fee_paid: false, orphan_designation: 'applied' });
    expect(pending?.severity).toBe('critical');
    expect(pending?.requirement).toMatch(/attaches only to a granted designation/);
    const legacy = fee('nda', 'nda_submission', { user_fee_paid: false, orphan_designation: 'yes' });
    expect(legacy?.severity).toBe('critical');
    expect(legacy?.requirement).toMatch(/without saying FDA granted it/);
  });

  it('BLA: an exemption for a 351(a) BLA, and none for a 351(k) biosimilar', () => {
    const novel = fee('bla', 'bla_submission', { user_fee_paid: false, orphan_designation: 'granted', bla_pathway: '351a_novel' });
    expect(novel?.severity).toBe('info');
    expect(novel?.recommendation).not.toMatch(/waiver request for orphan/);
    const biosimilar = fee('bla', 'bla_submission', { user_fee_paid: false, orphan_designation: 'granted', bla_pathway: '351k_biosimilar' });
    expect(biosimilar?.severity).toBe('warning');
    expect(biosimilar?.requirement).toMatch(/BsUFA, which hold no orphan exemption/);
  });

  it('BLA: a saved true still reads (the yes/no it was)', () => {
    expect(fee('bla', 'bla_submission', { user_fee_paid: false, orphan_designation: true, bla_pathway: '351a_novel' })?.severity).toBe('warning');
  });
});
