/**
 * POST /api/submissions/sequences/:seqId/assemble answers for its audit row.
 *
 * `assembleSequence` records an ECTD_ASSEMBLE row (21 CFR Part 11 §11.10(e)) for
 * every assembly, and an ECTD_ASSEMBLE_BLOCKED row for every refusal, and returns
 * what happened to that row. The route dropped both:
 *   - a successful assembly's response carried no `auditTrail`, so a caller could
 *     not tell an assembly that was recorded from one that was not;
 *   - a refused assembly (a leaf path that escapes the staging root) threw
 *     `EctdAssemblyBlockedError`, which carries no `code`, so `fail()` answered it
 *     as `500 INTERNAL "Request failed."`. That turned a refusal into an outage and
 *     dropped the record that the refusal happened.
 * Handed on by the WO-16C audit-outcome lane (docs/work-orders/README.md,
 * "eCTD callers").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-assemble-audit-secret-32-chars';
});

const asm = vi.hoisted(() => ({ impl: (async () => ({})) as (...a: unknown[]) => Promise<unknown> }));
vi.mock('../../services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ectd/assemble-from-core')>();
  return { ...actual, assembleSequence: (...a: unknown[]) => asm.impl(...a) };
});

import request from 'supertest';
import express from 'express';
import { EctdAssemblyBlockedError } from '../../services/ectd/assemble-from-core';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const assembled = (auditTrail: unknown) => ({
  bundle: { sha256: 'a'.repeat(64), format: 'zip', sizeBytes: 1024 },
  materialized: 2,
  skipped: [],
  unresolvedLeaves: [],
  unfinalized: 0,
  unfinalizedSections: [],
  cleanup: async () => {},
  auditTrail,
});

beforeEach(() => {
  asm.impl = async () => assembled({ persisted: true });
});

describe('the assemble route reports its audit row', () => {
  it('carries the outcome of a recorded assembly', async () => {
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body.auditTrail).toEqual({ persisted: true });
  });

  it('says so when the assembly was not recorded', async () => {
    asm.impl = async () => assembled({ persisted: false, code: 'AUDIT_WRITE_FAILED' });
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body.auditTrail).toEqual({ persisted: false, code: 'AUDIT_WRITE_FAILED' });
  });

  it('answers a refused assembly as a refusal, with the record of it', async () => {
    asm.impl = async () => {
      throw new EctdAssemblyBlockedError('eCTD assembly blocked: 1 leaf path-safety violation(s): x.pdf:ESCAPES_ROOT', {
        persisted: true,
      } as never);
    };
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ECTD_ASSEMBLE_BLOCKED');
    expect(res.body.error.message).toMatch(/path-safety/);
    expect(res.body.auditTrail).toEqual({ persisted: true });
  });
});
