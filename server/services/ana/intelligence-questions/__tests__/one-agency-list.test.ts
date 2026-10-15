/**
 * Every question that asks which regulator a programme files with offers the
 * SAME twelve agencies (2026-10-12 review, "three uncanonical region lists").
 *
 * `project_setup` asks it from `shared/regulatory/agency-positions.ts` — the
 * twelve agencies the platform configures, derived from the two governed rows
 * (REGION_PROFILES and REGION_IDENTITY) so a region the platform gains or
 * loses capability for cannot keep saying the old thing.
 *
 * The stability interview asked it from a hand-written list of six, with its
 * own lowercase ids. The ids happened to resolve — `canonicalRegionOf` is
 * tolerant of an agency name — so nothing was silently misread; what was
 * missing was the other six. A stability programme filing with the MHRA, the
 * NMPA, Swissmedic, the CDSCO, the MFDS or the HSA could not say so, though
 * the platform holds every one of their Module 1 requirements, and the escape
 * hatch would have taken the answer as prose.
 */
import { describe, expect, it } from 'vitest';

import { agencyOptions } from '@shared/regulatory/agency-positions';
import type { FlowEngineContext, QuestionField } from '../types.js';
import { getAvailableFlows, getFlowDefinition } from '../flows/index.js';
import { AGENCY_FIELDS, DECLARED_NON_FACTS, programmeFactsFrom } from '../programme-facts.js';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null };

/** Every field of every registered flow that ASKS about a regulator. */
const agencyFields = (): Array<{ flow: string; node: string; field: QuestionField }> => {
  const out: Array<{ flow: string; node: string; field: QuestionField }> = [];
  for (const listed of getAvailableFlows(CTX)) {
    for (const node of getFlowDefinition(listed.category, CTX)?.nodes ?? []) {
      for (const field of node.fields) {
        if (!AGENCY_FIELDS.includes(field.id)) continue;
        out.push({ flow: listed.category, node: node.id, field });
      }
    }
  }
  return out;
};

describe('the questions that ask which regulator', () => {
  it('are asked by more than one flow, so this is worth checking', () => {
    const flows = new Set(agencyFields().map(f => f.flow));
    expect(flows.size).toBeGreaterThan(1);
  });

  it('offer the twelve the platform configures, and never a shorter list of its own', () => {
    const governed = new Set(agencyOptions().map(o => o.value));
    expect(governed.size, 'the twelve, from the governed rows').toBe(12);
    const short: string[] = [];
    for (const { flow, node, field } of agencyFields()) {
      if (!field.options?.length) continue;
      const offered = new Set(field.options.map(o => o.value));
      const missing = [...governed].filter(v => !offered.has(v));
      if (missing.length > 0) short.push(`${flow}.${node}.${field.id} omits ${missing.join(', ')}`);
    }
    expect(short, 'an agency question offering fewer agencies than the platform holds').toEqual([]);
  });

  it('offer nothing beyond them that is not declared a non-region, with its reason', () => {
    const governed = new Set(agencyOptions().map(o => o.value));
    const undeclared: string[] = [];
    for (const { flow, node, field } of agencyFields()) {
      for (const option of field.options ?? []) {
        if (governed.has(option.value)) continue;
        const reason = DECLARED_NON_FACTS[field.id]?.[option.value];
        if (reason && reason.trim().length > 30) continue;
        undeclared.push(`${flow}.${node}.${field.id} offers "${option.value}"`);
      }
    }
    expect(undeclared, 'an option that is neither an agency nor a declared non-region').toEqual([]);
  });

  it('says in the option itself where a target is not a national filing', () => {
    /* ASEAN is a dossier FORMAT several authorities accept; WHO
       prequalification is a UN procurement assessment. A person must not have
       to infer that picking one names no regulator. */
    const stability = agencyFields().find(f => f.flow === 'stability_study')!;
    const by = (value: string) => stability.field.options!.find(o => o.value === value)!;
    expect(by('asean').label).toMatch(/not one authority/);
    expect(by('who_pq').label).toMatch(/not a national filing/);
  });
});

describe('what the record learns from the answer', () => {
  it('reads the stability interview’s authorities as regions, which it did not before', () => {
    expect(programmeFactsFrom({ zone_regulatory_authorities: ['US', 'JP'] }).regions).toEqual(['US', 'JP']);
  });

  it('still reads the answers already stored under the old ids', () => {
    /* The option values are the canonical region codes now; a session answered
       before this change holds 'fda' and 'health_canada', and
       `canonicalRegionOf` is tolerant of an agency name for exactly that
       reason. A migration of stored answers would be the alternative, and this
       is the cheaper honest one. */
    expect(programmeFactsFrom({ zone_regulatory_authorities: ['fda', 'health_canada'] }).regions).toEqual([
      'US',
      'CA',
    ]);
  });

  it('learns no region from a target that is not one', () => {
    expect(programmeFactsFrom({ zone_regulatory_authorities: ['asean', 'who_pq'] }).regions).toBeUndefined();
  });
});
