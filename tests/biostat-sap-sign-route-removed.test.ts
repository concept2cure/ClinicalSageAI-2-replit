/**
 * POST /api/biostat/sap/:sapVersionId/sign is not served (P-25 follow-up,
 * 2026-10-08).
 *
 * It took a signature from the request body (`signatureId`, `signerName`,
 * `method`, `timestamp`) and stamped the SAP version `approved`, with
 * `approvedBy` and `approvedAt`, without re-verifying anyone: a client-asserted
 * electronic signature. Nothing called it (no client, script or test), the
 * biostatistics platform is outside the launch catalog, and ci:sign-ceremony
 * could not see it (a Drizzle `.set({ approvedBy })`). Removed with the
 * service method behind it, CollaborativeSapService.signVersion. A SAP that
 * needs a signature goes through the platform's one ceremony
 * (services/part11/reverify-signer.ts), as every signing route does.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The router transitively imports services that touch the DB at module load.
vi.mock('../server/db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'where', 'update', 'set', 'insert', 'values']) chain[k] = () => chain;
  chain.returning = async () => [{ id: 7, status: 'approved' }];
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve([{ id: 7, organizationId: 7, signatureId: null }]).then(resolve);
  return { pool: { query: q, connect: vi.fn() }, getPool: () => ({ query: q, connect: vi.fn() }), db: chain, getDb: () => chain };
});

vi.mock('../server/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, organizationId: 7 };
      next();
    },
  };
});

const { default: biostatRouter } = await import('../server/routes/biostatPlatform');
const { CollaborativeSapService } = await import('../server/services/collaborative-sap-service');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const ASSERTED = {
  signatureId: 'sig-from-the-body',
  signerName: 'Anyone',
  signerTitle: 'Statistician',
  signerEmail: 'anyone@example.invalid',
  meaning: 'approval',
  timestamp: '2026-10-08T00:00:00.000Z',
  method: 'mfa',
};

describe('a SAP version is not signed by a route that verifies no signer', () => {
  it('POST /api/biostat/sap/:sapVersionId/sign is not a route: 404', async () => {
    const res = await request(app).post('/api/biostat/sap/7/sign').send(ASSERTED);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it('the SAP service has no signVersion to call', () => {
    expect('signVersion' in CollaborativeSapService.prototype).toBe(false);
  });
});
