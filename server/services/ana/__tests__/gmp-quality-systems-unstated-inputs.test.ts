/**
 * S5c: the GMP quality-systems worksheets decide no criticality, method, field
 * alert, stringency, sterilisation approach or Part 11 control from a fact
 * nobody stated. An omitted fact reads as not_stated, what it decides as
 * not_assessed, undetermined or null, and a required or malformed input is
 * refused by name. Before this, omitted impact facts made data "medium pending
 * confirmation", an unstated ALCOA+ control counted as satisfied in the overall
 * risk, an omitted step was assessed as starting-material production, an
 * omitted heat stability chose aseptic processing, an omitted
 * usMarketed or electronicRecords read as true, and a GxP impact only
 * inferred from direct impact picked the assurance approach.
 */
import { describe, expect, it } from 'vitest';
import {
  assessDataIntegrity, designCAPA, classifyGMPDeviation, assessAPIGMP, designSterileControls,
  assessComputerSystemValidation,
} from '../../gmp-quality-systems/gmp-quality-systems-knowledge';
import { getToolHandler } from '../AnaToolExecutor';
import { GMP_QUALITY_SYSTEMS_TOOLS } from '../gmpQualitySystemsTools';

const CONTROL_KEYS = [
  'uniqueUserAttribution', 'legibleAndPermanent', 'contemporaneousEntry', 'originalOrTrueCopyRetained', 'accuracyControls',
  'completeWithMetadata', 'consistentAndSequenced', 'enduringMedia', 'readilyAvailable', 'auditTrailEnabled', 'auditTrailReviewed',
] as const;
const allControls = Object.fromEntries(CONTROL_KEYS.map(k => [k, true]));
const integrity = {
  dataDescription: 'HPLC assay results for batch release', recordFormat: 'electronic', recordType: 'dynamic',
  impactsBatchRelease: true, impactsPatientSafety: false, controls: allControls,
} satisfies Parameters<typeof assessDataIntegrity>[0];
const capa = {
  problemDescription: 'Balance calibration overdue', source: 'audit_finding', severity: 'low', recurring: false,
  contributingFactorCount: 1, systemic: false, productImpact: false,
} satisfies Parameters<typeof designCAPA>[0];
const deviation = {
  description: 'Assay result above the upper limit', area: 'specification_failure', batchDistributed: true, sterileProduct: false,
  outOfSpecConfirmed: true, patientSafetyImpact: false, recurring: false, usMarketed: true,
} satisfies Parameters<typeof classifyGMPDeviation>[0];
const api = {
  step: 'intermediate_production', isCriticalStep: false, sterileApi: false, changeIsSignificant: false,
} satisfies Parameters<typeof assessAPIGMP>[0];
const sterile = {
  productDescription: 'Monoclonal antibody solution in vials', heatStable: false, filterable: true, lyophilised: false,
} satisfies Parameters<typeof designSterileControls>[0];
const csv = {
  systemDescription: 'LIMS', softwareType: 'configured', gxpImpact: 'high', electronicRecords: true,
  electronicSignatures: true, directImpact: true, supplierAssessed: true,
} satisfies Parameters<typeof assessComputerSystemValidation>[0];

const families = [
  { tool: 'assess_data_integrity', compute: assessDataIntegrity, input: integrity, flags: ['impactsBatchRelease', 'impactsPatientSafety'] },
  { tool: 'design_capa', compute: designCAPA, input: capa, flags: ['recurring', 'systemic', 'productImpact'] },
  { tool: 'classify_gmp_deviation', compute: classifyGMPDeviation, input: deviation,
    flags: ['batchDistributed', 'sterileProduct', 'outOfSpecConfirmed', 'patientSafetyImpact', 'recurring', 'usMarketed'] },
  { tool: 'assess_api_gmp', compute: assessAPIGMP, input: api, flags: ['isCriticalStep', 'sterileApi', 'changeIsSignificant'] },
  { tool: 'design_sterile_controls', compute: designSterileControls, input: sterile, flags: ['heatStable', 'filterable', 'lyophilised'] },
  { tool: 'assess_computer_system_validation', compute: assessComputerSystemValidation, input: csv,
    flags: ['electronicRecords', 'electronicSignatures', 'directImpact', 'supplierAssessed'] },
];

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101, userId: 7 } as never));
}

function properties(tool: string) {
  return GMP_QUALITY_SYSTEMS_TOOLS.find(t => t.name === tool)!.input_schema.properties as
    Record<string, { description: string; properties?: Record<string, { description: string }> }>;
}

describe('the six GMP quality-systems tools compute from stated facts', () => {
  it.each(families)('$tool reaches its engine with a stated basis', async ({ tool, input }) => {
    expect(await run(tool, input)).toMatchObject({
      status: 'computed', engine: 'deterministic', basis: 'stated', appliesTo: 'the inputs stated in this conversation',
    });
  });
});

describe.each(families)('$tool keeps each boolean answer as stated', ({ tool, compute, input, flags }) => {
  it.each(flags)('%s reads not_stated when omitted or null, and is refused when malformed', async field => {
    for (const absent of [undefined, null]) {
      expect(compute(changed(input, { [field]: absent }))).toMatchObject({ inputStates: { [field]: 'not_stated' } });
    }
    for (const answer of [true, false]) {
      expect(compute(changed(input, { [field]: answer }))).toMatchObject({ inputStates: { [field]: answer } });
    }
    for (const value of ['false', 0, 1]) {
      const out = await run(tool, changed(input, { [field]: value }));
      expect(out).toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field });
      expect(out).not.toHaveProperty('basis');
    }
  });
});

describe('assess_data_integrity keeps each ALCOA+ and audit-trail control as stated', () => {
  it.each(CONTROL_KEYS)('controls.%s reads not_stated when omitted or null, and is refused when malformed', async key => {
    for (const absent of [undefined, null]) {
      expect(assessDataIntegrity(changed(integrity, { controls: { ...allControls, [key]: absent } }))).toMatchObject({
        inputStates: { [`controls.${key}`]: 'not_stated' }, overallDataIntegrityRisk: 'not_assessed',
      });
    }
    expect(await run('assess_data_integrity', changed(integrity, { controls: { ...allControls, [key]: 'yes' } })))
      .toMatchObject({ status: 'needs_parameters', code: 'invalid_input', field: `controls.${key}` });
  });
});

describe('the six definitions say what an omitted fact means', () => {
  it.each(families)('$tool describes each flag when omitted, and claims no default', ({ tool, flags }) => {
    const props = properties(tool);
    for (const field of flags) {
      expect(props[field].description, field).toMatch(/omitted/i);
      expect(props[field].description, field).not.toMatch(/\(default|defaults to/i);
    }
  });
  it('says an omitted ALCOA+ control is never assumed satisfied, and names the inputs that are not read', () => {
    expect(properties('assess_data_integrity').controls.description).toMatch(/omitted or null field is "unknown"/);
    expect(properties('assess_data_integrity').gxpArea.description).toMatch(/Not read/);
    expect(properties('classify_gmp_deviation').batchesAffected.description).toMatch(/Not read/);
    expect(properties('design_sterile_controls').fillingLines.description).toMatch(/Not read/);
    expect(properties('design_sterile_controls').operatorCount.description).toMatch(/Not read/);
  });
});

describe('a required or malformed input is refused by name, never defaulted', () => {
  it.each([
    { tool: 'assess_data_integrity', input: integrity, field: 'dataDescription', value: undefined, code: 'missing_input' },
    { tool: 'assess_data_integrity', input: integrity, field: 'recordFormat', value: 'Electronic', code: 'invalid_input' },
    { tool: 'assess_data_integrity', input: integrity, field: 'recordType', value: 'Dynamic', code: 'invalid_input' },
    { tool: 'assess_data_integrity', input: integrity, field: 'lifecycleStages', value: ['Generation'], code: 'invalid_input' },
    { tool: 'assess_data_integrity', input: integrity, field: 'lifecycleStages', value: 'review', code: 'invalid_input' },
    { tool: 'assess_data_integrity', input: integrity, field: 'controls', value: 'all in place', code: 'invalid_input' },
    { tool: 'design_capa', input: capa, field: 'problemDescription', value: '  ', code: 'invalid_input' },
    { tool: 'design_capa', input: capa, field: 'source', value: undefined, code: 'missing_input' },
    { tool: 'design_capa', input: capa, field: 'severity', value: 'High', code: 'invalid_input' },
    { tool: 'design_capa', input: capa, field: 'preferredRootCauseMethod', value: 'FMEA', code: 'invalid_input' },
    { tool: 'design_capa', input: capa, field: 'contributingFactorCount', value: '3', code: 'invalid_input' },
    { tool: 'design_capa', input: capa, field: 'contributingFactorCount', value: 2.5, code: 'invalid_input' },
    { tool: 'classify_gmp_deviation', input: deviation, field: 'description', value: undefined, code: 'missing_input' },
    { tool: 'assess_api_gmp', input: api, field: 'step', value: undefined, code: 'missing_input' },
    { tool: 'assess_api_gmp', input: api, field: 'step', value: 'final', code: 'invalid_input' },
    { tool: 'design_sterile_controls', input: sterile, field: 'productDescription', value: undefined, code: 'missing_input' },
    { tool: 'design_sterile_controls', input: sterile, field: 'barrier', value: 'Isolator', code: 'invalid_input' },
    { tool: 'assess_computer_system_validation', input: csv, field: 'systemDescription', value: undefined, code: 'missing_input' },
    { tool: 'assess_computer_system_validation', input: csv, field: 'gxpImpact', value: 'High', code: 'invalid_input' },
  ])('$tool refuses $field = $value', async ({ tool, input, field, value, code }) => {
    const out = await run(tool, changed(input, { [field]: value }));
    expect(out).toMatchObject({ status: 'needs_parameters', code, field });
    expect(out.message).toContain(field);
  });
});

describe('assess_data_integrity rates nothing an unstated fact could change', () => {
  it('leaves criticality, review frequency and the overall risk not assessed when no impact is stated', () => {
    const out = assessDataIntegrity(changed(integrity, { impactsBatchRelease: undefined, impactsPatientSafety: undefined }));
    expect(out).toMatchObject({ dataCriticality: 'not_assessed', overallDataIntegrityRisk: 'not_assessed',
      overallRiskRange: { min: 'medium', max: 'critical' } });
    expect(out.criticalityRationale).not.toMatch(/pending confirmation/);
    expect(out.auditTrail.reviewFrequency).toMatch(/^Not assessed/);
    expect(out.lifecycleRisks.find(r => r.stage === 'generation')?.inherentRisk).toBe('not_assessed');
  });
  it('keeps what a stated fact settles alone', () => {
    const release = assessDataIntegrity(changed(integrity, { impactsPatientSafety: undefined }));
    expect(release.dataCriticality).toBe('not_assessed');
    expect(release.auditTrail.reviewFrequency).toMatch(/^With each record/);
    expect(assessDataIntegrity(changed(integrity, { impactsPatientSafety: true, impactsBatchRelease: undefined })))
      .toMatchObject({ dataCriticality: 'critical', overallDataIntegrityRisk: 'critical' });
  });
  it('rates stated facts as before', () => {
    expect(assessDataIntegrity(integrity)).toMatchObject({ dataCriticality: 'high', overallDataIntegrityRisk: 'high' });
    expect(assessDataIntegrity(changed(integrity, { impactsBatchRelease: false })))
      .toMatchObject({ dataCriticality: 'medium', overallDataIntegrityRisk: 'medium' });
  });
  it('does not count an unstated control as satisfied in the overall risk', () => {
    const out = assessDataIntegrity(changed(integrity, { controls: { ...allControls, accuracyControls: undefined } }));
    expect(out).toMatchObject({ overallDataIntegrityRisk: 'not_assessed', overallRiskRange: { min: 'high', max: 'critical' } });
    expect(out.alcoaFindings.find(f => f.attribute === 'accurate')?.satisfied).toBe('unknown');
  });
  it('asks about an audit-trail review nobody stated instead of advising remediation', () => {
    const out = assessDataIntegrity(changed(integrity, { controls: { ...allControls, auditTrailReviewed: undefined } }));
    const advice = out.recommendations.map(r => r.recommendation).join(' ');
    expect(advice).toMatch(/Confirm whether the audit trail is enabled and reviewed/);
    expect(advice).not.toMatch(/Enable and routinely review/);
  });
  it('does not assume an electronic record is dynamic', () => {
    expect(assessDataIntegrity(changed(integrity, { recordType: undefined })).recordType).toBe('not_stated');
  });
});

describe('design_capa picks no method or timeline from an omitted fact', () => {
  it('leaves the method undetermined when an omitted fact could change it', () => {
    for (const omit of ['systemic', 'recurring', 'contributingFactorCount']) {
      const out = designCAPA(changed(capa, { [omit]: undefined }));
      expect(out.rootCause, omit).toMatchObject({ method: 'undetermined', steps: [] });
      expect(out.alternativeRootCauseMethods, omit).toHaveLength(5);
    }
    expect(designCAPA(changed(capa, { source: 'oos', severity: undefined })).rootCause.method).toBe('undetermined');
  });
  it('keeps a method the omitted facts cannot change, and the stated ones', () => {
    expect(designCAPA(capa).rootCause.method).toBe('5-whys');
    expect(designCAPA(changed(capa, { systemic: true, contributingFactorCount: undefined })).rootCause.method).toBe('fmea');
    expect(designCAPA(changed(capa, { recurring: undefined, preferredRootCauseMethod: 'ishikawa' })).rootCause.method).toBe('ishikawa');
    expect(designCAPA(changed(capa, { source: 'oos', severity: 'critical' })).rootCause.method).toBe('fault-tree');
  });
  it('says in the problem statement when recurrence is not stated', () => {
    expect(designCAPA(changed(capa, { recurring: undefined })).problemStatement).toMatch(/; recurrence not stated/);
    expect(designCAPA(capa).problemStatement).not.toMatch(/recurrence not stated|RECURRING/);
    expect(designCAPA(changed(capa, { recurring: true })).problemStatement).toMatch(/; event is RECURRING/);
  });
  it('sets no target timeline from a severity only inferred from product impact', () => {
    const out = designCAPA(changed(capa, { severity: undefined, productImpact: true }));
    expect(out).toMatchObject({ severity: 'high', severityBasis: 'inferred_from_product_impact', formality: 'formal' });
    expect(out.recommendedTargetDays).toBeNull();
    expect(designCAPA(changed(capa, { severity: 'high' })).recommendedTargetDays).toBe(45);
  });
  it('keeps the cross-area check, marked conditional, while systemic or recurring is unstated', () => {
    const check = (out: ReturnType<typeof designCAPA>) => out.effectivenessChecks.find(c => /analogous areas/.test(c.metric));
    expect(check(designCAPA(changed(capa, { systemic: undefined })))?.timing)
      .toEqual(expect.stringMatching(/if the failure is systemic or recurring \(not stated\)/));
    expect(check(designCAPA(capa))).toBeUndefined();
    expect(check(designCAPA(changed(capa, { recurring: true })))?.timing).toBe('At 6 months post-implementation.');
  });
});

describe('classify_gmp_deviation does not read an omitted usMarketed as true', () => {
  it('leaves the field-alert evaluation undetermined for a distributed OOS batch', () => {
    const out = classifyGMPDeviation(changed(deviation, { usMarketed: undefined }));
    expect(out.reporting.fieldAlertReportEvaluation).toBe('undetermined');
    expect(out.reporting.fieldAlertRationale).toMatch(/usMarketed not stated/);
    expect(out.reporting.recallEvaluation).toBe(false);
    expect(out.notAssessed).toContain('usMarketed');
    expect(out.classification).toBe('major');
  });
  it('keeps the stated answer', () => {
    expect(classifyGMPDeviation(deviation).reporting.fieldAlertReportEvaluation).toBe(true);
    expect(classifyGMPDeviation(changed(deviation, { usMarketed: false })).reporting.fieldAlertReportEvaluation).toBe(false);
  });
});

describe('assess_api_gmp assesses no step, level or change classification from an omitted fact', () => {
  it('does not assess an omitted step as starting-material production', () => {
    expect(() => assessAPIGMP(changed(api, { step: undefined }))).toThrow(/step/);
  });
  it('leaves the level not assessed, and marks the controls a critical step adds, when isCriticalStep is omitted', () => {
    const out = assessAPIGMP(changed(api, { isCriticalStep: undefined }));
    expect(out.stringency).toMatchObject({ gmpStringency: 'not_assessed', stringencyLevel: null });
    const release = out.criticalProcessControls.find(c => c.control === 'Release testing against API specification');
    expect(release?.expectation).toEqual(expect.stringMatching(/^If this is a critical process step \(not stated\)/));
    expect(out.changeControl).toMatchObject({ classification: 'not_assessed', requiresRevalidation: null, requiresRegulatoryNotification: null });
  });
  it('keeps what a final step or a stated fact settles', () => {
    expect(assessAPIGMP(changed(api, { step: 'final_api', isCriticalStep: undefined, changeIsSignificant: undefined })))
      .toMatchObject({ stringency: { gmpStringency: 'full_gmp_enhanced', stringencyLevel: 4 }, changeControl: { classification: 'significant' } });
    expect(assessAPIGMP(api)).toMatchObject({
      stringency: { gmpStringency: 'full_gmp', stringencyLevel: 3 }, changeControl: { classification: 'minor', requiresRevalidation: false },
    });
    expect(assessAPIGMP(changed(api, { isCriticalStep: true })).stringency).toMatchObject({ gmpStringency: 'full_gmp_enhanced', stringencyLevel: 4 });
  });
  it('does not classify a change as minor when changeIsSignificant is omitted', () => {
    expect(assessAPIGMP(changed(api, { changeIsSignificant: undefined })).changeControl.classification).toBe('not_assessed');
  });
});

describe('design_sterile_controls chooses no sterilisation route from an omitted fact', () => {
  it('leaves the approach and barrier not assessed when heatStable is omitted', () => {
    const out = designSterileControls(changed(sterile, { heatStable: undefined }));
    expect(out.sterilisation.selectedApproach).toBe('not_assessed');
    expect(out.recommendedBarrier).toBe('not_assessed');
    expect(out.recommendations.map(r => r.recommendation).join(' ')).not.toMatch(/not using terminal sterilisation/);
  });
  it('leaves the approach not assessed, but the barrier set, when a product that is not heat-stable has no stated filterability', () => {
    const out = designSterileControls(changed(sterile, { filterable: undefined }));
    expect(out.sterilisation.selectedApproach).toBe('not_assessed');
    expect(out.recommendedBarrier).toBe('isolator');
  });
  it('keeps the stated route', () => {
    expect(designSterileControls(changed(sterile, { heatStable: true, filterable: undefined })))
      .toMatchObject({ sterilisation: { selectedApproach: 'terminal_moist_heat' }, recommendedBarrier: 'open_cleanroom' });
    expect(designSterileControls(sterile)).toMatchObject({ sterilisation: { selectedApproach: 'sterile_filtration_aseptic' }, recommendedBarrier: 'isolator' });
    expect(designSterileControls(changed(sterile, { filterable: false })).sterilisation.selectedApproach).toBe('aseptic_processing');
  });
  it('says the lyophilisation question is open when lyophilised is omitted', () => {
    expect(designSterileControls(changed(sterile, { lyophilised: undefined })).lyophilisationNote).toEqual(expect.stringMatching(/^Not assessed/));
    expect(designSterileControls(sterile).lyophilisationNote).toBeNull();
  });
});

describe('assess_computer_system_validation does not read an omitted electronicRecords as true', () => {
  const recordControls = ['Validation of the computerised system', 'Secure, time-stamped audit trail', 'Access controls / authority checks'];
  const applicable = (out: ReturnType<typeof assessComputerSystemValidation>) =>
    out.part11Controls.filter(c => recordControls.includes(c.control)).map(c => c.applicable);
  it('leaves the record controls undetermined', () => {
    const out = assessComputerSystemValidation(changed(csv, { electronicRecords: undefined }));
    expect(applicable(out)).toEqual(['undetermined', 'undetermined', 'undetermined']);
    expect(out.notAssessed).toContain('electronicRecords');
  });
  it('keeps the stated answer', () => {
    expect(applicable(assessComputerSystemValidation(csv))).toEqual([true, true, true]);
    expect(applicable(assessComputerSystemValidation(changed(csv, { electronicRecords: false })))).toEqual([false, false, false]);
  });
  it('picks no assurance approach from a GxP impact only inferred from direct impact', () => {
    const out = assessComputerSystemValidation(changed(csv, { gxpImpact: undefined }));
    expect(out.assurance.approach).toBe('undetermined');
    expect(out.riskBasedScalingNote).toMatch(/GxP impact high \(inferred from direct impact; not assessed\)/);
    expect(assessComputerSystemValidation(csv).assurance.approach).toBe('csa_risk_based_scripted');
    expect(assessComputerSystemValidation(changed(csv, { gxpImpact: 'critical' })).assurance.approach).toBe('traditional_scripted_csv');
    expect(assessComputerSystemValidation(changed(csv, { gxpImpact: undefined, softwareType: 'custom' })).assurance.approach)
      .toBe('traditional_scripted_csv');
  });
  it('does not write an omitted supplier assessment as absent', () => {
    const supplier = (out: ReturnType<typeof assessComputerSystemValidation>) =>
      out.validationDeliverables.find(d => d.deliverable === 'Supplier assessment / audit')?.whenRequired;
    expect(supplier(assessComputerSystemValidation(changed(csv, { supplierAssessed: undefined })))).toMatch(/^Not stated whether one exists/);
    expect(supplier(assessComputerSystemValidation(changed(csv, { supplierAssessed: false })))).toMatch(/^Recommended/);
  });
});
