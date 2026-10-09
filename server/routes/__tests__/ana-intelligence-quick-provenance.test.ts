/**
 * /api/claude/quick records the model that served, not a literal.
 *
 * recordModelProvenance writes a sealed audit_logs row for every generation on
 * this router: WHICH model produced WHAT content (by sha256). The other surfaces
 * pass the gateway response's model. /quick passed the literal
 * 'claude-sonnet-4-6' — a registry entry quickComplete does not even pin — so
 * every /quick row named a model that had not served it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';

const S = vi.hoisted(() => ({
  quickComplete: vi.fn(),
  logged: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({ quickComplete: S.quickComplete }),
}));
vi.mock('../../services/auditService', () => ({
  default: {
    logAction: async (entry: Record<string, unknown>) => {
      S.logged.push(entry);
    },
  },
}));

import router from '../ana-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { organizationId: number; userId: number }).organizationId = 7;
    (req as unknown as { organizationId: number; userId: number }).userId = 1;
    next();
  });
  a.use('/api/claude', router);
  return a;
}

beforeEach(() => {
  S.quickComplete.mockReset();
  S.logged.length = 0;
});

describe('POST /api/claude/quick provenance', () => {
  it('the audit row names the model the gateway served and hashes the content returned', async () => {
    S.quickComplete.mockResolvedValue({ content: 'A short answer.', provider: 'anthropic', model: 'claude-opus-4-8' });

    const res = await request(app()).post('/api/claude/quick').send({ prompt: 'q' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ content: 'A short answer.' });
    await vi.waitFor(() => expect(S.logged).toHaveLength(1));
    expect(S.logged[0]).toMatchObject({ resourceId: 'quick' });
    expect(S.logged[0].details).toMatchObject({
      model: 'claude-opus-4-8',
      contentSha256: createHash('sha256').update('A short answer.').digest('hex'),
    });
  });
});
