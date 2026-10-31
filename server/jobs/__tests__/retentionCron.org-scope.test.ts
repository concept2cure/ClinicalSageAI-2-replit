/**
 * The retention sweep runs once per organisation, in that organisation's own
 * scope (P-72 slice 1b; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * runRetentionSweep read vault.documents, vault.retention_policies and
 * vault.legal_holds in the system scope (tenant '0', no organisation uuid).
 * vault.documents decides through core.can_access_program on the organisation
 * uuid, so on a production-shaped database the sweep scanned 0 of 2 expired
 * documents: the Vault's retention never ran. It saw the legal holds only
 * through the platform arm of their policy, which P-72 removes.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * - Each organisation's documents and holds are read inside its own scope
 *   (tenant id AND organisation uuid, no role), never the system scope; only
 *   the organisation list and the policies (no tenant key) are read there.
 * - The documents read is the programmes the organisation owns; the holds read
 *   is the organisation's own. A hold is placed only by the programme's owner
 *   (routes/vault-legal-holds.ts targetOwned), so the owner's scope sees every
 *   hold that can cover what it sweeps.
 * - A document naming another organisation than its programme's owner is left
 *   in place and counted: no one scope reads the owner's holds and can audit
 *   the disposal under the document's own organisation.
 * - An organisation with no uuid is not swept, and the job says so.
 * The production-shaped proof (real policies, a non-superuser owner, with and
 * without the platform arm) is the slice's probe, filed with its evidence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { getTableName, type SQL } from 'drizzle-orm';

type Scope = { tenantId: string; orgUuid?: string | null; role?: string | null; source?: string; caller?: string; system?: true };

const h = vi.hoisted(() => ({
  scope: null as Scope | null,
  scopes: [] as Scope[],
  /** Every db.select(): the table, the rendered WHERE, and the scope it ran in. */
  reads: [] as Array<{ table: string; sql: string; params: unknown[]; scope: Scope | null }>,
  /** Every statement on a disposition client, with the scope it ran in. */
  statements: [] as Array<{ text: string; scope: Scope | null }>,
  orgs: [] as Array<{ id: number; uuid: string | null }>,
  docs: new Map<string, unknown[]>(),
  holds: new Map<string, unknown[]>(),
  programOrg: 7 as number | null,
  audit: vi.fn(async (_client: unknown, _entry: unknown, _tenant?: unknown, _resource?: unknown) => undefined),
  alert: vi.fn((..._a: unknown[]) => undefined),
}));

function enter<T>(scope: Scope, fn: () => T): T {
  h.scopes.push(scope);
  const outer = h.scope;
  h.scope = scope;
  const result = fn();
  if (result && typeof (result as { then?: unknown }).then === 'function') {
    return (result as unknown as Promise<unknown>).finally(() => { h.scope = outer; }) as unknown as T;
  }
  h.scope = outer;
  return result;
}

vi.mock('../../db/tenantStore', () => ({
  runWithSystemTenantScope: (caller: string, fn: () => unknown) => enter({ tenantId: '0', role: 'app_super_admin', caller, system: true }, fn),
  runWithTenantScope: (scope: Scope, fn: () => unknown) => enter(scope, fn),
}));

vi.mock('../../db', async () => {
  const dialect = new PgDialect();
  const select = () => {
    let table = '';
    let where: SQL | undefined;
    const chain: any = {
      from: (t: any) => { table = getTableName(t); return chain; },
      where: (w: SQL) => { where = w; return chain; },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const q = where ? dialect.sqlToQuery(where) : { sql: '', params: [] };
        h.reads.push({ table, sql: q.sql, params: q.params, scope: h.scope });
        const tenant = h.scope?.tenantId ?? '';
        const rows = table === 'documents' ? h.docs.get(tenant) ?? [] : table === 'legal_holds' ? h.holds.get(tenant) ?? [] : [];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };
  const client = {
    query: vi.fn(async (text: string) => {
      const s = String(text).trim();
      h.statements.push({ text: s.split(/\s+/).slice(0, 3).join(' '), scope: h.scope });
      if (/FROM regulatory_programs/i.test(s)) return { rows: h.programOrg === null ? [] : [{ organization_id: h.programOrg }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return {
    db: { select },
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(async (text: string) => {
        h.statements.push({ text: String(text).trim().split(/\s+/).slice(0, 3).join(' '), scope: h.scope });
        return /FROM public\.organizations/i.test(String(text)) ? { rows: h.orgs } : { rows: [] };
      }),
    },
  };
});
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: (client: unknown, entry: unknown, tenant?: unknown, resource?: unknown) => h.audit(client, entry, tenant, resource),
}));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: (...a: unknown[]) => h.alert(...a) }));
vi.mock('../../services/emailService', () => ({ sendGenericEmail: vi.fn(async () => true) }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import { runRetentionJob, runRetentionSweep } from '../retentionCron';

const UUID_A = '73629479-bb69-405d-9ff0-b7b8150eca13';
const UUID_B = 'c63e801a-76ba-4b5e-be47-9d6792367291';
const PROGRAM_A = '11111111-1111-1111-1111-111111111111';
const PROGRAM_B = '33333333-3333-3333-3333-333333333333';
const expired = (id: string, programId: string, over: Record<string, unknown> = {}) => ({
  id, programId, documentCode: id, documentTitle: id, documentType: 'protocol',
  retentionPolicy: null, retentionUntil: '2020-01-01', deletedAt: null, ...over,
});
const readsOf = (table: string) => h.reads.filter((r) => r.table === table);

beforeEach(() => {
  h.scope = null;
  h.scopes = [];
  h.reads = [];
  h.statements = [];
  h.orgs = [{ id: 7, uuid: UUID_A }, { id: 8, uuid: UUID_B }];
  h.docs = new Map();
  h.holds = new Map();
  h.programOrg = 7;
  h.audit.mockClear();
  h.alert.mockClear();
});

describe('each organisation is swept in its own scope', () => {
  it('reads each organisation\'s documents and holds in its tenant id AND uuid scope, with no role', async () => {
    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ organizations: 2, organizationsNotSwept: 0 });
    for (const table of ['documents', 'legal_holds']) {
      expect(readsOf(table).map((r) => r.scope)).toEqual([
        expect.objectContaining({ tenantId: '7', orgUuid: UUID_A, role: null, source: 'job' }),
        expect.objectContaining({ tenantId: '8', orgUuid: UUID_B, role: null, source: 'job' }),
      ]);
      // Never the system scope: there, vault.documents admits nothing and the holds only through the platform arm.
      expect(readsOf(table).some((r) => r.scope?.system)).toBe(false);
    }
    // Only the organisation list and the policies (no tenant key) are read in the system scope.
    expect(readsOf('retention_policies').map((r) => r.scope?.system)).toEqual([true]);
    expect(h.statements.filter((s) => s.text.startsWith('SELECT id, uuid::text')).map((s) => s.scope?.system)).toEqual([true]);
  });

  it('reads the programmes the organisation owns, and only its own active holds', async () => {
    await runRetentionSweep();

    const [docsA] = readsOf('documents');
    expect(docsA.sql).toMatch(/"program_id" IN \(SELECT rp\.id FROM regulatory_programs rp WHERE rp\.organization_id = \$\d+\)/);
    expect(docsA.params).toContain(7);
    const [holdsA] = readsOf('legal_holds');
    expect(holdsA.sql).toMatch(/"lifted_at" is null/i);
    expect(holdsA.sql).toMatch(/"organization_id" = \$\d+/);
    expect(holdsA.params).toEqual([7]);
  });

  it('disposes of each organisation\'s document inside that organisation\'s scope, audited under it', async () => {
    h.docs.set('8', [expired('doc-b', PROGRAM_B)]);
    h.programOrg = 8;

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ scanned: 1, softDeleted: 1, errors: 0 });
    const tx = h.statements.filter((s) => ['BEGIN', 'COMMIT'].includes(s.text) || s.text.startsWith('UPDATE vault.documents'));
    expect(tx.map((s) => [s.text.split(' ')[0], s.scope?.tenantId, s.scope?.orgUuid])).toEqual([
      ['BEGIN', '8', UUID_B], ['UPDATE', '8', UUID_B], ['COMMIT', '8', UUID_B],
    ]);
    expect(h.audit.mock.calls[0][2]).toBe(8);
  });

  it('an organisation\'s hold stops disposition of its own expired document, and not another organisation\'s', async () => {
    h.docs.set('7', [expired('doc-a', PROGRAM_A)]);
    h.docs.set('8', [expired('doc-b', PROGRAM_B)]);
    h.holds.set('7', [{ programId: PROGRAM_A, documentId: null }]);
    h.programOrg = 8;

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ scanned: 2, heldByLegalHold: 1, softDeleted: 1, errors: 0 });
    expect(h.audit.mock.calls.map((c) => c[3])).toEqual(['doc-b']);
  });
});

describe('what the sweep refuses to do in an organisation\'s scope', () => {
  it('leaves a document that names another organisation than its programme\'s owner, counts it, and the job is not clean', async () => {
    h.orgs = [{ id: 7, uuid: UUID_A }];
    h.docs.set('7', [expired('doc-x', PROGRAM_A, { organizationId: 8 })]);

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ scanned: 1, organizationMismatch: 1, softDeleted: 0, archived: 0, errors: 0 });
    expect(h.statements.some((s) => s.text === 'BEGIN')).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
    await expect(runRetentionJob()).resolves.toBe(false);
  });

  it('a document resolved to another organisation at disposal is rolled back, not disposed in this scope', async () => {
    h.orgs = [{ id: 7, uuid: UUID_A }];
    h.docs.set('7', [expired('doc-y', PROGRAM_A)]);
    h.programOrg = 8; // the programme's row names organisation 8 by the time the transaction reads it

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ softDeleted: 0, errors: 1 });
    expect(h.statements.map((s) => s.text)).toContain('ROLLBACK');
    expect(h.statements.some((s) => s.text.startsWith('UPDATE vault.documents'))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('an organisation with no uuid is not swept: nothing is read in a uuid-less scope, and the job fails with an alert', async () => {
    h.orgs = [{ id: 7, uuid: UUID_A }, { id: 9, uuid: null }];

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ organizations: 1, organizationsNotSwept: 1 });
    expect(h.scopes.filter((s) => !s.system).map((s) => s.tenantId)).toEqual(['7']);
    await expect(runRetentionJob()).resolves.toBe(false);
    expect(h.alert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'retention_sweep_failed' }));
  });

  it('an operator can sweep the organisations it names, and only those', async () => {
    h.orgs = [{ id: 8, uuid: UUID_B }];
    await runRetentionSweep({ organizationIds: [8] });
    const listed = (await import('../../db')).pool.query as unknown as { mock: { calls: unknown[][] } };
    expect(listed.mock.calls.at(-1)?.[1]).toEqual([[8]]);
    expect(h.scopes.filter((s) => !s.system).map((s) => s.tenantId)).toEqual(['8']);
  });
});
