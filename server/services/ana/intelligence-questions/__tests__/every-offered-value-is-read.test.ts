/**
 * Every value a question OFFERS for a fact field is a value the engine READS
 * (founder's directive, 2026-10-12).
 *
 * ── The gate that was only half there ───────────────────────────────────────
 * `cautioned-positions.test.ts` holds that every field the fact reader names is
 * still a field some flow asks — so a renamed field cannot leave the rules
 * firing on nothing. It says nothing about the VALUES. Two flows had therefore
 * drifted out of the reader's vocabulary without a test noticing:
 *
 *   - `cer-report` offers the full seven MDR classes, including
 *     `class_is` / `class_im` / `class_ir`. The reader knew four. A sterile
 *     Class I programme stated no class at all, so every route caution that
 *     reads the MDR class went unmarked for it.
 *   - `device-pma` offers `class_ii_pma` — "Class II (transitional — PMA
 *     required)". The reader knew `class_ii`, not this. A PMA programme that
 *     picked it stated no class either.
 *
 * Both are the same failure as an unanswered question, and that is exactly why
 * they were invisible: the reader's honest rule is that an unknown value states
 * nothing, which makes a silent miss indistinguishable from a deliberate
 * non-answer. The difference has to be WRITTEN DOWN, which is what
 * `DECLARED_NON_FACTS` is, and checked, which is what this file is.
 */
import { describe, expect, it } from 'vitest';

import type { FlowEngineContext, QuestionField } from '../types.js';
import { mdrFactsFrom } from '../annex-viii-classification.js';
import { DECLARED_NON_FACTS, factFields, programmeFactsFrom } from '../programme-facts.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };

/** Every field of every registered flow, with the flow it came from. */
const everyField = async (): Promise<Array<{ flow: string; node: string; field: QuestionField }>> => {
  const { getAvailableFlows, getFlowDefinition } = await import('../flows/index.js');
  const { withGovernedOptions } = await import('../governed-options.js');
  const out: Array<{ flow: string; node: string; field: QuestionField }> = [];
  for (const listed of getAvailableFlows(CTX)) {
    for (const node of getFlowDefinition(listed.category, CTX)?.nodes ?? []) {
      for (const field of node.fields) {
        /* A field whose positions come from a catalogue carries no static
           options, so scanning the flow definition alone skipped every one of
           them — including `ivdr_class`, which this gate was extended to cover
           in the same batch that made it unscannable (2026-10-12 review). The
           catalogue is resolved here, for each region it holds, so the values
           a person is actually offered are the values scanned. */
        if (!field.optionsFrom) {
          out.push({ flow: listed.category, node: node.id, field });
          continue;
        }
        for (const region of ['US', 'EU'] as const) {
          const [resolved] = withGovernedOptions([field], {
            facts: { primaryRegion: region },
            answers: { product_type: 'medical_device' },
            ctx: CTX,
          });
          out.push({ flow: listed.category, node: `${node.id}(${region})`, field: resolved });
        }
      }
    }
  }
  return out;
};

/**
 * Whether SOME reader takes this value. Two do: the fact reader, and the
 * Annex VIII fact bridge — whose values reach the rule engine rather than a
 * fact of their own, so a classification fact can be read without deciding a
 * class on its own.
 */
const isRead = (fieldId: string, value: string): boolean =>
  Object.keys(programmeFactsFrom({ [fieldId]: value })).length > 0 || mdrFactsFrom({ [fieldId]: value }) !== null;

describe('every value a fact field offers', () => {
  it('is either read as a fact or declared a non-fact, with a reason', async () => {
    const fact = new Set(factFields());
    const unread: string[] = [];
    let checked = 0;
    for (const { flow, node, field } of await everyField()) {
      if (!fact.has(field.id) || !field.options?.length) continue;
      for (const option of field.options) {
        checked += 1;
        if (isRead(field.id, option.value)) continue;
        const reason = DECLARED_NON_FACTS[field.id]?.[option.value];
        if (reason && reason.trim().length > 20) continue;
        unread.push(`${flow}.${node}.${field.id} offers "${option.value}" (${option.label}) — read as nothing`);
      }
    }
    expect(checked, 'a scan that checked no option proves nothing').toBeGreaterThan(20);
    expect(unread, 'a value a question offers and the engine does not read').toEqual([]);
  });

  it('declares a non-fact only where a flow actually offers it', async () => {
    /* The list may only shrink by a value disappearing from the flows — an
       entry for a value nobody offers is a stale exception, which is how a
       baseline becomes a place to hide. */
    const offered = new Map<string, Set<string>>();
    for (const { field } of await everyField()) {
      if (!field.options?.length) continue;
      const set = offered.get(field.id) ?? new Set<string>();
      for (const option of field.options) set.add(option.value);
      offered.set(field.id, set);
    }
    const stale: string[] = [];
    for (const [fieldId, values] of Object.entries(DECLARED_NON_FACTS)) {
      for (const value of Object.keys(values)) {
        if (!offered.get(fieldId)?.has(value)) stale.push(`${fieldId}."${value}"`);
      }
    }
    expect(stale, 'a declared non-fact for a value no question offers').toEqual([]);
  });
});

describe('a question whose positions come from a catalogue', () => {
  it('is scanned, with the values a person is actually offered', async () => {
    /* The IVDR classes are a catalogue's values, not a flow's. Before the
       review this gate skipped every such field, so the one fact field the
       same batch added was the one it could not see. */
    const fields = await everyField();
    const ivdr = fields.filter(f => f.field.id === 'ivdr_class');
    expect(ivdr.length, 'resolved once per region the catalogue holds').toBeGreaterThan(0);
    const values = new Set(ivdr.flatMap(f => (f.field.options ?? []).map(o => o.value)));
    expect([...values].sort(), 'the four IVDR classes').toEqual(['A', 'B', 'C', 'D']);
    const routes = fields.filter(f => f.field.id === 'device_submission_pathway');
    const routeValues = new Set(routes.flatMap(f => (f.field.options ?? []).map(o => o.value)));
    expect(routeValues.has('US_510K'), 'and the device routes, per region').toBe(true);
    expect(routeValues.has('EU_MDR_CLASS_III')).toBe(true);
  });
});

describe('the two values that had drifted', () => {
  it('reads the sterile, measuring and reusable Class I devices as Class I', async () => {
    /* They are Class I under the MDR; the notified body is involved for that
       one aspect (Art 52(7)), which is what the Class I route position says. */
    for (const value of ['class_is', 'class_im', 'class_ir']) {
      expect(programmeFactsFrom({ eu_mdr_class: value }), value).toEqual({ euMdrClass: 'I' });
    }
    const { cautionFor } = await import('@shared/regulatory/pathway-cautions');
    const caution = cautionFor('EU_MDR_CLASS_IIB', programmeFactsFrom({ eu_mdr_class: 'class_is' }))!;
    expect(caution.availability, 'a sterile Class I programme marked no route at all before').toBe('inapplicable');
    expect(cautionFor('EU_MDR_CLASS_I', programmeFactsFrom({ eu_mdr_class: 'class_ir' }))).toBeNull();
  });

  /* 2026-10-22 (D2 knowledge audit): this read the transitional device as
     Class II and cautioned its PMA. A transitional device is Class III by
     FD&C Act section 520(l), so its PMA is the expected route. */
  it('reads the transitional device as Class III, so its PMA carries no caution', async () => {
    expect(programmeFactsFrom({ device_class: 'class_ii_pma' })).toEqual({ deviceClass: 'III' });
    const { cautionFor } = await import('@shared/regulatory/pathway-cautions');
    expect(cautionFor('US_PMA', programmeFactsFrom({ device_class: 'class_ii_pma' }))).toBeNull();
    const ii = cautionFor('US_PMA', programmeFactsFrom({ device_class: 'class_ii' }))!;
    expect(ii.availability).toBe('needs_basis');
    expect(ii.reason).toMatch(/520\(l\)/);
    expect(ii.reason).not.toMatch(/reclassified into Class II, for which FDA has called/);
  });

  it('reads an answer that states a statute and no modality', async () => {
    /* "Biologic (BLA)" and "Prescription Drug (NDA)" name which statute
       governs the product without naming a modality. The frame has no view of
       "a biologic", but the statute is what decides whether a 505 route or a
       licence is open — so reading it is worth more than reading nothing. */
    expect(programmeFactsFrom({ product_type: 'biologic' })).toEqual({ statute: 'biologic' });
    expect(programmeFactsFrom({ product_type: 'other_biologic' })).toEqual({ statute: 'biologic' });
    expect(programmeFactsFrom({ product_type: 'rx_drug' })).toEqual({ statute: 'chemical' });
    const { cautionFor } = await import('@shared/regulatory/pathway-cautions');
    const anda = cautionFor('US_ANDA', programmeFactsFrom({ product_type: 'biologic' }))!;
    expect(anda.availability).toBe('inapplicable');
    expect(anda.reason, 'with no modality the reason names the statute instead').toMatch(/a biological product/);
    expect(cautionFor('US_351K', programmeFactsFrom({ product_type: 'rx_drug' }))!.reason).toMatch(/section 505/);
  });

  it('prefers the modality where the answer names one', () => {
    /* A modality always implies its statute, so the statute is read only when
       there is no modality — otherwise the two could disagree on the record. */
    expect(programmeFactsFrom({ product_type: 'biosimilar' })).toEqual({ modality: 'biosimilar' });
  });

  it('reads a stage of material as no product at all', () => {
    /* The stability interview asks whether the material under study is the
       substance, the product or an intermediate. None of them states what the
       product IS. */
    for (const value of ['drug_substance', 'drug_product', 'intermediate']) {
      expect(programmeFactsFrom({ product_type: value }), value).toEqual({});
    }
  });

  it('reads the class asked under the second field id, which two flows use', () => {
    expect(programmeFactsFrom({ device_classification: 'class_iii' })).toEqual({ deviceClass: 'III' });
    expect(programmeFactsFrom({ device_classification: 'ivd' }), 'a product kind is not a class').toEqual({});
  });
});
