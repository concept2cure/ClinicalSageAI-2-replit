/**
 * The class the interview's own answers decide comes from the Annex VIII
 * engine, not from a sponsor's assertion (founder's directive, 2026-10-12).
 *
 * This repository's second rule: numbers, verdicts and governed content come
 * from deterministic engines; the model narrates. A risk class is a verdict,
 * and the engine has been here all along — `EU_MDR_RULES` is Annex VIII Rules
 * 1–22, and `classifyMdr` fails closed, naming the facts it would need rather
 * than guessing a class.
 *
 * The CER interview was asking those very facts — invasiveness, active,
 * duration, contact site, incorporated medicinal substance — and asking the
 * sponsor to state the class separately, with nothing comparing the two. A
 * sponsor could answer "surgically invasive, long term" and declare Class IIa,
 * and the record would carry it without a word.
 *
 * What these tests hold:
 *   - the facts are read as the interview states them and no further;
 *   - the two mappings that would invent a regulatory claim are NOT made;
 *   - the rules' verdict is what reaches the record, with the rule named;
 *   - a declared class is never overwritten — it is the sponsor's position, and
 *     the engine's disagreement is reported instead;
 *   - where the facts do not decide, the engine's own words are what the person
 *     is told.
 */
import { describe, expect, it } from 'vitest';

import {
  annexViiiNotices,
  annexViiiReading,
  citedRules,
  mdrFactsFrom,
} from '../annex-viii-classification.js';
import { declaredMdrClass, programmeFactsFrom } from '../programme-facts.js';

/** A device the rules can place: non-invasive, not active, transient. */
const SIMPLE = { invasiveness_type: 'non_invasive', active_device: 'no', duration_of_use: 'transient' };

describe('the facts the interview states', () => {
  it('reads the invasiveness as the rules need it', () => {
    expect(mdrFactsFrom({ invasiveness_type: 'non_invasive' })).toEqual({ invasive: false });
    expect(mdrFactsFrom({ invasiveness_type: 'body_orifice' })).toEqual({ invasive: true, bodyOrificeInvasive: true });
    expect(mdrFactsFrom({ invasiveness_type: 'surgically_invasive' })).toEqual({
      invasive: true,
      surgicallyInvasive: true,
    });
    expect(mdrFactsFrom({ invasiveness_type: 'implantable' }), 'an implant is surgically invasive, Rule 8').toEqual({
      invasive: true,
      surgicallyInvasive: true,
      implantable: true,
    });
  });

  it('reads a permanent device as long term, which is what Annex VIII means by it', () => {
    /* Annex VIII Chapter I § 1.1: long term is continuous use for more than
       thirty days. The engine has three durations; a fourth would be a second
       vocabulary. */
    expect(mdrFactsFrom({ duration_of_use: 'permanent' })).toEqual({ duration: 'long_term' });
    expect(mdrFactsFrom({ duration_of_use: 'long_term' })).toEqual({ duration: 'long_term' });
    expect(mdrFactsFrom({ duration_of_use: 'short_term' })).toEqual({ duration: 'short_term' });
  });

  it('reads the implantable answer on its own, which the CER flow asks four nodes earlier', () => {
    /* `is_implantable` is a required yes_no in the CER interview's FIRST node,
       long before the invasiveness question. On its own it is enough for Rule
       8 to apply. 'No' is not mapped: not being an implant says nothing about
       whether the device is invasive at all. */
    expect(mdrFactsFrom({ is_implantable: 'yes' })).toEqual({
      invasive: true,
      surgicallyInvasive: true,
      implantable: true,
    });
    expect(mdrFactsFrom({ is_implantable: 'no' })).toBeNull();
    const reading = annexViiiReading({ is_implantable: 'yes', active_device: 'no', duration_of_use: 'permanent' })!;
    expect(reading.ruleApplied).toMatch(/Rule 8/);
    expect(reading.class).toBe('IIb');
  });

  it('reads a yes_no answer in either shape the engine may receive it', () => {
    expect(mdrFactsFrom({ active_device: 'yes' })).toEqual({ active: true });
    expect(mdrFactsFrom({ active_device: true })).toEqual({ active: true });
    expect(mdrFactsFrom({ active_device: 'no' }), 'not active is a fact, not an absence').toEqual({ active: false });
  });

  it('reads the contact site only where it IS a fact the rules hold', () => {
    expect(mdrFactsFrom({ body_contact_type: 'cns' })).toEqual({ contactsCnsOrCentralCirculation: true });
    expect(mdrFactsFrom({ body_contact_type: 'cardiovascular' })).toEqual({ contactsCnsOrCentralCirculation: true });
    /* The engine's nearest fact for these is the CLAIM a Rule 4 device makes —
       'mechanical_barrier', 'breached_dermis_secondary_intent' — not where the
       device touches. Mapping them would assert a claim nobody made. */
    for (const site of ['skin', 'mucosal', 'breached_skin', 'blood_path', 'tissue_bone']) {
      expect(mdrFactsFrom({ body_contact_type: site }), site).toBeNull();
    }
  });

  it('does not read "incorporates biological material" as the Rule 18 fact', () => {
    /* Rule 18 is non-viable human or animal tissue. Viable tissue is outside
       the MDR altogether, and the answer does not say which. */
    expect(mdrFactsFrom({ incorporates_biological_material: 'yes' })).toBeNull();
    expect(mdrFactsFrom({ incorporates_medicinal_substance: 'yes' })).toEqual({
      incorporatesMedicinalSubstance: true,
    });
  });

  it('states nothing where the interview stated nothing', () => {
    expect(mdrFactsFrom({})).toBeNull();
    expect(mdrFactsFrom({ invasiveness_type: 'something_else' })).toBeNull();
    expect(annexViiiReading({}), 'no facts, no reading').toBeNull();
  });
});

describe('the verdict', () => {
  it('is the rules’, with the rule that decided it', () => {
    const reading = annexViiiReading(SIMPLE)!;
    expect(reading.class).toBe('I');
    expect(reading.ruleApplied, 'a non-invasive device is Rule 1').toMatch(/Rule 1/);
    expect(reading.rationale.length).toBeGreaterThan(20);
  });

  it('places an implantable device where Rule 8 places it, which is not where I assumed', () => {
    /* Rule 8 puts implantable and long-term surgically invasive devices in
       Class IIb, and only the listed exceptions in III — direct contact with
       the heart, the central circulatory system or the CNS among them. This
       test asserted III until the engine corrected it, which is the whole
       argument for deriving the class rather than asserting one. */
    const plain = annexViiiReading({
      invasiveness_type: 'implantable',
      active_device: 'no',
      duration_of_use: 'permanent',
    })!;
    expect(plain.class).toBe('IIb');
    expect(plain.ruleApplied).toMatch(/Rule 8/);

    const central = annexViiiReading({
      invasiveness_type: 'implantable',
      active_device: 'no',
      duration_of_use: 'permanent',
      body_contact_type: 'cardiovascular',
    })!;
    expect(central.class, 'in direct contact with the central circulatory system').toBe('III');
    expect(central.ruleApplied).toMatch(/Rule 8/);
  });

  it('becomes the fact the routes are marked against, where none was declared', () => {
    const facts = programmeFactsFrom(SIMPLE);
    expect(facts.euMdrClass, 'the rules decide it, so the routes follow from it').toBe('I');
    expect(declaredMdrClass(SIMPLE), 'and nothing was declared').toBeNull();
  });

  it('never overwrites a class the sponsor declared', () => {
    /* The declared class is the sponsor's position. The engine disagreeing with
       it is reported, not applied. */
    const answers = { ...SIMPLE, eu_mdr_class: 'class_iib' };
    expect(programmeFactsFrom(answers).euMdrClass).toBe('IIb');
    expect(declaredMdrClass(answers)).toBe('IIb');
  });
});

describe('what the record says', () => {
  const notices = (flat: Record<string, unknown>) => annexViiiNotices('n', flat, declaredMdrClass(flat));

  it('states the class the rules reached, where the sponsor declared none', () => {
    const noted = notices(SIMPLE).find(i => i.checkId === 'annex_viii_class_stated')!;
    expect(noted).toBeDefined();
    expect(noted.severity).toBe('info');
    expect(noted.title).toMatch(/Class I$/);
    expect(noted.reference).toMatch(/Annex VIII Rule 1/);
  });

  it('names both classes and the rule where the declaration disagrees', () => {
    const noted = notices({ ...SIMPLE, eu_mdr_class: 'class_iib' }).find(
      i => i.checkId === 'annex_viii_class_mismatch',
    )!;
    expect(noted, 'a declared class that the answers contradict must not pass unrecorded').toBeDefined();
    expect(noted.severity).toBe('warning');
    expect(noted.message).toMatch(/stated Class IIb/);
    expect(noted.message).toMatch(/Class I under Annex VIII Rule 1/);
    expect(noted.triggerValues).toMatchObject({ declared: 'IIb', ruled: 'I' });
  });

  it('says nothing where the declaration and the rules agree', () => {
    const ids = notices({ ...SIMPLE, eu_mdr_class: 'class_i' }).map(i => i.checkId);
    expect(ids).not.toContain('annex_viii_class_mismatch');
    expect(ids, 'nor does it repeat a class the sponsor already stated').not.toContain('annex_viii_class_stated');
  });

  it('quotes the facts the rules would need, where they do not decide', () => {
    /* Surgically invasive with no duration: Rules 6, 7 and 8 all turn on it. */
    const noted = notices({ invasiveness_type: 'surgically_invasive' }).find(
      i => i.checkId === 'annex_viii_not_determined',
    )!;
    expect(noted).toBeDefined();
    expect(noted.message, 'the engine’s own list is the useful part').toMatch(/cannot be determined without/);
    expect((noted.triggerValues.missingFacts as string[]).length).toBeGreaterThan(0);
  });

  it('says nothing at all to a programme that stated no classification facts', () => {
    expect(notices({ eu_mdr_class: 'class_iia' }), 'otherwise every device interview carries a notice').toEqual([]);
    expect(notices({})).toEqual([]);
  });

  it('reads the rule a sponsor cited, and says when it is not the one that decides', () => {
    expect(citedRules({ classification_rule: 'Annex VIII Rule 7 and Rule 9' })).toEqual([7, 9]);
    expect(citedRules({ classification_rule: 'no rules here' })).toEqual([]);
    expect(citedRules({ classification_rule: 'Rule 99' }), 'there are 22 rules').toEqual([]);
    const noted = notices({ ...SIMPLE, classification_rule: 'Classified under Annex VIII Rule 7' }).find(
      i => i.checkId === 'annex_viii_rule_not_cited',
    )!;
    expect(noted).toBeDefined();
    expect(noted.message).toMatch(/You cited Rule 7/);
    expect(noted.message).toMatch(/is Rule 1/);
  });

  it('says nothing about the citation when it includes the rule that decides', () => {
    const ids = notices({ ...SIMPLE, classification_rule: 'Rule 1 (non-invasive)' }).map(i => i.checkId);
    expect(ids).not.toContain('annex_viii_rule_not_cited');
  });
});
