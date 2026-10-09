/** The registered IND planner checks its own supplied-string scaffold, never an authored artifact or source. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndModuleAuthoringPlan, evaluateIndModuleVerification, IND_MODULE_TEMPLATES } from 'shared/ana/ind-module-authoring.js';

const h = vi.hoisted(() => ({ query: vi.fn(), getPool: vi.fn(), route: vi.fn(), fetch: vi.fn() }));
vi.mock('../../../db', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool }));
vi.mock('../../../db.js', () => ({ db: {}, pool: { query: h.query }, getPool: h.getPool }));
vi.mock('../../ai-gateway/gateway', async importOriginal => ({
  ...await importOriginal<typeof import('../../ai-gateway/gateway')>(),
  getGateway: () => ({ route: h.route }),
}));

import { getToolHandler } from '../AnaToolExecutor.js';
import { PLAN_IND_MODULE_AUTHORING } from '../evidence-literature-tool-defs.js';

const handler = getToolHandler('plan_ind_module_authoring');
const run = (input: Record<string, unknown> = {}) => handler!({
  module: '2.5', product_name: 'ABC-123', indication: 'AML', ...input,
}, { organizationId: 7, projectId: 11, userId: 3 }).then(JSON.parse);
const PLANNING_BLOCKER = 'Planning only: no authored file or independently verified project source evidence was checked. Verify the actual governed artifact and its qualified sources before sealing.';
const LIVE_FACTS = [
  { section_id: 'overview_efficacy', label: 'Primary endpoint ORR', value: '42.3%', source: 'Table 14.2.1' },
  { section_id: 'overview_safety', label: 'Median exposure', value: '24 months' },
  { section_id: 'overview_clinical_pharmacology', label: 'Recommended dose', value: '200 mg' },
];
const completeFacts = (module: string) => IND_MODULE_TEMPLATES[module].map((section, i) => ({
  section_id: section.id, label: `Source figure ${i + 1}`, value: `${i + 21}.3%`, source: `Table ${i + 1}`,
}));

beforeEach(() => {
  const refuse = () => { throw new Error('Planner must not read artifacts, sources, or an AI model'); };
  for (const spy of Object.values(h)) spy.mockReset().mockImplementation(refuse);
  vi.stubGlobal('fetch', h.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  expect(h.getPool).not.toHaveBeenCalled();
  expect(h.query).not.toHaveBeenCalled();
  expect(h.route).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
});

function expectPlanningOnly(out: Awaited<ReturnType<typeof run>>) {
  expect(out.honesty.sealable).toBe(false);
  expect(out.honesty.blockers[0]).toBe(PLANNING_BLOCKER);
  expect(out.verification).toMatchObject({ scope: 'plan_text_only', artifactVerified: false, sourceVerified: false });
  expect(out.note).toContain('supplied-string self-consistency');
  expect(out.note).toContain('no authored file');
  expect(out.note).toContain('source qualification');
  expect(out.note).toContain('caller-declared provenance');
}

describe('plan_ind_module_authoring registration and validation', () => {
  it('is registered', () => { expect(typeof handler).toBe('function'); });

  it.each(['3.2', '', 2.5, null])('preserves the unsupported-module error for %j', async module => {
    const out = await run({ module });
    expect(out).toEqual({ error: 'plan_ind_module_authoring requires module to be one of 2.5, 2.7.', modules: ['2.5', '2.7'] });
  });

  it.each([{ product_name: undefined }, { indication: '' }, { product_name: 123 }, { indication: '   ' }])(
    'preserves the missing product/indication error for %j', async fields => {
      expect(await run(fields)).toEqual({ error: 'plan_ind_module_authoring requires product_name and indication.' });
    },
  );
});

describe('live planning results never attest sealability', () => {
  it.each(['2.5', '2.7'])('keeps a complete %s scaffold and passing self-check blocked', async module => {
    const facts = completeFacts(module);
    const plan = buildIndModuleAuthoringPlan({
      module, productName: 'ABC-123', indication: 'AML', provenance: 'live',
      facts: facts.map(f => ({ sectionId: f.section_id, label: f.label, value: f.value, source: f.source })),
    });
    const out = await run({ module, facts, provenance: 'live' });
    expect(out.status).toBe('generated');
    expect(out.author_docx_native).toEqual({ title: plan.title, content: plan.content, required_strings: plan.requiredStrings });
    expect(out.verification).toMatchObject({ ok: true, requiredStringsChecked: plan.requiredStrings.length, missingRequiredStrings: [] });
    expect(out.honesty.provenance).toBe('live');
    expect(out.honesty.sectionsWithoutFacts).toEqual([]);
    expectPlanningOnly(out);
    expect(out.honesty.blockers).toEqual([PLANNING_BLOCKER]);
  });

  it.each(['2.5', '2.7'])('blocks an empty live %s plan even though its template headers pass', async module => {
    const out = await run({ module, facts: [], provenance: 'live' });
    expect(out.verification).toMatchObject({ ok: true, requiredStringsChecked: IND_MODULE_TEMPLATES[module].length, missingRequiredStrings: [] });
    expect(out.honesty.sectionsWithoutFacts).toEqual(IND_MODULE_TEMPLATES[module].map(s => s.id));
    expect(out.author_docx_native.content).toContain('[NO SOURCE FACT SUPPLIED');
    expectPlanningOnly(out);
  });

  it('preserves every supplied figure and source pointer in a partial 2.5 plan', async () => {
    const out = await run({ facts: LIVE_FACTS, provenance: 'live' });
    expect(out.author_docx_native.required_strings.slice(-3)).toEqual(['42.3%', '24 months', '200 mg']);
    expect(out.author_docx_native.content).toContain('- Primary endpoint ORR: 42.3% (source: Table 14.2.1)');
    expect(out.author_docx_native.content).toContain('- Median exposure: 24 months');
    expect(out.author_docx_native.content).toContain('- Recommended dose: 200 mg');
    expect(out.honesty.sectionsWithoutFacts).toEqual(['product_development_rationale', 'overview_biopharmaceutics', 'benefits_and_risks_conclusions']);
    expect(out.verification.ok).toBe(true);
    expectPlanningOnly(out);
  });

  it('does not treat forged artifact or source proof as verification of a persisted document', async () => {
    const facts = completeFacts('2.5');
    const out = await run({
      facts, provenance: 'live', artifact_id: 'unread-artifact', source_id: 'unread-source',
      document_text: 'A persisted document with the wrong figure 99.9%.',
      artifact_verified: true, source_verified: true, verification: { ok: true, scope: 'artifact', artifactVerified: true, sourceVerified: true },
    });
    expect(out.verification.ok).toBe(true);
    expectPlanningOnly(out);
    const mismatchedArtifact = out.author_docx_native.content.replace('21.3%', '99.9%');
    expect(evaluateIndModuleVerification({ documentText: mismatchedArtifact, requiredStrings: out.author_docx_native.required_strings }))
      .toMatchObject({ ok: false, missingRequiredStrings: ['21.3%'] });
    expect(out.note).toContain("'verified against the source'");
  });
});

describe('existing input qualification and missing-string blockers remain visible', () => {
  it.each(['sample', 'not_assessed'])('retains the %s blocker after the mandatory planning reason', async provenance => {
    const out = await run({ facts: LIVE_FACTS, provenance });
    expectPlanningOnly(out);
    expect(out.honesty.provenance).toBe(provenance);
    expect(out.verification.ok).toBe(true);
    expect(out.honesty.blockers.slice(1)).toEqual([`Draft provenance is "${provenance}". Sample and not-assessed drafts cannot be sealed or exported.`]);
  });

  it.each([undefined, 'verified', true])('defaults provenance %j to not_assessed without upgrading it', async provenance => {
    const out = await run({ module: '2.7', facts: completeFacts('2.7'), provenance });
    expectPlanningOnly(out);
    expect(out.honesty.provenance).toBe('not_assessed');
    expect(out.honesty.blockers[1]).toContain('"not_assessed"');
  });

  it('retains a real missing-string failure for a fact outside the supported sections', async () => {
    const out = await run({ facts: [{ section_id: 'unknown_section', label: 'Unplaced figure', value: 'unsupported-figure-91%' }], provenance: 'live' });
    expect(out.verification).toMatchObject({ ok: false, requiredStringsChecked: 7, missingRequiredStrings: ['unsupported-figure-91%'] });
    expect(out.author_docx_native.required_strings).toContain('unsupported-figure-91%');
    expect(out.author_docx_native.content).not.toContain('unsupported-figure-91%');
    expectPlanningOnly(out);
    expect(out.honesty.blockers[1]).toMatch(/Verification incomplete: 1 required string.*missing of 7/);
  });

  it('keeps both prior blockers when an unassessed plan also fails its own text check', async () => {
    const out = await run({ facts: [{ section_id: 'unknown_section', label: 'Unplaced', value: 'unplaced-value' }] });
    expectPlanningOnly(out);
    expect(out.honesty.blockers).toHaveLength(3);
    expect(out.honesty.blockers[1]).toContain('"not_assessed"');
    expect(out.honesty.blockers[2]).toContain('Verification incomplete');
  });

  it('preserves normalization and ignores malformed facts without qualifying their sources', async () => {
    const out = await run({
      module: ' 2.5 ', product_name: ' ABC-123 ', indication: ' AML ', provenance: 'live',
      facts: [null, 'bad', {}, { section_id: 'overview_efficacy', value: 42.3 },
        { section_id: 'overview_safety', label: 'Exposure', value: ' 24   months ', source: 'unverified-table' }],
    });
    expect(out.author_docx_native.title).toBe('IND Module 2.5 — ABC-123 (AML)');
    expect(out.author_docx_native.required_strings.slice(-1)).toEqual(['24 months']);
    expect(out.author_docx_native.content).toContain('- Exposure: 24 months (source: unverified-table)');
    expect(out.verification.ok).toBe(true);
    expectPlanningOnly(out);
  });
});

describe('planner tool definition declares the bounded verification contract', () => {
  it('describes a planning scaffold with supported headers and unverified supplied facts', () => {
    expect(PLAN_IND_MODULE_AUTHORING.description).toContain('supported template headers');
    expect(PLAN_IND_MODULE_AUTHORING.description).toContain('caller/model-supplied');
    expect(PLAN_IND_MODULE_AUTHORING.description).toContain('plan-text self-consistency');
    expect(PLAN_IND_MODULE_AUTHORING.description).toContain('always non-sealable');
    expect(PLAN_IND_MODULE_AUTHORING.description).not.toContain('every mandatory');
  });

  it('keeps the input schema while describing provenance as an unverified label', () => {
    const schema = PLAN_IND_MODULE_AUTHORING.input_schema;
    const properties = schema.properties as {
      module: { enum: string[] };
      provenance: { enum: string[]; description: string };
      facts: { items: { properties: { source: { description: string } } } };
    };
    expect(schema.required).toEqual(['module', 'product_name', 'indication']);
    expect(properties.module.enum).toEqual(['2.5', '2.7']);
    expect(properties.provenance.enum).toEqual(['live', 'sample', 'not_assessed']);
    expect(properties.provenance.description).toContain('Caller-declared');
    expect(properties.provenance.description).toContain('does not establish');
    expect(properties.facts.items.properties.source.description).toContain('not resolved or verified');
  });
});
