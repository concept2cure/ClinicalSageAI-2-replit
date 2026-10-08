/**
 * POST /api/submissions/sequences/:seqId/assemble is a dry run, and says so
 * (P-27 follow-up, 2026-10-08).
 *
 * The route assembles a sequence to report what the package would hold and what
 * transmit would refuse. It filled the backbone's identity from the request body
 * or from UNASSIGNED placeholders, and answered `{ ok, sha256, … }` — a digest a
 * caller could record as the package's, for bytes it deletes before answering.
 * A package names only recorded identity (package-identity.ts), and this route
 * produces no package, so:
 *   - it asks the assembler for a dry run (the one dry-run identity) and takes
 *     no identity from the body: a body naming applicationId / sponsorId /
 *     sponsorName is refused, rather than silently ignored;
 *   - its answer says it is a dry run and that no package was produced, and
 *     carries no sha256 a caller could record as a package digest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-assemble-dry-run-secret-32-chars';
});

const asm = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock('../../services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ectd/assemble-from-core')>();
  return {
    ...actual,
    assembleSequence: async (params: Record<string, unknown>) => {
      asm.calls.push(params);
      return {
        dryRun: params.dryRun === true,
        bundle: { sha256: 'a'.repeat(64), format: 'zip', sizeBytes: 1024 },
        materialized: 2, skipped: [], unresolvedLeaves: [], unfinalized: 0, unfinalizedSections: [],
        cleanup: async () => {}, auditTrail: { persisted: true },
      };
    },
  };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeEach(() => {
  asm.calls.length = 0;
});

describe('the sequence assemble route is a dry run (P-27)', () => {
  it('asks for a dry run, names no identity, and says no package was produced', async () => {
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(res.status).toBe(200);
    expect(asm.calls).toHaveLength(1);
    expect(asm.calls[0]).toMatchObject({ sequenceId: 11, organizationId: 7, dryRun: true });
    expect(asm.calls[0]).not.toHaveProperty('applicationId');
    expect(asm.calls[0]).not.toHaveProperty('sponsorName');
    expect(res.body.dryRun).toBe(true);
    expect(res.body.packageProduced).toBe(false);
    expect(res.body.notice).toMatch(/dry run/i);
    expect(res.body.notice).toMatch(/not a package/i);
    // No digest a caller could record as the package's: the bytes are discarded.
    expect(res.body).not.toHaveProperty('sha256');
  });

  it('refuses a body that names the application or the applicant, and assembles nothing', async () => {
    for (const body of [{ applicationId: '123456' }, { sponsorId: 'D-U-N-S' }, { sponsorName: 'Someone' }]) {
      const res = await request(app).post('/api/submissions/sequences/11/assemble').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DRY_RUN_TAKES_NO_IDENTITY');
    }
    expect(asm.calls).toHaveLength(0);
  });
});
