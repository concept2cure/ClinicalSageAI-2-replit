/**
 * /api/stability — the create, update and status paths say what happened.
 *
 * Until 2026-09-22:
 *   · POST /studies wrote status 'DRAFT' when none was sent, which
 *     stab_studies_status_check (ONGOING | ON_HOLD | COMPLETED) rejects, and
 *     wrote 'PAUSED' verbatim — every create a client could send was a 500;
 *   · a storage condition other than LT/ACC/INT was written with an invented
 *     '5°C';
 *   · the create's audit record was written AFTER COMMIT on another
 *     connection, so an audit failure left a committed, unaudited study;
 *   · PUT /studies/:id and PATCH /studies/:id/status answered "updated
 *     successfully" and wrote nothing.
 *
 * The database behaviour is recorded against a real provisioned database in
 * docs/evidence/W2/2026-09-22/stability-router-honesty.txt. These cases pin
 * the branches that decide before any query runs.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
// The router's '../../db' is server/db.ts; from this file that is '../../../db'.
// Until 2026-09-23 this mocked '../../db' — server/src/db, which does not exist —
// so the mock never applied and "no connection was taken" held vacuously.
vi.mock('../../../db', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPool: () => ({ connect, query: vi.fn() }),
}));

const { explain } = vi.hoisted(() => ({ explain: vi.fn() }));
vi.mock('../../services/ai/stability.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  aiExplainStability: (...a: unknown[]) => explain(...a),
}));

import router, { toStabStudyStatus, STAB_PLANNED_CONDITIONS } from '../stability.router';
import { runWithTenantScope } from '../../../db/tenantStore';

function app(user: unknown = { id: 1, email: 'qa@example.test' }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = user;
    (req as any).tenantId = 1;
    next();
  });
  a.use('/api/stability', router);
  return a;
}
const body = (extra: Record<string, unknown> = {}) => ({
  productName: 'P', batchNumber: 'B', storageConditions: ['LT'], duration: 12, startDate: '2026-01-01', ...extra,
});

describe('study status is the table\'s vocabulary', () => {
  it('maps client words onto the constraint and defaults to the column default', () => {
    expect(toStabStudyStatus(undefined)).toBe('ONGOING');
    expect(toStabStudyStatus('')).toBe('ONGOING');
    expect(toStabStudyStatus('ACTIVE')).toBe('ONGOING');
    expect(toStabStudyStatus('paused')).toBe('ON_HOLD');
    expect(toStabStudyStatus('COMPLETED')).toBe('COMPLETED');
  });

  it('refuses a state the table cannot hold rather than storing a different one', () => {
    expect(toStabStudyStatus('DRAFT')).toBeNull();
    expect(toStabStudyStatus('CANCELLED')).toBeNull();
  });

  it('plans only the ICH Q1A conditions it has settings for', () => {
    expect(Object.keys(STAB_PLANNED_CONDITIONS).sort()).toEqual(['ACC', 'INT', 'LT']);
    expect(STAB_PLANNED_CONDITIONS.LT).toEqual({ temp: '25°C', rh: '60%' });
  });
});

describe('a create that cannot be recorded honestly is refused before any write', () => {
  it('400 for DRAFT, without taking a connection', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies').send(body({ status: 'DRAFT' }));
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('400 for a storage condition with no defined setting (no invented 5°C)', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies').send(body({ storageConditions: ['REF'] }));
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('401 without a verified actor, because the study could not be audited', async () => {
    connect.mockClear();
    const res = await request(app(null)).post('/api/stability/studies').send(body());
    expect(res.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('updates that are not implemented say so', () => {
  it('PUT /studies/:id is 501 and states nothing changed', async () => {
    const res = await request(app()).put('/api/stability/studies/x').send({ name: 'n' });
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/Nothing was changed/);
  });

  it('PATCH /studies/:id/status is 501, not "updated successfully"', async () => {
    const res = await request(app()).patch('/api/stability/studies/x/status').send({ status: 'COMPLETED' });
    expect(res.status).toBe(501);
    expect(JSON.stringify(res.body)).not.toMatch(/successfully/);
  });
});

/**
 * Every write and its audit record commit together (2026-09-23). Before, every
 * handler but the study create wrote its audit record after its change had
 * committed, on another connection: a failed audit left a committed, unaudited
 * change. The real-database proof — the old router keeps the change with no
 * audit row, the new one rolls it back — is
 * docs/evidence/W2/2026-09-23/stability-audited-writes.txt.
 */
describe('a write and its audit record commit together or not at all', () => {
  const scoped = (user: unknown = { id: 1, email: 'qa@example.test' }) => {
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = user;
      (req as any).tenantId = 1;
      runWithTenantScope({ tenantId: '1', role: 'admin', source: 'test', caller: 'stab-test' } as any, () => next());
    });
    a.use('/api/stability', router);
    return a;
  };
  /** A client whose statements succeed except the stab_audit insert. */
  const clientWithFailingAudit = () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (/INSERT INTO stab_audit/i.test(sql)) throw new Error('audit store unavailable');
        const S = '7f000000-0000-4000-8000-0000000000a1';
        if (/FOR UPDATE/i.test(sql)) return { rows: [{ study_id: S, cond_id: 'c1', description: 'old' }] };
        return { rows: [{ study_id: S, cond_id: 'c1', description: 'new' }] };
      }),
      release: vi.fn(),
    };
    return { client, statements };
  };

  it('rolls the change back when its audit record cannot be written', async () => {
    const { client, statements } = clientWithFailingAudit();
    connect.mockReset();
    connect.mockResolvedValue(client);
    const res = await request(scoped()).patch('/api/stability/conditions/7f000000-0000-4000-8000-0000000000c1').send({ description: 'x' });
    expect(res.status).toBe(500);
    expect(statements.some(s => /^UPDATE stab_conditions/i.test(s))).toBe(true);
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    // One connection: the change and its audit record are in the same transaction.
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('refuses an unsigned write of any kind before taking a connection', async () => {
    connect.mockClear();
    for (const [method, path] of [
      ['patch', '/api/stability/conditions/c1'],
      ['post', '/api/stability/studies/s1/results'],
      ['delete', '/api/stability/results/r1'],
      ['post', '/api/stability/studies/s1/capa'],
    ] as const) {
      const res = await (request(scoped(null)) as any)[method](path).send({ title: 't' });
      expect(res.status).toBe(401);
    }
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('imports record what the file says, or nothing', () => {
  const upload = (path: string, csv: string) =>
    request(app()).post(`/api/stability${path}`).attach('file', Buffer.from(csv), { filename: 'f.csv', contentType: 'text/csv' });

  it('refuses an excursion file whole when a row is unusable, before any write', async () => {
    connect.mockClear();
    const res = await upload(
      '/studies/s1/excursions/import',
      'timestamp,metric,value,low,high\n2026-03-01T08:00:00Z,TEMP,31.5,15,25\nnot-a-date,PRESSURE,x,15,25\n'
    );
    expect(res.status).toBe(422);
    expect(res.body.detail).toEqual([
      { line: 3, error: 'timestamp is not a date; metric must be TEMP or RH; value is not a number' },
    ]);
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses a results file with no rows instead of reporting an empty success', async () => {
    connect.mockClear();
    const res = await upload('/studies/s1/results/import', 'cond_kind,label,test_name,value\n');
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('routes whose columns no deployed database has say so', () => {
  it.each([
    ['get', '/api/stability/studies/s1/results/pending'],
    ['post', '/api/stability/results/r1/review'],
    ['post', '/api/stability/studies/s1/results/link-sample'],
    ['post', '/api/stability/studies/s1/results/link-by-code'],
  ] as const)('%s %s is 501', async (method, path) => {
    const res = await (request(app()) as any)[method](path).send({});
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/Nothing was changed/);
  });
});

/* 2026-09-28. The chain-of-custody upload wrote the file to /mnt/data/uploads
   — container disk, gone at the next replacement — and recorded a /uploads/…
   URL that no route serves, so the ledger pointed at bytes nobody could ever
   retrieve. No client calls it. Attachments belong in Vault, which stability
   samples cannot yet reach (a Vault document needs a regulatory program; that
   link is CMC schema work, outside the launch catalog). Until then it refuses
   and says where the file goes; a chain entry can cite the Vault document in
   its notes (POST /samples/:id/chain). */
describe('the chain-of-custody upload keeps no file it cannot keep', () => {
  it('is 501, reads no file, writes nothing, and names Vault', async () => {
    const res = await request(app())
      .post('/api/stability/samples/11111111-1111-4111-8111-111111111111/chain/upload')
      .attach('file', Buffer.from('%PDF-1.4 test'), 'coc.pdf');
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/Nothing was stored/);
    expect(res.body.message).toMatch(/Vault/);
    expect(connect).not.toHaveBeenCalled();
  });
});

/** Review of 2026-09-23: the findings its verifiers were cut off from confirming, each confirmed and fixed. */
describe('study-scoped writes act only on the tenant\'s own study', () => {
  const scoped = () => {
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 1, email: 'qa@example.test' };
      (req as any).tenantId = 7;
      runWithTenantScope({ tenantId: '7', role: 'editor', source: 'test', caller: 'stab-test' } as any, () => next());
    });
    a.use('/api/stability', router);
    return a;
  };
  const recording = (studyVisible: boolean) => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/from stab_studies/i.test(sql)) return { rows: studyVisible ? [{ study_id: 's1', code: 'C', name: 'N' }] : [] };
        return { rows: [{ study_id: 's1', capa_id: 'k1' }], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    connect.mockReset();
    connect.mockResolvedValue(client);
    return calls;
  };

  it('is 404 for a study outside the tenant, and writes nothing — not even an audit record', async () => {
    const calls = recording(false);
    const res = await request(scoped()).post('/api/stability/studies/7f000000-0000-4000-8000-00000000abcd/capa').send({ title: 'x' });
    expect(res.status).toBe(404);
    const check = calls.find(c => /from stab_studies/i.test(c.sql));
    expect(check?.sql).toMatch(/study_id = \$1::uuid and tenant_id = \$2/);
    expect(check?.params).toEqual(['7f000000-0000-4000-8000-00000000abcd', 7]);
    expect(calls.some(c => /insert into (stab_capa|stab_audit)/i.test(c.sql))).toBe(false);
    expect(calls.map(c => c.sql)).toContain('ROLLBACK');
  });

  it('checks the study before the write on every study-scoped route', async () => {
    for (const [path, body] of [
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/conditions', { kind: 'LT', temp: '25C' }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/timepoints', { label: '3M', month: 3 }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/results', { cond_id: 'c', tp_id: 't', test_id: 'x' }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/assign', { user_id: '2', role: 'Analyst' }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/apply-protocol', { proto_id: 'p' }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/timepoints/bulk-assign', { user_id: '2' }],
      ['/api/stability/studies/7f000000-0000-4000-8000-000000000009/schedule', {}],
    ] as const) {
      const calls = recording(false);
      const res = await request(scoped()).post(path).send(body);
      expect(res.status, path).toBe(404);
      expect(calls.some(c => /^\s*(insert|update|delete)/i.test(c.sql)), path).toBe(false);
    }
  });
});

describe('attribution and governed content are not taken from the caller or a model', () => {
  it('refuses a sample collected "by" someone other than the signed-in user', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies/s1/samples/collect').send({ sample_id: 'x', collected_by: 'someone.else@example.test' });
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('no longer writes a model recommendation into label storage', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies/s1/ai/label').send({});
    expect(res.status).toBe(410);
    expect(res.body.message).toMatch(/Nothing was changed/);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('child rows and model calls answer for what they are', () => {
  const scoped = () => {
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).user = { id: 1, email: 'qa@example.test' };
      (req as any).tenantId = 7;
      runWithTenantScope({ tenantId: '7', role: 'editor', source: 'test', caller: 'stab-test' } as any, () => next());
    });
    a.use('/api/stability', router);
    return a;
  };
  const S = '7f000000-0000-4000-8000-0000000000aa';
  const C = '7f000000-0000-4000-8000-0000000000cc';

  it('edits a condition only after finding it under the tenant and locking its study', async () => {
    const calls: string[] = [];
    connect.mockReset();
    connect.mockResolvedValue({
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [] }; // not this tenant's
      }),
      release: vi.fn(),
    });
    const res = await request(scoped()).patch(`/api/stability/conditions/${C}`).send({ description: 'x' });
    expect(res.status).toBe(404);
    expect(calls.find(q => /from stab_conditions/i.test(q))).toMatch(/cond_id = \$1::uuid and tenant_id = \$2/);
    expect(calls.some(q => /^\s*update/i.test(q))).toBe(false);
    expect(calls).toContain('ROLLBACK');
  });

  it('says nothing was generated when the model fails, instead of canned text', async () => {
    connect.mockReset();
    connect.mockResolvedValue({
      query: vi.fn(async (sql: string) => ({ rows: /from stab_studies/i.test(sql) ? [{ study_id: S, code: 'C', name: 'N' }] : [] })),
      release: vi.fn(),
    });
    explain.mockRejectedValue(new Error('No AI provider is configured in production'));
    const res = await request(scoped()).post(`/api/stability/studies/${S}/ai/explain`).send({});
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/nothing was generated/);
    // The model was handed the study's recorded data, not only its id.
    expect(explain.mock.calls[0][0]).toMatchObject({ study: { study_id: S }, results: [], assessments: [] });
  });
});
