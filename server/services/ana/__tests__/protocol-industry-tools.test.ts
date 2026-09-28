/**
 * AnA protocol industry-gap tools — `docs/design/PROTOCOL_INDUSTRY_GAPS.md`
 * Tier 1, reached conversationally.
 *
 * What this suite holds, beyond registration:
 *
 *  - **Every one of the eleven is registered and has a handler.** A definition
 *    the model can see with no handler behind it is offered and then fails;
 *    a handler with no definition is unreachable. Both halves, or neither.
 *  - **Every description names its engine as the source of its output**, and
 *    says the output is reported verbatim — asserted over the whole array, so
 *    a twelfth tool cannot be added without it (CLAUDE.md Rule 2: a tool that
 *    asks a model for a figure is a defect).
 *  - **The honesty phrases the design doc requires are in the prose**, because
 *    the description is the only thing that steers the model: `unverified`
 *    stays unverified on the USDM export; `unstated` is not `site` on the DCT
 *    profile; `not_assessable` is not `missing` on SPIRIT; a null share is not
 *    0% on deviation trends; the CtQ ratings are default seeds.
 *  - **None of the eleven carries a reason-for-change property.** They are all
 *    read-only; a reason field would imply a governed write that never happens.
 *
 * RED-FIRST EVIDENCE: written before the engines' handlers were registered,
 * and observed failing on `getToolHandler(...)` for every tool, then green as
 * each handler landed.
 */
import { describe, expect, it } from 'vitest';

import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor';
import { PROTOCOL_INDUSTRY_TOOLS } from '../protocol-industry-tool-defs';
import { toolAuthorizationOf } from '../tool-authorization';

const NAMES = [
  'review_trial_schema',
  'review_spirit_conformance',
  'derive_ctq_factors',
  'export_usdm_projection',
  'review_dct_profile',
  'review_who_ictrp_record',
  'review_deviation_trends',
  'review_protocol_redline',
  'review_dose_escalation_design',
  'review_enrollment_forecast',
  'review_interim_operating_characteristics',
];

const ENGINE_NAMES: Record<string, RegExp> = {
  review_trial_schema: /projectTrialSchema/,
  review_spirit_conformance: /assessSpiritConformance/,
  derive_ctq_factors: /deriveCtqFactors/,
  export_usdm_projection: /projectUsdm/,
  review_dct_profile: /profileDecentralization/,
  review_who_ictrp_record: /projectWhoIctrp/,
  review_deviation_trends: /trendDeviations/,
  review_protocol_redline: /redlineVersions/,
  review_dose_escalation_design: /projectDoseEscalation/,
  review_enrollment_forecast: /projectEnrollment/,
  review_interim_operating_characteristics: /projectInterimOperatingCharacteristics/,
};

describe('PROTOCOL_INDUSTRY_TOOLS — registration', () => {
  it('exposes exactly the eleven, once each, with unique names', () => {
    expect(PROTOCOL_INDUSTRY_TOOLS.map((t) => t.name)).toEqual(NAMES);
    expect(new Set(PROTOCOL_INDUSTRY_TOOLS.map((t) => t.name)).size).toBe(NAMES.length);
  });

  it('every one is in the enabled tool list the model sees', () => {
    for (const name of NAMES) {
      expect(ALL_ANA_TOOLS.some((t) => t.name === name), `${name} in ALL_ANA_TOOLS`).toBe(true);
    }
  });

  it('every one has a handler registered', () => {
    for (const name of NAMES) {
      expect(getToolHandler(name), `${name} handler registered`).toBeTypeOf('function');
    }
  });

  it('every one is classified READ in the authorization register, so the gate runs it rather than holding it', () => {
    // An unregistered tool is `confirm, unclassified` and every call is held for
    // a human — a read-only tool that can never run. The description saying
    // READ-ONLY is not the gate; the register is.
    for (const name of NAMES) {
      expect(toolAuthorizationOf(name, {}), `${name} authorization`).toEqual({ class: 'read' });
    }
  });
});

describe('PROTOCOL_INDUSTRY_TOOLS — the description steers the model', () => {
  it('every description is read-only, names its engine, and says the output is reported verbatim', () => {
    for (const t of PROTOCOL_INDUSTRY_TOOLS) {
      expect(t.description, `${t.name} read-only`).toMatch(/^READ-ONLY\./);
      expect(t.description, `${t.name} names its engine`).toMatch(ENGINE_NAMES[t.name]);
      expect(t.description, `${t.name} verbatim`).toMatch(/verbatim/i);
    }
  });

  it('carries the honesty phrases the design document requires', () => {
    const by = Object.fromEntries(PROTOCOL_INDUSTRY_TOOLS.map((t) => [t.name, t.description]));
    expect(by.export_usdm_projection).toMatch(/CONFORMANCE IS UNVERIFIED/);
    expect(by.export_usdm_projection).toMatch(/never call the export "valid"/);
    expect(by.review_dct_profile).toMatch(/"unstated"/);
    expect(by.review_dct_profile).toMatch(/never as 0%/);
    expect(by.review_spirit_conformance).toMatch(/NOT_ASSESSABLE .* not missing and it is not met/);
    expect(by.review_deviation_trends).toMatch(/never "0%"/);
    expect(by.review_deviation_trends).toMatch(/no site linkage/);
    expect(by.derive_ctq_factors).toMatch(/DEFAULT SEED/);
    expect(by.review_who_ictrp_record).toMatch(/not carried by the study design; supplied at registration/);
    expect(by.review_trial_schema).toMatch(/never invent an epoch/);
    expect(by.review_dose_escalation_design).toMatch(/"engine default" was NOT chosen by the sponsor/);
    expect(by.review_enrollment_forecast).toMatch(/never supply or assume a rate/);
    expect(by.review_interim_operating_characteristics).toMatch(/never quietly substitute the solved value/);
  });

  it('none carries a reason-for-change: all eleven are read-only', () => {
    for (const t of PROTOCOL_INDUSTRY_TOOLS) {
      const props = Object.keys((t.input_schema as { properties: Record<string, unknown> }).properties);
      expect(props, `${t.name} properties`).not.toContain('reason');
    }
  });

  it('every one requires document_id and the redline requires both version labels', () => {
    for (const t of PROTOCOL_INDUSTRY_TOOLS) {
      const required = (t.input_schema as { required: string[] }).required;
      expect(required, `${t.name} required`).toContain('document_id');
    }
    const redline = PROTOCOL_INDUSTRY_TOOLS.find((t) => t.name === 'review_protocol_redline')!;
    expect((redline.input_schema as { required: string[] }).required).toEqual(['document_id', 'from_version', 'to_version']);
  });
});
