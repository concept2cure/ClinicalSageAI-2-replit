/**
 * Discovery / cheminformatics AnA tools (search_chembl_compound,
 * screen_compound_liabilities) — registration + input guards + the offline
 * structural-alert path. The deterministic screen needs no network; ChEMBL
 * resolution is exercised only via guard paths to keep the suite hermetic.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['search_chembl_compound', 'screen_compound_liabilities'];

describe('Cheminformatics AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', name => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some(t => t.name === name)).toBe(true);
  });
});

describe('search_chembl_compound — input guard', () => {
  it('requires a non-empty query', async () => {
    const out = JSON.parse(await getToolHandler('search_chembl_compound')!({ query: '  ' }, {} as any));
    expect(out.error).toMatch(/compound or drug name/i);
  });
});

describe('screen_compound_liabilities — deterministic offline path', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('requires a smiles or compound_name', async () => {
    const out = JSON.parse(await getToolHandler('screen_compound_liabilities')!({}, {} as any));
    expect(out.error).toMatch(/smiles.*compound_name|compound_name/i);
  });

  it('fires the high-confidence nitrosamine alert for NDMA SMILES (no network)', async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = JSON.parse(
      await getToolHandler('screen_compound_liabilities')!({ smiles: 'CN(C)N=O' }, {} as any)
    );
    expect(spy).not.toHaveBeenCalled(); // SMILES provided → no ChEMBL call
    expect(out.validation.valid).toBe(true);
    expect(out.hasMutagenicAlert).toBe(true);
    const alert = out.structuralAlerts.find((a: any) => a.id === 'n_nitrosamine');
    expect(alert?.confidence).toBe('high');
    expect(out.disclaimer).toMatch(/ICH M7/);
  });

  it('returns no alerts and an invalid verdict for malformed SMILES', async () => {
    const out = JSON.parse(
      await getToolHandler('screen_compound_liabilities')!({ smiles: 'CC(C' }, {} as any)
    );
    expect(out.validation.valid).toBe(false);
    expect(out.structuralAlerts).toHaveLength(0);
  });
});
