/** Actual Express accept route over loopback HTTP. The request-db lookup is a
 * sentinel: gate-passing cases stop there and never represent an acceptance. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import request from 'supertest';

const seam = vi.hoisted(() => ({ requestDb: vi.fn(), execute: vi.fn() }));
vi.mock('../../db/requestDb', () => ({ requestDb: seam.requestDb }));
import createBatchDraftRoutes from '../batch-draft-routes';

const stoppedBeforeDatabase = new Error('FIXTURE_REQUEST_DB_LOOKUP_SENTINEL');
const content = 'Draft text for a reported-termination boundary check.';
function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { user: { id: 3, organizationId: 7, name: 'Fixture Reviewer', role: 'reviewer' } });
    next();
  });
  instance.use('/api/batch-draft', createBatchDraftRoutes());
  const sentinel: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error === stoppedBeforeDatabase) {
      res.status(418).json({ fixture: 'PAST_CUTOFF_GATE_BEFORE_DATABASE', accepted: false });
      return;
    }
    res.status(500).json({ fixture: 'UNEXPECTED_HANDLER_ERROR', accepted: false });
  };
  instance.use(sentinel);
  return instance;
}
beforeEach(() => {
  vi.resetAllMocks();
  seam.requestDb.mockImplementation(() => { throw stoppedBeforeDatabase; });
});
async function send(termination: Record<string, unknown>) {
  return request(app()).post('/api/batch-draft/documents/1/accept').send({ content, ...termination });
}
async function expectRefused(termination: Record<string, unknown>, reason: string | null) {
  const response = await send(termination);
  expect(response.status).toBe(422);
  expect(response.body).toMatchObject({ success: false, code: 'DRAFT_TRUNCATED', finishReason: reason });
  expect(response.body.error).toMatch(/incomplete|cut off/i);
  expect(seam.requestDb).not.toHaveBeenCalled();
  expect(seam.execute).not.toHaveBeenCalled();
}

describe('actual accept route refuses reported cutoff before request-db lookup', () => {
  it.each(['max_tokens', 'length', 'chunk_timeout'])('a false flag cannot override snake_case reason %s', async finish_reason => {
    await expectRefused({ finish_reason, truncated: false }, finish_reason);
  });
  it.each(['max_tokens', 'length', 'chunk_timeout'])('an absent flag cannot hide snake_case reason %s', async finish_reason => {
    await expectRefused({ finish_reason }, finish_reason);
  });
  it.each(['end_turn', 'unknown', undefined])('explicit true refuses even with finish reason %s', async finish_reason => {
    await expectRefused({ finish_reason, truncated: true }, finish_reason ?? null);
  });
  it('uses the canonical whitespace-trimmed cutoff vocabulary', async () => {
    await expectRefused({ finish_reason: '  max_tokens  ', truncated: false }, 'max_tokens');
  });
});

describe('actual accept cutoff gate preserves unconfirmed and legacy compatibility', () => {
  it.each(['end_turn', 'stop', 'stop_sequence', 'unknown', 'unrecognized_vendor_reason', undefined, null])(
    'reported reason %s with false flag passes only the cutoff gate', async finish_reason => {
      const response = await send({ finish_reason, truncated: false });
      expect(response.status).toBe(418);
      expect(response.body).toEqual({ fixture: 'PAST_CUTOFF_GATE_BEFORE_DATABASE', accepted: false });
      expect(seam.requestDb).toHaveBeenCalledTimes(1);
      expect(seam.execute).not.toHaveBeenCalled();
    },
  );
  it('does not add a new rejection for an entirely absent termination report', async () => {
    const response = await send({});
    expect(response.status).toBe(418);
    expect(response.body.accepted).toBe(false);
    expect(seam.requestDb).toHaveBeenCalledTimes(1);
    expect(seam.execute).not.toHaveBeenCalled();
  });
});
