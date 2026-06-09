/**
 * KB lookup tools — the ANA agent can query the ICH guideline corpus and the
 * global regulatory-pathways corpus directly. Each tool must be registered,
 * present in ALL_ANA_TOOLS, return real reference data with the honesty caveat,
 * and degrade gracefully on unknown input (no fabrication).
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const NEW_TOOLS = ['lookup_ich_guideline', 'lookup_regulatory_pathway'];

describe('KB lookup tools — registration', () => {
  it.each(NEW_TOOLS)('%s is registered and defined', name => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some(t => t.name === name)).toBe(true);
  });
});

describe('lookup_ich_guideline (corpus-backed)', () => {
  it('resolves an exact code with the ich.org caveat', async () => {
    const handler = getToolHandler('lookup_ich_guideline')!;
    const out = JSON.parse(await handler({ guideline: 'E6(R3)' }, {} as ToolContext));
    expect(out.match).toBe('exact');
    expect(out.guideline.topic).toBe('GCP');
    expect(out.note).toMatch(/ich\.org/);
  });

  it('searches by topic when the input is not an exact code', async () => {
    const handler = getToolHandler('lookup_ich_guideline')!;
    const out = JSON.parse(await handler({ guideline: 'nitrosamine' }, {} as ToolContext));
    expect(out.match).toBe('search');
    expect(out.guidelines.some((g: any) => g.code === 'M7(R2)')).toBe(true);
  });

  it('returns an empty result (not a fabricated hit) for no match', async () => {
    const handler = getToolHandler('lookup_ich_guideline')!;
    const out = JSON.parse(await handler({ guideline: 'zzzznomatch' }, {} as ToolContext));
    expect(out.guidelines).toEqual([]);
    expect(out.note).toMatch(/ich\.org/);
  });

  it('requires a guideline argument', async () => {
    const handler = getToolHandler('lookup_ich_guideline')!;
    const out = JSON.parse(await handler({}, {} as ToolContext));
    expect(out.error).toMatch(/required/);
  });
});

describe('lookup_regulatory_pathway', () => {
  it('lists an agency with the verify caveat', async () => {
    const handler = getToolHandler('lookup_regulatory_pathway')!;
    const out = JSON.parse(await handler({ agency: 'FDA' }, {} as ToolContext));
    expect(out.ok).toBe(true);
    expect(out.pathways.every((p: any) => p.agency === 'FDA')).toBe(true);
    expect(out.note).toMatch(/confirm eligibility/i);
  });

  it('searches by goal keyword', async () => {
    const handler = getToolHandler('lookup_regulatory_pathway')!;
    const out = JSON.parse(await handler({ query: 'breakthrough' }, {} as ToolContext));
    expect(out.pathways.some((p: any) => p.id === 'fda-breakthrough')).toBe(true);
  });

  it('returns a cross-agency summary when unscoped', async () => {
    const handler = getToolHandler('lookup_regulatory_pathway')!;
    const out = JSON.parse(await handler({}, {} as ToolContext));
    expect(out.summary.agencies).toBeGreaterThanOrEqual(8);
    expect(out.count).toBe(out.pathways.length);
  });
});
