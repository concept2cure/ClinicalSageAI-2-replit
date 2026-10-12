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
  cautionFor,
  cautionRuleIds,
  cautionablePositionIds,
  type ProgrammeFacts,
} from '../pathway-cautions.js';
import { allPathwayPositions, pathwayOptions, positionFor } from '../pathway-positions.js';

/** Every fact a flow can state today, one at a time. */
const FACT_SETS: ProgrammeFacts[] = [
  { regions: ['US'] },
  { regions: ['EU'] },
  { modality: 'biosimilar' },
  { modality: 'small_molecule' },
  { modality: 'mab' },
  { predicateNamed: 'K123456 — Acme Stent', predicate: 'named' },
  { predicate: 'none' },
  { predicate: 'nse' },
  { deviceClass: 'I' },
  { deviceClass: 'II' },
  { deviceClass: 'III' },
  { ivdrClass: 'A' },
  { ivdrClass: 'B' },
  { ivdrClass: 'C' },
  { ivdrClass: 'D' },
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
    /* And it names the filing in words true of it: an MDR class route is a
       notified body's conformity assessment, not a filing to EMA. */
    expect(caution.reason).toMatch(/an EU conformity assessment under the MDR/);
    expect(caution.reason, 'the way out must be actionable').toMatch(/name EMA among the agencies/);
    expect(cautionFor('EU_IVDR_CLASS_B', { regions: ['US'] })!.reason).toMatch(/under the IVDR/);
    expect(cautionFor('EU_MAA', { regions: ['US'] })!.reason, 'a medicine IS filed to EMA').toMatch(
      /a filing to EMA/,
    );
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

describe('a programme with nothing to compare to', () => {
  it('closes the 510(k), which is the stronger half of the De Novo pair', () => {
    const caution = cautionFor('US_510K', { predicate: 'none' })!;
    expect(caution.availability).toBe('inapplicable');
    expect(caution.reason).toMatch(/no legally marketed device to compare to/);
    expect(caution.reason).toMatch(/first condition for a De Novo/);
    /* The regulation is cited at subpart level: 860.220 is the De Novo
       request's content and format, not who may make one, and this module
       does not state a section it has not verified. */
    expect(caution.authority).toMatch(/860 Subpart D/);
    expect(cautionFor('US_510K_IVD', { predicate: 'none' })!.availability).toBe('inapplicable');
  });

  it('says the other thing when FDA has already found the device not equivalent', () => {
    const caution = cautionFor('US_CDX_510K', { predicate: 'nse' })!;
    expect(caution.reason).toMatch(/already found this device not substantially equivalent/);
    expect(caution.reason).toMatch(/second of the two conditions|one of the two conditions/);
  });

  it('leaves the De Novo alone, which is the route it points at', () => {
    expect(cautionFor('US_DE_NOVO', { predicate: 'none' })).toBeNull();
    expect(cautionFor('US_DE_NOVO_IVD', { predicate: 'nse' })).toBeNull();
  });

  it('says nothing where no predicate has been named and none has been ruled out', () => {
    expect(cautionFor('US_510K', {}), 'an empty predicate box is an unanswered question').toBeNull();
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

describe('which statute governs the product', () => {
  it('closes a 505 route to a biological product, and says why by date', () => {
    const caution = cautionFor('US_ANDA', { modality: 'mab' })!;
    expect(caution.availability).toBe('inapplicable');
    expect(caution.reason).toMatch(/monoclonal antibody/i);
    expect(caution.reason).toMatch(/section 351 of the PHS Act/);
    expect(caution.authority).toMatch(/BPCIA/);
    expect(cautionFor('US_NDA', { modality: 'gene_therapy' })!.availability).toBe('inapplicable');
  });

  it('closes a biologics licence to a chemical product', () => {
    expect(cautionFor('US_351K', { modality: 'small_molecule' })!.availability).toBe('inapplicable');
    expect(cautionFor('EU_BIOSIMILAR_MAA', { modality: 'peptide' })!.reason).toMatch(/section 505/);
    expect(cautionFor('US_BLA', { modality: 'oligonucleotide' })!.availability).toBe('inapplicable');
  });

  it('leaves each statute’s own routes alone', () => {
    expect(cautionFor('US_BLA', { modality: 'mab' })).toBeNull();
    expect(cautionFor('US_351K', { modality: 'biosimilar' })).toBeNull();
    expect(cautionFor('US_NDA', { modality: 'small_molecule' })).toBeNull();
    expect(cautionFor('US_ANDA', { modality: 'small_molecule' })).toBeNull();
  });

  it('asks a biosimilar programme to say so when it takes a standalone licence', () => {
    const bla = cautionFor('US_BLA', { modality: 'biosimilar' })!;
    expect(bla.availability, 'a sponsor may take it deliberately').toBe('needs_basis');
    expect(bla.reason).toMatch(/NOT claiming biosimilarity/);
    expect(cautionFor('EU_MAA', { modality: 'biosimilar' })!.reason).toMatch(/Article 8\(3\)/);
    expect(cautionFor('EU_GENERIC_DCP', { modality: 'mab' })!.availability).toBe('inapplicable');
  });
});

describe('the IVDR class routes', () => {
  it('close the routes the stated class is not the route for', () => {
    const caution = cautionFor('EU_IVDR_CLASS_B', { ivdrClass: 'D' })!;
    expect(caution.availability, 'the class decides the route under Art 48').toBe('inapplicable');
    expect(caution.reason).toMatch(/Class D under the IVDR/);
    expect(caution.reason).toMatch(/applies to Class B/);
    expect(caution.authority).toMatch(/Art 47, Art 48, Annex VIII/);
  });

  it('keep Class C and Class D on the one entry the registry holds for them', () => {
    expect(cautionFor('EU_IVDR_CLASS_CD', { ivdrClass: 'C' })).toBeNull();
    expect(cautionFor('EU_IVDR_CLASS_CD', { ivdrClass: 'D' })).toBeNull();
    expect(cautionFor('EU_IVDR_CLASS_CD', { ivdrClass: 'A' })!.availability).toBe('inapplicable');
  });

  it('close the companion-diagnostic route to a Class A or B assay', () => {
    /* A companion diagnostic is Class C or D (Annex VIII Rule 3(f)). */
    expect(cautionFor('EU_CDX_IVDR_D', { ivdrClass: 'B' })!.availability).toBe('inapplicable');
    expect(cautionFor('EU_CDX_IVDR_D', { ivdrClass: 'C' })).toBeNull();
  });

  it('close the reference-laboratory step to anything but Class D', () => {
    /* An EU reference laboratory is designated for Class D devices. */
    expect(cautionFor('EU_REF_LAB', { ivdrClass: 'C' })!.availability).toBe('inapplicable');
    expect(cautionFor('EU_REF_LAB', { ivdrClass: 'D' })).toBeNull();
  });

  it('say nothing about a device route, which is a different regulation', () => {
    expect(cautionFor('EU_MDR_CLASS_IIB', { ivdrClass: 'D' })).toBeNull();
    expect(cautionFor('US_510K_IVD', { ivdrClass: 'D' })).toBeNull();
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

  it('can fire: every RULE fires on some fact a flow can state', () => {
    /* Per-position reachability is not enough: a new rule whose positions
       another rule already marks would pass without ever running. */
    const fired = new Set(everyCaution().map(row => row.caution!.ruleId));
    const dead = cautionRuleIds().filter(id => !fired.has(id));
    expect(dead, 'a rule nothing can reach: a check that only passes').toEqual([]);
  });

  it('names the rule that marked a position, so the record says what judged it', () => {
    expect(cautionFor('US_DE_NOVO', { predicateNamed: 'K123456' })!.ruleId).toBe('de_novo_with_named_predicate');
    expect(cautionFor('US_ANDA', { modality: 'mab' })!.ruleId).toBe('biological_under_505');
    expect(new Set(cautionRuleIds()).size, 'two rules with one name').toBe(cautionRuleIds().length);
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
  /* The catalogue lists and the rules mark; this composes them exactly as the
     engine does (`withCautions` over `pathwayOptions`). */
  const marked = (facts: ProgrammeFacts) =>
    pathwayOptions({ domain: 'medical_devices', region: 'US' }).map(option => ({
      ...option,
      caution: cautionFor(option.value, facts),
    }));

  it('offers the same positions, in the same order, with and without the facts', () => {
    const facts: ProgrammeFacts = { deviceClass: 'III', predicateNamed: 'K123456' };
    const flat = pathwayOptions({ domain: 'medical_devices', region: 'US' });
    expect(marked(facts).map(o => o.value)).toEqual(flat.map(o => o.value));
    expect(marked(facts).map(o => o.label)).toEqual(flat.map(o => o.label));
    expect(marked(facts).find(o => o.value === 'US_DE_NOVO')!.caution!.availability).toBe('needs_basis');
    expect(marked({}).find(o => o.value === 'US_DE_NOVO')!.caution, 'no facts, no mark').toBeNull();
  });

  it('leaves the positions nothing speaks against unmarked', () => {
    expect(marked({ deviceClass: 'II' }).find(o => o.value === 'US_510K')!.caution).toBeNull();
    expect(marked({ deviceClass: 'II' }).find(o => o.value === 'US_PMA')!.caution!.availability).toBe('needs_basis');
  });
});
