/**
 * The sequence assemble route answers a busy converter 503 with Retry-After
 * (MR-03 Stage 2 step 5).
 *
 * POST /api/submissions/sequences/:seqId/assemble runs the canonical assembler,
 * which converts every PDF leaf to PDF/A through Ghostscript inside a
 * conversion slot. When no slot frees within CONVERTER_QUEUE_TIMEOUT_MS the
 * assembler rejects with ConversionCapacityError. The route answers errors
 * through its own `fail()` (server/routes/submissions.ts), which knew nothing of
 * it: the code CONVERTER_BUSY is not in its table, so the answer was 500.
 * The freeze, dispatch and transmit routes answer through the same `fail()`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'conversion-capacity-submissions-secret-32-chars';
});

const asm = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ectd/assemble-from-core')>();
  const { ConversionCapacityError } = await import('../conversion-slots');
  return {
    ...actual,
    assembleSequence: async () => {
      asm.calls += 1;
      throw new ConversionCapacityError('ghostscript', 120_000, 2);
    },
  };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../../routes/submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

describe('POST /api/submissions/sequences/:seqId/assemble with every conversion slot busy', () => {
  it('answers 503 with Retry-After and says the converter is busy', async () => {
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(asm.calls).toBe(1);
    expect(res.status, `answered ${res.status} ${JSON.stringify(res.body)}`).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body.error).toBe('CONVERTER_BUSY');
    expect(res.body.message).toMatch(/converter is busy/i);
    // Not a dry-run result with nothing in it.
    expect(res.body).not.toHaveProperty('ok');
    expect(res.body).not.toHaveProperty('materialized');
  });
});
