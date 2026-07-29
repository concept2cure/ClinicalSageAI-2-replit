/**
 * Extended regulatory tools — registration + offline behavior.
 * All four engines are deterministic/network-free, so full paths run offline.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);
const TOOLS = [
  'model_budget_impact', 'model_cost_effectiveness',
  'generate_spl', 'validate_spl',
  'generate_define_xml', 'check_dataset_conformance',
  'import_ris_references', 'format_references', 'lint_references',
];

describe('extended regulatory tools — registration', () => {
  it.each(TOOLS)('%s is defined and has a handler', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('HEOR tools', () => {
  it('model_budget_impact computes', async () => {
    const out = JSON.parse(await getToolHandler('model_budget_impact')!({
      populationSize: 1_000_000, eligibleFraction: 0.01, annualCostNew: 12000, annualCostComparator: 2000, newShareByYear: [0.1, 0.2],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.years[0].budgetImpact).toBe(10_000_000);
  });
  it('model_cost_effectiveness validates inputs', async () => {
    const out = JSON.parse(await getToolHandler('model_cost_effectiveness')!({ costIntervention: 'x' }));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('SPL tools', () => {
  const spec = { documentTypeCode: '34391-3', title: 'X', setId: '11111111-2222-3333-4444-555555555555', versionNumber: 1, effectiveDate: '20260101', organizationName: 'Org', sections: [{ code: '34067-9', title: 'Indications', text: 'For X.' }] };
  it('generate_spl returns SPL XML', async () => {
    const out = JSON.parse(await getToolHandler('generate_spl')!({ spec }));
    expect(out.status).toBe('generated');
    expect(out.xml).toContain('urn:hl7-org:v3');
  });
  it('validate_spl flags a bad spec', async () => {
    const out = JSON.parse(await getToolHandler('validate_spl')!({ spec: { ...spec, setId: 'bad' } }));
    expect(out.result.valid).toBe(false);
  });
});

describe('CDISC tools', () => {
  const spec = { studyName: 'S', standard: 'SDTM', datasets: [{ name: 'DM', label: 'Demographics', variables: [
    { name: 'STUDYID', label: 'Study Id', type: 'text', length: 20 },
    { name: 'DOMAIN', label: 'Domain', type: 'text', length: 2 },
    { name: 'USUBJID', label: 'Subject', type: 'text', length: 30 },
  ] }] };
  it('generate_define_xml returns ODM XML + conformance', async () => {
    // generateDefineXml reads { datasets, studyName } at the top level (not under
    // a `spec` wrapper), so pass the spec fields directly.
    const out = JSON.parse(await getToolHandler('generate_define_xml')!(spec));
    // runStatsTool wraps the engine output: { status:'computed', engine, result }.
    // generateDefineXml returns { xml, datasetCount, variableCount }; conformance
    // is now a separate tool (check_dataset_conformance, exercised below).
    expect(out.status).toBe('computed');
    expect(out.result.xml).toContain('def:DefineVersion="2.1.0"');
    expect(out.result.datasetCount).toBe(1);
  });
  it('check_dataset_conformance flags missing required vars', async () => {
    const out = JSON.parse(await getToolHandler('check_dataset_conformance')!({ spec: { studyName: 'S', standard: 'SDTM', datasets: [{ name: 'AE', label: 'AE', variables: [{ name: 'STUDYID', label: 'x', type: 'text', length: 5 }] }] } }));
    expect(out.result.summary.pass).toBe(false);
  });
});

describe('Reference tools', () => {
  it('import_ris_references parses RIS', async () => {
    const out = JSON.parse(await getToolHandler('import_ris_references')!({ ris: 'TY  - JOUR\nAU  - Smith, J\nTI  - T\nER  -\n' }));
    expect(out.status).toBe('parsed');
    expect(out.count).toBe(1);
  });
  it('format_references formats Vancouver', async () => {
    const out = JSON.parse(await getToolHandler('format_references')!({ references: [{ authors: ['Smith, John'], title: 'T', journal: 'J', year: '2020' }] }));
    expect(out.status).toBe('formatted');
    expect(out.bibliography).toMatch(/^1\. Smith J\. T\. J\. 2020/);
  });
  it('lint_references requires a non-empty list', async () => {
    const out = JSON.parse(await getToolHandler('lint_references')!({ references: [] }));
    expect(out.status).toBe('needs_parameters');
  });
});
