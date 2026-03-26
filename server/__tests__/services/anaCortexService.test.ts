import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

vi.mock('../../db', () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })),
  },
}));

vi.mock('@shared/schema', () => ({
  anaDataAtoms: {},
  anaFilingDocuments: {},
  anaObservationTerms: {},
  csrReports: {},
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('AnaCortexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts operational signals and computes regulatory risk', async () => {
    const { AnaCortexService } = await import('../../services/ana-cortex-service');
    const service = new AnaCortexService();

    const signals = (service as any).extractSignals(
      'The sponsor faced manufacturing delays. The supply chain issue may impact launch. A warning letter was issued.'
    );

    expect(signals.operationalSignals.length).toBeGreaterThan(0);
    expect(signals.summary.operationalCount).toBeGreaterThan(0);
    expect(signals.summary.regulatoryRiskScore).toBeGreaterThan(0);
  });

  it('retries SEC calls and succeeds on subsequent attempt', async () => {
    const getMock = vi.mocked(axios.get);
    getMock
      .mockRejectedValueOnce(new Error('temporary upstream failure'))
      .mockResolvedValueOnce({ data: { filings: { recent: { form: [] } } } } as any);

    const { AnaCortexService } = await import('../../services/ana-cortex-service');
    const service = new AnaCortexService();

    const result = await (service as any).fetchWithRetry('https://example.com', {}, 2);
    expect(result.data).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('returns organized capability health payload', async () => {
    const { AnaCortexService } = await import('../../services/ana-cortex-service');
    const service = new AnaCortexService();

    const status = await service.getCapabilityHealth();
    expect(status.module).toBe('AnA Cortex');
    expect(status.engineVersion).toBe('AnA 1.0 RI');
    expect(Array.isArray(status.capabilities)).toBe(true);
    expect(status.dependencies.database).toBe('online');
  });
});
