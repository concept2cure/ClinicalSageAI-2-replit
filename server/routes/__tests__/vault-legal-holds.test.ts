/**
 * Legal holds can be placed and lifted, by the roles that run QA and
 * administration, on the organisation's own records, each change one
 * transaction with its chained audit row (security audit 2026-09-24, DP-20;
 * plan P1-22).
 *
 * Until 2026-09-26 vault.legal_holds existed and the retention sweep honoured
 * it, but nothing could write a hold: no route, no tool. Scaffold as
 * audit-trail-read-gate.test.ts: the session is set by a middleware, the pool
 * is a double keyed on the statements the routes issue, and the chained audit
 * writer is a recorder so the order BEGIN → write → COMMIT can be asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const recorder = vi.hoisted(() => {
  const HOLD = { id: 'h-1', organization_id: 7, reference: 'INSP-2026-09', reason: 'FDA inspection announced', scope: 'program', program_id: '11111111-1111-4111-8111-111111111111', document_id: null, placed_by: 2, placed_at: new Date('2026-09-26T09:00:00Z'), lifted_at: null, lifted_by: null, lift_reason: null };
  const r = {
    statements: [] as string[],
    audit: vi.fn(async (_client: unknown, _entry: unknown, _tenant?: unknown, _resource?: unknown) => {
      r.statements.push('AUDIT');
    }),
    targetExists: true,
    liftReturns: true,
    auditThrows: false,
    // The request's own client (req.dbClient, what requestPgClient returns):
    // the reads and the transaction go through it. Reads are answered but not
    // recorded, so the transaction order below is what is asserted. The router
    // no longer imports the shared pool, so the client lives here, not in a
    // module mock that would never run.
    client: {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (/FROM regulatory_programs|FROM vault\.documents/i.test(s)) return r.targetExists ? { rows: [{ id: 'x' }], rowCount: 1 } : { rows: [], rowCount: 0 };
        if (/^\s*SELECT[\s\S]*FROM vault\.legal_holds/i.test(s)) return { rows: [HOLD], rowCount: 1 };
        r.statements.push(s.trim().split(/\s+/).slice(0, 3).join(' '));
        if (/INSERT INTO vault\.legal_holds/i.test(s)) return { rows: [HOLD], rowCount: 1 };
        if (/UPDATE vault\.legal_holds/i.test(s)) return r.liftReturns ? { rows: [{ ...HOLD, lifted_at: new Date(), lifted_by: 2, lift_reason: 'Inspection closed' }], rowCount: 1 } : { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      }),
    },
  };
  return r;
});

// The shared pool is not what the router uses; a double stands in so nothing reaches a database.
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() }, db: {} }));
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: (client: unknown, entry: unknown, tenant?: unknown, resource?: unknown) => {
    if (recorder.auditThrows) throw new Error('chain unavailable');
    return recorder.audit(client, entry, tenant, resource);
  },
}));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ isPlatformAdmin: () => false }));

import { createVaultLegalHoldRoutes } from '../vault-legal-holds';

const PROGRAM = '11111111-1111-4111-8111-111111111111';

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 2, email: 'qa@acme.test', organizationId: 7, role, roles: [role] };
    (req as any).userId = 2;
    (req as any).tenantContext = { organizationId: 7 };
    (req as any).dbClient = recorder.client;
    next();
  });
  a.use('/api/vault/legal-holds', createVaultLegalHoldRoutes());
  return a;
}

beforeEach(() => {
  recorder.statements.length = 0;
  recorder.audit.mockClear();
  recorder.targetExists = true;
  recorder.liftReturns = true;
  recorder.auditThrows = false;
});
afterEach(() => vi.clearAllMocks());

const place = (role: string, body: Record<string, unknown> = {}) =>
  request(app(role)).post('/api/vault/legal-holds').send({ scope: 'program', programId: PROGRAM, reference: 'INSP-2026-09', reason: 'FDA inspection announced', ...body });

describe('placing a hold', () => {
  it('a member may not (403), and nothing is written', async () => {
    const r = await place('member');
    expect(r.status).toBe(403);
    expect(recorder.statements).toEqual([]);
  });

  it.each(['owner', 'admin', 'manager'])('%s places a program hold: one transaction, the hold, then its chained audit row, then COMMIT (201)', async (role) => {
    const r = await place(role);
    expect(r.status).toBe(201);
    expect(r.body.hold).toMatchObject({ id: 'h-1', scope: 'program', programId: PROGRAM, reference: 'INSP-2026-09' });
    expect(recorder.statements).toEqual(['BEGIN', 'INSERT INTO vault.legal_holds', 'AUDIT', 'COMMIT']);
    const [, entry, tenant, resource] = recorder.audit.mock.calls[0];
    expect(entry).toMatchObject({ action: 'vault.legal_hold.placed', userId: 2, resourceType: 'vault_legal_hold' });
    expect(tenant).toBe(7);
    expect(resource).toBe('h-1');
  });

  it('refuses a program the organisation does not own (404) and writes nothing', async () => {
    recorder.targetExists = false;
    const r = await place('admin');
    expect(r.status).toBe(404);
    expect(recorder.statements).toEqual([]);
  });

  it('refuses a body that names no target or no reason (400)', async () => {
    expect((await place('admin', { programId: undefined })).status).toBe(400);
    expect((await place('admin', { reason: '' })).status).toBe(400);
    expect((await place('admin', { scope: 'document', documentId: undefined })).status).toBe(400);
    expect(recorder.statements).toEqual([]);
  });

  it('rolls the hold back when its audit row cannot be written (500): a hold nobody can account for is not placed', async () => {
    recorder.auditThrows = true;
    const r = await place('admin');
    expect(r.status).toBe(500);
    expect(recorder.statements).toEqual(['BEGIN', 'INSERT INTO vault.legal_holds', 'ROLLBACK']);
    expect(JSON.stringify(r.body)).not.toMatch(/chain unavailable/);
  });
});

describe('lifting a hold', () => {
  const lift = (role: string, body: Record<string, unknown> = { liftReason: 'Inspection closed' }) =>
    request(app(role)).post('/api/vault/legal-holds/8c2ab0a4-6f1e-4d1a-9f0e-3a2b1c4d5e6f/lift').send(body);

  it('records who lifted it and why, with its chained audit row (200)', async () => {
    const r = await lift('manager');
    expect(r.status).toBe(200);
    expect(r.body.hold.liftReason).toBe('Inspection closed');
    expect(recorder.statements).toEqual(['BEGIN', 'UPDATE vault.legal_holds SET', 'AUDIT', 'COMMIT']);
    expect(recorder.audit.mock.calls[0][1]).toMatchObject({ action: 'vault.legal_hold.lifted', userId: 2 });
  });

  it('needs a reason (400), and a hold that is not active in this organisation is 404 with nothing committed', async () => {
    expect((await lift('admin', {})).status).toBe(400);
    recorder.liftReturns = false;
    const r = await lift('admin');
    expect(r.status).toBe(404);
    expect(recorder.statements).toEqual(['BEGIN', 'UPDATE vault.legal_holds SET', 'ROLLBACK']);
    expect(recorder.audit).not.toHaveBeenCalled();
  });

  it('a member may not (403)', async () => {
    expect((await lift('member')).status).toBe(403);
  });
});

describe('listing holds', () => {
  it('lists the organisation\'s holds for the same roles, and refuses a member', async () => {
    const r = await request(app('admin')).get('/api/vault/legal-holds');
    expect(r.status).toBe(200);
    expect(r.body.holds).toHaveLength(1);
    expect(r.body.holds[0]).toMatchObject({ id: 'h-1', reference: 'INSP-2026-09', active: true });
    expect((await request(app('member')).get('/api/vault/legal-holds')).status).toBe(403);
  });
});
