/**
 * The IBC/IACUC tool definitions say what their handlers do (2026-10-15).
 *
 * create_ibc_registration still listed biosafety_level as required, and told
 * AnA to omit only the section and gene-transfer answers, although the handler
 * records an unstated containment level and recombinant-DNA answer as not
 * recorded: AnA had to supply a level nobody declared. review_iacuc_protocol
 * and review_ibc_registration did not say the expiry they report is the date on
 * record, else one computed from the approval date and labelled 'computed'
 * (expirationSource 'recorded' | 'computed' | 'none').
 */
import { describe, it, expect } from 'vitest';
import { CREATE_IBC_REGISTRATION, REVIEW_IACUC_PROTOCOL, REVIEW_IBC_REGISTRATION } from '../notifications-study-memory-tool-defs';

// The provider trims tool descriptions here (server/services/ai-gateway/gateway.ts, not exported).
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

describe('create_ibc_registration', () => {
  it('requires only the registration number and title', () => {
    expect(CREATE_IBC_REGISTRATION.input_schema.required).toEqual(['registration_number', 'title']);
  });

  it('tells AnA to omit the containment level and each answer the user has not stated', () => {
    const omit = /Omit ([^.:]*) unless the user has stated them: omitted is recorded as not recorded/.exec(CREATE_IBC_REGISTRATION.description);
    expect(omit?.[1]).toBeDefined();
    for (const field of ['biosafety_level', 'involves_recombinant_dna', 'nih_guidelines_section', 'involves_human_gene_transfer']) {
      expect(omit?.[1], field).toContain(field);
    }
  });
});

describe.each([
  ['review_iacuc_protocol', REVIEW_IACUC_PROTOCOL, 'reviewStatus', 'approval + 3 years'],
  ['review_ibc_registration', REVIEW_IBC_REGISTRATION, 'expiration', 'approval + 1 year'],
])('%s', (_name, tool, field, computedAs) => {
  it("says the expiry is the date on record, else a computed one labelled 'computed'", () => {
    expect(tool.description).toContain(`expiration date on record (${field}.expirationSource 'recorded'), else ${computedAs}, labelled 'computed'`);
    expect(tool.description).toMatch(/with neither date it is undetermined \('none'\)/);
  });
});

describe('the three descriptions', () => {
  it('fit under the provider description trim', () => {
    for (const t of [CREATE_IBC_REGISTRATION, REVIEW_IACUC_PROTOCOL, REVIEW_IBC_REGISTRATION]) {
      expect(t.description.length, t.name).toBeLessThan(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    }
  });
});
