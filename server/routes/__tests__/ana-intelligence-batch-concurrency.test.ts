import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ batch: vi.fn(), open: vi.fn(), record: vi.fn(), provenance: vi.fn() }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => ({ batchDraft: h.batch }) }));
vi.mock('../../services/ana/turn-record.js', () => ({
  canonicalJson: JSON.stringify, openTurnRecorder: h.open, writeTurnRecordSafely: h.record,
}));
vi.mock('../ana-model-provenance', () => ({ recordModelProvenance: h.provenance, unavailableModelProvenance: vi.fn() }));

import router from '../ana-intelligence';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { tenantContext: { organizationId: 7 }, user: { id: 3, organizationId: 7 } });
    next();
  });
  instance.use('/api/claude', router);
  return instance;
}

const section = { framework: 'ich_clinical', sectionType: 'Summary', instructions: 'Synthetic fixture.' };
const invalid = [
  { label: 'negative', value: -1 }, { label: 'zero', value: 0 },
  { label: 'fraction', value: 1.5 }, { label: 'null', value: null },
  { label: 'false', value: false }, { label: 'true', value: true },
  { label: 'numeric string', value: '3' }, { label: 'empty string', value: '' },
  { label: 'array', value: [] }, { label: 'object', value: {} },
];
beforeEach(() => {
  vi.clearAllMocks();
  h.open.mockReturnValue(undefined);
  h.record.mockResolvedValue(null);
  h.batch.mockResolvedValue([{ content: 'Synthetic output', model: 'fixture', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
    latencyMs: 1, finishReason: 'end_turn', truncated: false }]);
  h.provenance.mockResolvedValue({ persisted: true, chained: true });
});

describe('HTTP batch concurrency', () => {
  it.each(invalid)('refuses $label before service or recording', async ({ value: concurrency }) => {
    const res = await request(app()).post('/api/claude/batch').send({ requests: [section], concurrency });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BATCH_CONCURRENCY');
    expect(res.body.message).toMatch(/positive integer/i);
    expect(h.batch).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.provenance).not.toHaveBeenCalled();
  });

  it.each([
    { supplied: undefined, expected: 3 }, { supplied: 1, expected: 1 },
    { supplied: 3, expected: 3 }, { supplied: 5, expected: 5 }, { supplied: 99, expected: 5 },
  ])('retains default and capped positive-integer behavior for $supplied', async ({ supplied, expected }) => {
    const res = await request(app()).post('/api/claude/batch').send({ requests: [section], concurrency: supplied });
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ total: 1, drafted: 1, failed: 0 });
    expect(h.batch).toHaveBeenCalledExactlyOnceWith({ requests: [{ ...section, organizationId: 7, userId: 3 }], concurrency: expected });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.provenance).toHaveBeenCalledTimes(1);
  });
});
