/**
 * The IND section stream reports a failure with a fixed message.
 *
 * POST /api/ind/applications/:id/stream/:sectionCode caught a failed
 * generation and wrote `{ error: err.message }` into the event stream — the
 * caught error's own text (a store message, a gateway refusal, a stack-adjacent
 * detail) sent to the browser. The error goes to the log; the stream carries a
 * static sentence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { streamSectionContent, logError } = vi.hoisted(() => ({
  streamSectionContent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../db', () => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../services/indCopilot.js', () => ({ default: { streamSectionContent } }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: logError }),
}));

import indRouter from '../ind';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { tenantId: number }).tenantId = 1;
    next();
  });
  a.use('/api/ind', indRouter);
  return a;
}

beforeEach(() => {
  streamSectionContent.mockReset();
  logError.mockReset();
});

describe('IND section stream: a failure is a fixed message, the detail is logged', () => {
  it('does not write the caught error text into the stream', async () => {
    streamSectionContent.mockRejectedValue(new Error('relation "ind_references" does not exist at db-7.internal'));
    const res = await request(app()).post('/api/ind/applications/sub-1/stream/5.3').send({});
    expect(res.text).not.toContain('db-7.internal');
    expect(res.text).toContain('"error":"Content generation failed."');
    expect(JSON.stringify(logError.mock.calls)).toContain('db-7.internal');
  });

  it('control: a stream that succeeds ends with [DONE]', async () => {
    streamSectionContent.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Section text' } }] };
      })(),
    );
    const res = await request(app()).post('/api/ind/applications/sub-1/stream/5.3').send({});
    expect(res.text).toContain('Section text');
    expect(res.text).toContain('[DONE]');
  });
});
