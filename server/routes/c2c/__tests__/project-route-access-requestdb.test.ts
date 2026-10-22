/** Actual parent policy + request-pinned SQL control flow; no native RLS claim. */
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../../db/runtime';
import { MissingRequestDbContextError, type RequestSqlClient } from '../../../db/requestDb';
import { writeChainedAuditRow } from '../../../services/auditService';
import {
  installProjectRouteAccess, requireProjectRouteAccess, withProjectWriteReservation,
} from '../project-route-access';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function auditFixtureRows(sql: string, failAudit: boolean): { rows: Record<string, unknown>[] } | null {
  if (sql.includes('pg_attribute')) return { rows: [{ present: true }] };
  if (['pg_advisory_xact_lock', 'SELECT set_config', 'SELECT sha256_chain'].some(fragment => sql.includes(fragment))) {
    return { rows: [] };
  }
  if (!sql.includes('INSERT INTO audit_logs')) return null;
  if (failAudit) throw new Error('QA audit insert refused');
  return { rows: [] };
}

function tenantClient(options: { role?: string; documentOrganization?: number | null; failAudit?: boolean } = {}) {
  return {
    release: vi.fn(),
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (sql.includes('SELECT ou.role')) return { rows: [{ role: options.role ?? 'member' }] };
      if (sql.includes('SELECT lead_user_id')) return { rows: [{ lead_user_id: 5 }] };
      if (sql.includes('SELECT id FROM regulatory_programs')) return { rows: [{ id: PROGRAM }] };
      if (sql.includes('client_workspace_id AS "clientWorkspaceId"')) return { rows: [{ id: 11, clientWorkspaceId: 71 }] };
      if (sql.includes('FROM projects p LEFT JOIN project_visibility_settings')) return { rows: [{
        id: 11, owner_id: 5, created_by_id: 5, settings: {}, visibility: 'private', members: [], review_assigned: false,
      }] };
      if (sql.includes('SELECT organization_id FROM vault.documents')) return { rows: [{
        organization_id: options.documentOrganization === undefined ? 7 : options.documentOrganization,
      }] };
      const audit = auditFixtureRows(sql, options.failAudit === true);
      if (audit) return audit;
      if (sql === 'UPDATE qa_project_work SET value=$1') return { rows: [{ value: 'saved QA value' }] };
      throw new Error(`Unexpected project admission SQL: ${sql}`);
    }),
  } satisfies RequestSqlClient & { release: ReturnType<typeof vi.fn> };
}

function actorRequest(client?: RequestSqlClient, method = 'GET'): Request {
  return { method, params: { id: PROGRAM }, user: { id: 5, organizationId: 7, role: 'member' },
    ...(client ? { dbClient: client } : {}),
  } as unknown as Request;
}
const response = () => ({ locals: {} }) as Response;

beforeEach(() => {
  vi.spyOn(getPool(), 'query').mockRejectedValue(new Error('A request escaped to pooled SQL'));
  vi.spyOn(getPool(), 'connect').mockRejectedValue(new Error('A request escaped to a pooled connection'));
});

function expectNoPoolEscape(): void {
  expect(getPool().query).not.toHaveBeenCalled();
  expect(getPool().connect).not.toHaveBeenCalled();
}

describe('project parent admission uses the actual request SQL executor', () => {
  it('reads current actor, exact anchor and sharing through the pinned client', async () => {
    const client = tenantClient();
    const res = response();
    await expect(requireProjectRouteAccess(actorRequest(client), res, { kind: 'projects' }))
      .resolves.toMatchObject({ actor: { userId: 5, role: 'member' }, programId: PROGRAM, projectId: 11 });
    expect(client.query).toHaveBeenCalledTimes(4);
    // Current actor reads explicitly refuse pending-deletion organizations.
    expect(client.query.mock.calls[1][1]).toEqual([7, 5, false]);
    expect(client.query.mock.calls[2][1]).toEqual([PROGRAM, 7]);
    expect(client.query.mock.calls[3][1]).toEqual([7, 5, 11]);
    expect(res.locals.currentProgramAccess).toMatchObject({ projectId: 11 });
    expectNoPoolEscape();
  });

  it('retains an explicitly supplied transaction executor instead of substituting the request client', async () => {
    const unused = tenantClient();
    const transaction = tenantClient();
    await expect(requireProjectRouteAccess(actorRequest(unused), response(), {
      kind: 'projects', executor: transaction, forShare: true,
    })).resolves.toMatchObject({ projectId: 11 });
    expect(transaction.query.mock.calls[1][0]).toContain('FOR SHARE OF ou,u,o');
    expect(unused.query).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });

  it('refuses missing request context before any parent SQL without a pool fallback', async () => {
    await expect(requireProjectRouteAccess(actorRequest(), response(), { kind: 'projects' }))
      .rejects.toBeInstanceOf(MissingRequestDbContextError);
    expectNoPoolEscape();
  });
});

function vaultApp(client?: RequestSqlClient) {
  const app = express();
  const child = vi.fn();
  app.use((req, _res, next) => {
    Object.assign(req, { user: { id: 5, organizationId: 7, role: 'member' }, ...(client ? { dbClient: client } : {}) });
    next();
  });
  const router = express.Router();
  installProjectRouteAccess(router, 'vault');
  router.get('/:id/documents/:documentId', (_req, res) => {
    child();
    res.json({ document: DOCUMENT });
  });
  app.use('/vault', router);
  return { app, child };
}

describe('Vault identity follows current parent admission on the same request client', () => {
  it.each([
    { tenant: 7, status: 200 }, { tenant: null, status: 409 }, { tenant: 8, status: 404 },
  ])('answers $status for recorded document organization $tenant', async ({ tenant, status }) => {
    const client = tenantClient({ documentOrganization: tenant });
    const { app, child } = vaultApp(client);
    const res = await request(app).get(`/vault/${PROGRAM}/documents/${DOCUMENT}`);
    expect(res.status).toBe(status);
    expect(client.query.mock.calls.at(-1)?.[1]).toEqual([DOCUMENT, PROGRAM, 7]);
    expect(child).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
    expectNoPoolEscape();
  });

  it('returns honest unavailability and no document when request context is absent', async () => {
    const { app, child } = vaultApp();
    const res = await request(app).get(`/vault/${PROGRAM}/documents/${DOCUMENT}`);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(res.body.document).toBeUndefined();
    expect(child).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });
});

async function auditedOperation(q: RequestSqlClient): Promise<void> {
  await q.query('UPDATE qa_project_work SET value=$1', ['saved QA value']);
  await writeChainedAuditRow(q, { tenantId: 7, userId: 5, action: 'qa.project.update',
    resourceType: 'qa_project_work', resourceId: PROGRAM, details: { value: 'saved QA value' } });
}

describe('project writer owns its transaction on the request-pinned connection', () => {
  it('opens one transaction, locks current membership, writes and audits before commit without releasing the request client', async () => {
    const client = tenantClient();
    const req = actorRequest(client);
    await requireProjectRouteAccess(req, response(), { kind: 'projects' });
    expect(client.query.mock.calls.some(([sql]) => sql === 'BEGIN')).toBe(false);
    req.method = 'POST';
    await withProjectWriteReservation(req, response(), auditedOperation);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    const begin = statements.indexOf('BEGIN');
    const lock = statements.findIndex(sql => sql.includes('FOR SHARE OF ou,u,o'));
    const lead = statements.findIndex(sql => sql.includes('SELECT lead_user_id') && sql.includes('FOR SHARE'));
    const mutation = statements.indexOf('UPDATE qa_project_work SET value=$1');
    const chain = statements.findIndex(sql => sql.includes('pg_advisory_xact_lock'));
    const audit = statements.findIndex(sql => sql.includes('INSERT INTO audit_logs'));
    expect([begin, lock, lead, mutation, chain, audit].every(index => index >= 0)).toBe(true);
    expect(begin).toBeLessThan(lock);
    expect(lock).toBeLessThan(lead);
    expect(lead).toBeLessThan(mutation);
    expect(mutation).toBeLessThan(chain);
    expect(chain).toBeLessThan(audit);
    expect(statements.at(-1)).toBe('COMMIT');
    expect(statements.filter(sql => sql === 'BEGIN')).toHaveLength(1);
    expect(statements).not.toContain('ROLLBACK');
    expect(client.release).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });

  it('rolls back instead of committing when the actual chained audit writer fails', async () => {
    const client = tenantClient({ failAudit: true });
    await expect(withProjectWriteReservation(actorRequest(client, 'POST'), response(), auditedOperation))
      .rejects.toThrow('QA audit insert refused');
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain('UPDATE qa_project_work SET value=$1');
    expect(statements.some(sql => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(client.release).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });

  it('refuses a current viewer despite a stale member principal before operation or audit', async () => {
    const client = tenantClient({ role: 'viewer' });
    const operation = vi.fn(auditedOperation);
    await expect(withProjectWriteReservation(actorRequest(client, 'POST'), response(), operation))
      .rejects.toMatchObject({ status: 403, code: 'PROJECT_WRITE_ACCESS_DENIED' });
    expect(operation).not.toHaveBeenCalled();
    expect(client.query.mock.calls.some(([sql]) => sql.includes('FOR SHARE OF ou,u,o'))).toBe(true);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(client.release).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });

  it('refuses a writer with no pinned request context before BEGIN or callback', async () => {
    const operation = vi.fn(auditedOperation);
    await expect(withProjectWriteReservation(actorRequest(undefined, 'POST'), response(), operation))
      .rejects.toBeInstanceOf(MissingRequestDbContextError);
    expect(operation).not.toHaveBeenCalled();
    expectNoPoolEscape();
  });
});
