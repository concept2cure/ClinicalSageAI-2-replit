import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);
const ALL = ['model_markov_cohort', 'run_probabilistic_sensitivity', 'run_cdisc_pipeline', 'compose_correspondence_cover_letter', 'compose_510k_summary'];

describe('advanced modeling + cover-letter tools — registration', () => {
  it.each(ALL)('%s is defined and registered', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('model_markov_cohort', () => {
  it('computes a cohort trace and totals', async () => {
    const out = JSON.parse(await getToolHandler('model_markov_cohort')!({
      states: ['Healthy', 'Dead'], transitionMatrix: [[0.9, 0.1], [0, 1]],
      stateCosts: [1000, 0], stateUtilities: [1, 0], cycles: 3,
    }));
    expect(out.status).toBe('computed');
    expect(out.result.undiscountedCost).toBe(2710);
  });
  it('rejects a bad transition matrix', async () => {
    const out = JSON.parse(await getToolHandler('model_markov_cohort')!({
      states: ['A', 'B'], transitionMatrix: [[0.5, 0.2], [0, 1]], stateCosts: [1, 0], stateUtilities: [1, 0], cycles: 2,
    }));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('run_probabilistic_sensitivity', () => {
  it('runs a seeded PSA with a CEAC', async () => {
    const out = JSON.parse(await getToolHandler('run_probabilistic_sensitivity')!({
      intervention: { cost: { mean: 50000, sd: 5000 }, effect: { mean: 5, sd: 0.5 } },
      comparator: { cost: { mean: 30000, sd: 4000 }, effect: { mean: 4, sd: 0.5 } },
      willingnessToPay: [20000, 50000, 100000], samples: 1000, seed: 7,
    }));
    expect(out.status).toBe('computed');
    expect(out.result.ceac).toHaveLength(3);
  });
});

describe('run_cdisc_pipeline', () => {
  it('runs conformance + define.xml + readiness', async () => {
    const out = JSON.parse(await getToolHandler('run_cdisc_pipeline')!({
      spec: { studyName: 'S', standard: 'SDTM', datasets: [{ name: 'DM', label: 'Demographics', variables: [
        { name: 'STUDYID', label: 'Study', type: 'text', length: 20 },
        { name: 'DOMAIN', label: 'Domain', type: 'text', length: 2 },
        { name: 'USUBJID', label: 'Subject', type: 'text', length: 30 },
      ] }] },
    }));
    expect(out.status).toBe('computed');
    expect(out.result.readiness.submissionReady).toBe(true);
    expect(out.result.defineXml).toContain('ODM');
  });
});

describe('cover-letter tools — tenant guards (offline)', () => {
  it('compose_correspondence_cover_letter refuses without org context', async () => {
    const out = JSON.parse(await getToolHandler('compose_correspondence_cover_letter')!({ documentId: 1, sponsorName: 'X', issues: [{ id: 'a', description: 'd', sectionNumbers: ['3'] }] }));
    expect(out.status).toBe('needs_context');
  });
  it('compose_510k_summary refuses without org context', async () => {
    const out = JSON.parse(await getToolHandler('compose_510k_summary')!({ documentId: 1, sponsorName: 'X', deviceTradeName: 'D', deviceClass: 'II', predicates: [{ kNumber: 'K1', deviceName: 'd', holder: 'h', primary: true }] }));
    expect(out.status).toBe('needs_context');
  });
  it('compose_510k_summary validates required params with context', async () => {
    const out = JSON.parse(await getToolHandler('compose_510k_summary')!({ sponsorName: 'X' }, { organizationId: 1, userId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });
});
