/**
 * A position the programme's own answers contradict is MARKED, not hidden
 * (founder's decision, 2026-10-12).
 *
 * The catalogue offered every position the registry and the modality frame
 * allow, flat: a De Novo beside a named predicate, a 510(k) for a device the
 * sponsor had just called Class III. Both are wrong options rather than
 * neutral ones. The decision taken was neither to hide them — an absent
 * option is a question lying by omission, and hidden options have already cost
 * this engine whole interviews — nor to leave them flat, but to mark them:
 * availability, a reason naming the answer that creates the contradiction, and
 * the authority that makes it one.
 *
 * What these tests hold:
 *   - an absent fact marks nothing, because not knowing is not a contradiction;
 *   - each rule fires on the fact it is about and not on its neighbours;
 *   - every rule can actually fire, and every position a rule names is a
 *     position the catalogue offers — the same two-directional check the
 *     catalogue runs against the filing registry;
 *   - marking removes nothing: the options with facts are the options without.
 */
import { describe, expect, it } from 'vitest';

import {
  allPathwayPositions,
  cautionFor,
  cautionablePositionIds,
  pathwayOptions,
  positionFor,
  type ProgrammeFacts,
} from '../pathway-positions.js';

/** Every fact a flow can state today, one at a time. */
const FACT_SETS: ProgrammeFacts[] = [
  { regions: ['US'] },
  { regions: ['EU'] },
  { predicateNamed: 'K123456 — Acme Stent' },
  { deviceClass: 'I' },
  { deviceClass: 'II' },
  { deviceClass: 'III' },
  { euMdrClass: 'I' },
  { euMdrClass: 'IIa' },
  { euMdrClass: 'IIb' },
  { euMdrClass: 'III' },
];

describe('an answer nobody has given', () => {
  it('speaks against nothing at all', () => {
    const marked = allPathwayPositions().filter(p => cautionFor(p.value, {}) !== null);
    expect(marked.map(p => p.value), 'a caution with no fact behind it').toEqual([]);
  });

  it('is not invented from a class the person said they do not know', () => {
    // 'Not yet classified' reaches the catalogue as an absent fact, by design.
    expect(cautionFor('US_PMA', {})).toBeNull();
    expect(cautionFor('US_510K', {})).toBeNull();
  });
});

describe('the agency the sponsor named', () => {
  it('closes a filing to a regulator they did not name, and says how to open it', () => {
    const caution = cautionFor('EU_MDR_CLASS_III', { regions: ['US'] })!;
    expect(caution.availability).toBe('inapplicable');
    expect(caution.reason).toMatch(/You have named FDA/);
    expect(caution.reason, 'the way out must be actionable').toMatch(/name EMA among the agencies/);
    /* The authority is the statute behind the position itself: what makes an
       MDR route the EU's is the MDR, and that is the position's own citation. */
    expect(caution.authority).toBe(positionFor('EU_MDR_CLASS_III')!.authority);
    expect(caution.authority).toMatch(/MDR Art 52/);
  });

  it('leaves every filing to a regulator they did name', () => {
    for (const id of ['US_510K', 'US_PMA', 'US_NDA', 'US_IND']) {
      expect(cautionFor(id, { regions: ['US'] }), id).toBeNull();
    }
    for (const id of ['EU_MAA', 'EU_MDR_CLASS_III']) {
      expect(cautionFor(id, { regions: ['US', 'EU'] }), id).toBeNull();
    }
  });

  it('names every agency the sponsor gave, not just the first', () => {
    expect(cautionFor('EU_MAA', { regions: ['US', 'JP'] })!.reason).toMatch(/FDA and PMDA/);
    expect(cautionFor('EU_MAA', { regions: ['US', 'JP', 'CA'] })!.reason).toMatch(/FDA, PMDA and Health Canada/);
  });

  it('comes before every other mark, because a filing is made to a regulator or not at all', () => {
    // Class III would otherwise mark a 510(k) as needing a basis; the wrong
    // regulator is the more fundamental objection and is the one reported.
    const caution = cautionFor('US_510K', { regions: ['EU'], deviceClass: 'III' })!;
    expect(caution.availability).toBe('inapplicable');
    expect(caution.reason).toMatch(/You have named EMA/);
  });

  it('says nothing where no agency has been named', () => {
    expect(cautionFor('EU_MAA', {})).toBeNull();
    expect(cautionFor('EU_MAA', { regions: [] }), 'an empty list is not a statement').toBeNull();
  });
});

describe('a De Novo', () => {
  it('needs a basis once a predicate is named, and says which basis', () => {
    const caution = cautionFor('US_DE_NOVO', { predicateNamed: 'K123456 — Acme Stent' })!;
    expect(caution.availability).toBe('needs_basis');
    expect(caution.reason, 'the reason must name the answer that creates it').toContain('K123456 — Acme Stent');
    expect(caution.reason).toMatch(/NSE determination/i);
    expect(caution.authority).toMatch(/513\(f\)\(2\)/);
    // The IVD De Novo is the same position for an assay.
    expect(cautionFor('US_DE_NOVO_IVD', { predicateNamed: 'K123456' })!.availability).toBe('needs_basis');
  });

  it('is not marked for the route that is ABOUT a predicate', () => {
    expect(cautionFor('US_510K', { predicateNamed: 'K123456' })).toBeNull();
    expect(cautionFor('US_PMA', { predicateNamed: 'K123456' })).toBeNull();
  });

  it('needs a basis for a device the sponsor has called Class III', () => {
    const caution = cautionFor('US_DE_NOVO', { deviceClass: 'III' })!;
    expect(caution.reason).toMatch(/Class I or Class II/);
    expect(caution.availability).toBe('needs_basis');
  });
});

describe('the class the sponsor states', () => {
  it('marks a 510(k) for a Class III device, and names the basis that would allow it', () => {
    const caution = cautionFor('US_510K', { deviceClass: 'III' })!;
    expect(caution.availability).toBe('needs_basis');
    expect(caution.reason, 'the preamendments exception is the basis, so it must be stated').toMatch(/preamendments/i);
    expect(caution.authority).toMatch(/814\.1\(c\)/);
    // The IVD and companion-diagnostic 510(k)s carry the same mark.
    expect(cautionFor('US_510K_IVD', { deviceClass: 'III' })!.availability).toBe('needs_basis');
    expect(cautionFor('US_CDX_510K', { deviceClass: 'III' })!.availability).toBe('needs_basis');
  });

  it('marks a 510(k) for a Class I device as probably exempt', () => {
    expect(cautionFor('US_510K', { deviceClass: 'I' })!.reason).toMatch(/exempt/i);
  });

  it('marks a PMA for a device of a lower class, and leaves it marked for Class III', () => {
    expect(cautionFor('US_PMA', { deviceClass: 'II' })!.reason).toMatch(/Class II/);
    expect(cautionFor('US_PMA_IVD', { deviceClass: 'I' })!.availability).toBe('needs_basis');
    expect(cautionFor('US_PMA', { deviceClass: 'III' }), 'a PMA is the Class III route').toBeNull();
    expect(cautionFor('US_510K', { deviceClass: 'II' }), 'a 510(k) is the Class II route').toBeNull();
  });
});

describe('the EU class routes', () => {
  it('close a route the stated class is not the route for', () => {
    const caution = cautionFor('EU_MDR_CLASS_IIA', { euMdrClass: 'IIb' })!;
    expect(caution.availability, 'the class decides the route; it is not a preference').toBe('inapplicable');
    expect(caution.reason).toMatch(/Class IIb/);
    expect(caution.reason).toMatch(/Class IIa/);
    expect(caution.authority).toMatch(/Annex VIII/);
  });

  it('leave the route the stated class IS the route for', () => {
    expect(cautionFor('EU_MDR_CLASS_IIB', { euMdrClass: 'IIb' })).toBeNull();
    expect(cautionFor('EU_MDR_CLASS_III', { euMdrClass: 'III' })).toBeNull();
    expect(cautionFor('EU_MDR_CLASS_I', { euMdrClass: 'I' })).toBeNull();
  });

  it('are not touched by a US class, which is a different question', () => {
    expect(cautionFor('EU_MDR_CLASS_IIA', { deviceClass: 'III' })).toBeNull();
  });
});

describe('what every rule must satisfy', () => {
  const everyCaution = () =>
    allPathwayPositions().flatMap(position =>
      FACT_SETS.map(facts => ({ position: position.value, facts, caution: cautionFor(position.value, facts) })),
    ).filter(row => row.caution !== null);

  it('says something, with the authority that makes it say it', () => {
    for (const row of everyCaution()) {
      expect(row.caution!.reason.length, row.position).toBeGreaterThan(40);
      expect(row.caution!.authority.trim(), row.position).not.toBe('');
    }
  });

  it('can fire: every position a rule names is reachable, and is one the catalogue offers', () => {
    const offered = new Set(allPathwayPositions().map(p => p.value));
    const unoffered = cautionablePositionIds().filter(id => !offered.has(id));
    expect(unoffered, 'a rule marking a position nobody is offered').toEqual([]);

    const fired = new Set(everyCaution().map(row => row.position));
    const dead = cautionablePositionIds().filter(id => !fired.has(id));
    expect(dead, 'a rule no fact a flow can state will ever reach: a check that only passes').toEqual([]);
  });
});

describe('marking is not hiding', () => {
  it('offers the same positions, in the same order, with and without the facts', () => {
    const facts: ProgrammeFacts = { deviceClass: 'III', predicateNamed: 'K123456' };
    const flat = pathwayOptions({ domain: 'medical_devices', region: 'US' });
    const marked = pathwayOptions({ domain: 'medical_devices', region: 'US', facts });
    expect(marked.map(o => o.value)).toEqual(flat.map(o => o.value));
    expect(marked.map(o => o.label)).toEqual(flat.map(o => o.label));
    const deNovo = marked.find(o => o.value === 'US_DE_NOVO')!;
    expect(deNovo.caution!.availability).toBe('needs_basis');
    expect(flat.find(o => o.value === 'US_DE_NOVO')!.caution, 'no facts, no mark').toBeUndefined();
  });

  it('leaves the positions nothing speaks against unmarked', () => {
    const marked = pathwayOptions({ domain: 'medical_devices', region: 'US', facts: { deviceClass: 'II' } });
    expect(marked.find(o => o.value === 'US_510K')!.caution).toBeUndefined();
    expect(marked.find(o => o.value === 'US_PMA')!.caution!.availability).toBe('needs_basis');
  });
});
