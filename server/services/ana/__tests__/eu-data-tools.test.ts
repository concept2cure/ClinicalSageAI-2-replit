/**
 * EU live-data AnA tools — registration, pedigree, and graceful-degradation.
 *
 * The network path is exercised through MOCKED fetch (FIXTURE response) — no live
 * network. We assert each tool: (1) is defined + registered, (2) classifies as
 * `external_api_live` via the pedigree classifier (it is a `search_*` tool), and
 * (3) on a simulated network failure returns a clean JSON `status: 'unavailable'`
 * result rather than throwing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolPedigree } from '../tool-pedigree';

const EU_TOOL_NAMES = ['search_eudamed', 'search_ema_epar', 'search_eu_ctis'] as const;

describe('EU live-data tools', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('are all defined and registered', () => {
    const names = ALL_ANA_TOOLS.map(t => t.name);
    for (const name of EU_TOOL_NAMES) {
      expect(names).toContain(name);
      expect(typeof getToolHandler(name)).toBe('function');
    }
  });

  it('classify as external_api_live (live external authority API)', () => {
    for (const name of EU_TOOL_NAMES) {
      const p = getToolPedigree(name);
      expect(p.pedigree).toBe('external_api_live');
      expect(p.deterministic).toBe(false);
      expect(p.trust).toBe('medium');
    }
  });

  it('search_eudamed maps a fixture response to devices', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        totalElements: 1,
        content: [
          {
            basicUdiDiData: { code: '0123456789012AB' },
            tradeName: 'CardioStent X',
            manufacturer: { name: 'Acme Medical GmbH', srn: 'DE-MF-000012345' },
            riskClass: 'III',
            versionState: 'PUBLISHED',
          },
        ],
      }),
    }) as any;

    const out = JSON.parse(await getToolHandler('search_eudamed')!({ query: 'stent' }));
    expect(out.status).toBe('ok');
    expect(out.source).toMatch(/EUDAMED/);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].basicUdiDi).toBe('0123456789012AB');
    expect(out.provenance[0].sourceId).toBe('eudamed');
  });

  it('each EU tool returns a clean status:unavailable on a network failure (no throw)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    for (const name of EU_TOOL_NAMES) {
      const raw = await getToolHandler(name)!({ query: 'oncology' });
      const out = JSON.parse(raw);
      expect(out.status).toBe('unavailable');
      expect(typeof out.note).toBe('string');
      expect(typeof out.url).toBe('string');
    }
  });
});
