import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ draftDocument: vi.fn(), batchDraft: vi.fn() }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => state }));
vi.mock('../../services/audit/audit-write-outcome', () => {
  throw new Error('private lazy audit module initialization failure');
});
vi.mock('../../services/ana/turn-record.js', () => ({
  canonicalJson: JSON.stringify,
  openTurnRecorder: () => ({ warn: vi.fn(), setModel: vi.fn(), setOutputs: vi.fn() }),
  writeTurnRecordSafely: async () => ({ status: 'recorded', id: 'fixture-turn', sha256: 'a'.repeat(64) }),
}));

import router from '../ana-intelligence';

const draft = {
  content: 'Synthetic generated output.', model: 'approved-pinned-fixture',
  usage: { inputTokens: 1, outputTokens: 2, estimatedCostUsd: 0 }, latencyMs: 1,
};
const body = { framework: 'ich_clinical', sectionType: 'summary', instructions: 'Fixture instructions.' };
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { tenantContext: { organizationId: 7 }, user: { id: 3, organizationId: 7 } }); next(); });
  a.use('/api/claude', router);
  return a;
}

beforeEach(() => {
  state.draftDocument.mockReset().mockResolvedValue(draft);
  state.batchDraft.mockReset().mockResolvedValue([draft]);
});

describe('an unexpected lazy audit module failure after generation', () => {
  it.each(['/draft', '/batch', '/draft/stream'])('%s returns the generated output with a contained missing-audit outcome', async (path) => {
    const res = await request(app()).post(`/api/claude${path}`).send(path === '/batch' ? { requests: [body] } : body);
    expect(res.status).toBe(200);
    const response = path === '/draft/stream'
      ? JSON.parse(res.text.split('\n\n').filter(Boolean).at(-1)!.slice(6))
      : res.body;
    expect(response.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(response)).not.toMatch(/private lazy|initialization failure/);
    if (path === '/draft') expect(response.data.content).toBe(draft.content);
    if (path === '/batch') expect(response.data.results[0]).toMatchObject({ content: draft.content, turnRecord: { status: 'recorded', id: 'fixture-turn' } });
    if (path === '/draft/stream') expect(response.type).toBe('done');
  });
});
