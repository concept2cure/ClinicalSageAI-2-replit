/**
 * The 2.3 Quality Overall Summary AnA drafts is the open program's, from that
 * program's recorded CMC data — never from figures the model supplies
 * (discovery map 2026-10-04, ana-qos-tool-model-supplied-cmc-data; CLAUDE.md
 * Rule 2: "a tool that asks a model for a figure is a defect").
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SUPPLIED_CMC_REFUSAL, draftQualityOverallSummary } from '../cmc-quality-summary-tool';

const ORG = 7;
const PROGRAM = '9a4c4a2e-5d1e-4c6b-9c0a-1f2e3d4c5b6a';

const SOURCES = [
  { id: 'so-1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115', manufacturer: 'Acme Biologics' }, sourceHash: 'h1' },
  { id: 'so-2', sourceType: 'drug_product', sourcePayload: { productName: 'BX-115 50 mg tablet', dosageFormDescription: 'tablet', composition: 'BX-115, MCC', strength: '50 mg' }, sourceHash: 'h2' },
  { id: 'so-3', sourceType: 'specification', sourcePayload: { acceptanceCriteria: { assay: '95.0-105.0%' } }, sourceHash: 'h3' },
];

/** A pool that answers the program check and the program's source read, and records what was asked. */
function fakePool(opts: { programHere?: boolean; sources?: unknown[]; fail?: boolean } = {}) {
  const asked: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      asked.push({ sql, params });
      if (opts.fail) throw new Error('relation "cmc_source_objects" does not exist');
      if (/regulatory_programs/i.test(sql)) return { rows: opts.programHere === false ? [] : [{ id: PROGRAM }] };
      if (/FROM cmc_source_objects/i.test(sql)) return { rows: params[0] === ORG && params[1] === PROGRAM ? (opts.sources ?? SOURCES) : [] };
      if (/region|regional|3\.2\.R/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  return { pool, asked, poolOf: async () => pool };
}

const ctx = { organizationId: ORG, projectRef: PROGRAM } as never;

describe('draft_quality_overall_summary_m2_3', () => {
  it('refuses CMC data supplied in the call, before reading anything', async () => {
    const { poolOf, asked } = fakePool();
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, { cmcSources: SOURCES }, ctx));
    expect(out).toEqual({ error: MODEL_SUPPLIED_CMC_REFUSAL });
    expect(asked).toHaveLength(0);
  });

  it('composes the open program’s QOS from that program’s recorded sources, names included', async () => {
    const { poolOf, asked } = fakePool();
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, {}, ctx));
    expect(out.drafted).toBe(true);
    expect(out.engine).toBe('deterministic');
    expect(out.basis).toMatch(/3 CMC source record/);
    expect(out.sectionKey).toBe('2.3');
    expect(JSON.stringify(out)).toContain('BX-115');
    // The sources read are this organisation's, for the program the conversation has open.
    const sourceRead = asked.find((a) => /FROM cmc_source_objects/i.test(a.sql))!;
    expect(sourceRead.params).toEqual([ORG, PROGRAM]);
  });

  it('says no program is open rather than composing one from nothing', async () => {
    const { poolOf } = fakePool();
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, {}, { organizationId: ORG } as never));
    expect(out.needs_project).toMatch(/No program is open/);
  });

  it('says the program has no recorded CMC data, and composes nothing', async () => {
    const { poolOf } = fakePool({ sources: [] });
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, {}, ctx));
    expect(out.no_cmc_data).toMatch(/no recorded CMC data/);
    expect(out.drafted).toBeUndefined();
  });

  it('reports a failed read as a failure, never as a summary', async () => {
    const { poolOf } = fakePool({ fail: true });
    const out = JSON.parse(await draftQualityOverallSummary(poolOf, {}, ctx));
    expect(out.error).toMatch(/could not be read/);
    expect(JSON.stringify(out)).not.toContain('cmc_source_objects');
  });
});
