/**
 * Provenance on the aggregate adverse-event + recall tools. FAERS/MAUDE are
 * spontaneous/passive surveillance — a single source-level provenance record
 * with a no-causality caveat; device recalls are per-item citeable by recall
 * number. Clients are mocked so the suite is hermetic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../fda_faers_client.js', () => ({
  default: {
    searchAdverseEvents: vi.fn(async () => [{ x: 1 }]),
    analyzeFaersData: vi.fn(() => ({ total_reports: 42 })),
  },
}));
vi.mock('../../../fda_maude_client.js', () => ({
  default: {
    searchDeviceReports: vi.fn(async () => [{ y: 1 }]),
    analyzeMaudeData: vi.fn(() => ({ total_reports: 7 })),
  },
}));
vi.mock('../../integrations/device-recalls.js', () => ({
  searchDeviceRecalls: vi.fn(async () => ({
    source: 'FDA Device Recalls (openFDA)',
    searchExpression: 'recalling_firm:"Acme"',
    summary: { classI: 1 },
    recalls: [{ recallNumber: 'Z-1234-2024', classification: 'Class I', reason: 'defect', status: 'Ongoing', recallingFirm: 'Acme' }],
  })),
}));

import { getToolHandler } from '../AnaToolExecutor';

describe('adverse-event + recall tools — provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('search_drug_adverse_events emits one aggregate FAERS provenance with a no-causality caveat', async () => {
    const out = JSON.parse(await getToolHandler('search_drug_adverse_events')!({ product_name: 'acmedrug' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('openfda');
    expect(out.provenance[0].confidence).toBe('moderate'); // 42 reports → signal present
    expect(out.provenance[0].citation.title).toMatch(/FAERS.*acmedrug.*42 reports/);
    expect(out.provenance[0].caveats.some((c: string) => /causality/i.test(c))).toBe(true);
  });

  it('search_device_adverse_events emits one aggregate MAUDE provenance', async () => {
    const out = JSON.parse(await getToolHandler('search_device_adverse_events')!({ device_name: 'pump' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].citation.title).toMatch(/MAUDE.*pump.*7 reports/);
    expect(out.provenance[0].caveats.some((c: string) => /passive surveillance/i.test(c))).toBe(true);
  });

  it('search_device_recalls emits per-recall provenance keyed by recall number', async () => {
    const out = JSON.parse(await getToolHandler('search_device_recalls')!({ manufacturer: 'Acme' }, {} as any));
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('openfda');
    expect(out.provenance[0].confidence).toBe('high');
    expect(out.provenance[0].citation.identifier).toBe('Z-1234-2024');
    expect(out.provenance[0].citation.title).toMatch(/Class I/);
  });
});
