/**
 * The chain-head anchor, read and verified one organisation at a time, each on
 * a connection in its own scope (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * The integrity sweep no longer reads audit_logs across tenants. Given
 * `inOrganizationScope`, writeAuditChainAnchor reads each organisation's head on
 * that organisation's connection, and verifyAuditChainAnchor compares each
 * anchored head there; the caller's own connection reads only the archive
 * ledger. A connection scoped to another tenant is refused, never read as a
 * missing head. The real policies are exercised by the slice's probe on a
 * production-shaped database.
 */
import { describe, expect, it } from 'vitest';
import {
  verifyAuditChainAnchor,
  writeAuditChainAnchor,
  type AuditAnchorStore,
  type InOrganizationScope,
} from '../chain-anchor';
import type { PoolClient } from '../chain';

interface Head { row_id: string; chain_seq: string; sha256_chain: string; row_count: string }

/** A connection that answers the anchor module's statements as `tenant`'s own scope would. */
function scopedClient(tenant: string | null, heads: Record<string, Head>, log: string[]): PoolClient {
  return {
    async query(sql: string, params: unknown[] = []) {
      log.push(`${tenant ?? 'infra'}: ${sql.trim().split(/\s+/).slice(0, 3).join(' ')}`);
      if (sql.includes("current_setting('app.rls_enforce'")) return { rows: [{ rls_enforce: 'on', role: null }] };
      if (sql.includes("current_setting('app.current_tenant_id'")) return { rows: [{ tenant }] };
      if (sql.includes('audit_log_archives')) return { rows: [{ present: false }] };
      if (sql.includes('DISTINCT ON (tenant_id)')) {
        const org = String(params[0]);
        // RLS: this connection sees its own tenant's rows only.
        const h = org === tenant ? heads[org] : undefined;
        return { rows: h ? [{ organization_id: Number(org), occurred_at: '2026-10-29T01:00:00.000Z', ...h }] : [] };
      }
      if (sql.includes('WITH ORDINALITY')) {
        const [orgs, rowIds] = params as [number[], string[]];
        return {
          rows: orgs.map((org, i) => {
            const h = String(org) === tenant ? heads[String(org)] : undefined;
            const present = Boolean(h && h.row_id === rowIds[i]);
            return { ord: i + 1, present, head_tenant: present ? org : null, head_seq: present ? h!.chain_seq : null,
              head_sha: present ? h!.sha256_chain : null, current_rows: present ? h!.row_count : '0' };
          }),
        };
      }
      throw new Error(`unexpected statement on ${tenant ?? 'infra'}: ${sql}`);
    },
  } as unknown as PoolClient;
}

const HEADS: Record<string, Head> = {
  '7': { row_id: '00000000-0000-4000-8000-000000000007', chain_seq: '3', sha256_chain: 'a'.repeat(64), row_count: '3' },
  '8': { row_id: '00000000-0000-4000-8000-000000000008', chain_seq: '2', sha256_chain: 'b'.repeat(64), row_count: '2' },
};

function memoryStore(): AuditAnchorStore & { body: string | null } {
  const s = {
    location: 'memory://own-scope',
    body: null as string | null,
    async put(_key: string, body: string) { s.body = body; },
    async latest() { return s.body ? { key: 'anchors/audit-chain/2026/10/30/x.json', body: s.body } : null; },
  };
  return s;
}

const opener = (heads: Record<string, Head>, log: string[], tenantFor: (org: number) => string = String): InOrganizationScope =>
  (org, fn) => fn(scopedClient(tenantFor(org), heads, log));

describe('per organisation, each in its own scope', () => {
  it('writes an anchor of every organisation\'s head, each read on its own connection; the caller\'s is not read', async () => {
    const log: string[] = [];
    const store = memoryStore();
    const infra = scopedClient('7', HEADS, log); // tenant-scoped: a cross-tenant read on it would be refused
    const written = await writeAuditChainAnchor(infra, store, new Date('2026-10-30T02:00:00Z'), {
      inOrganizationScope: opener(HEADS, log), organizations: [7, 8, 9],
    });
    expect(written.organizations).toBe(2); // 9 has no chained row
    const anchor = JSON.parse(store.body!);
    expect(anchor.heads.map((h: { organizationId: number; rowCount: number }) => [h.organizationId, h.rowCount])).toEqual([[7, 3], [8, 2]]);
    expect(log.filter((l) => l.startsWith('infra'))).toEqual([]);
    expect(log.filter((l) => l.includes('SELECT h.tenant_id')).map((l) => l.split(':')[0])).toEqual(['7', '8', '9']);
  });

  it('verifies every anchored head on its own organisation\'s connection; the caller\'s reads only the archive ledger', async () => {
    const log: string[] = [];
    const store = memoryStore();
    await writeAuditChainAnchor(scopedClient(null, HEADS, []), store, new Date('2026-10-29T02:00:00Z'), {
      inOrganizationScope: opener(HEADS, []), organizations: [7, 8],
    });
    const infra = scopedClient(null, HEADS, log);
    const v = await verifyAuditChainAnchor(infra, store, new Date('2026-10-30T02:00:00Z'), { inOrganizationScope: opener(HEADS, log) });
    expect(v).toMatchObject({ status: 'ok', organizations: 2, breaks: [] });
    expect(log.filter((l) => l.includes('SELECT a.ord,')).map((l) => l.split(':')[0])).toEqual(['7', '8']);
    expect(log.filter((l) => l.startsWith('infra')).every((l) => l.includes('to_regclass'))).toBe(true);
  });

  it('a head that changed since the anchor is broken, and names its organisation', async () => {
    const store = memoryStore();
    await writeAuditChainAnchor(scopedClient(null, HEADS, []), store, new Date('2026-10-29T02:00:00Z'), {
      inOrganizationScope: opener(HEADS, []), organizations: [7, 8],
    });
    const truncated = { ...HEADS, '8': { ...HEADS['8'], row_id: '00000000-0000-4000-8000-0000000000ff' } };
    const v = await verifyAuditChainAnchor(scopedClient(null, truncated, []), store, new Date('2026-10-30T02:00:00Z'), {
      inOrganizationScope: opener(truncated, []),
    });
    expect(v.status).toBe('broken');
    expect(v.breaks).toEqual([expect.objectContaining({ organizationId: 8, kind: 'head_missing' })]);
  });

  it('a connection scoped to another tenant is refused, never read as a missing head', async () => {
    const store = memoryStore();
    await writeAuditChainAnchor(scopedClient(null, HEADS, []), store, new Date('2026-10-29T02:00:00Z'), {
      inOrganizationScope: opener(HEADS, []), organizations: [7, 8],
    });
    const wrong = opener(HEADS, [], (org) => (org === 8 ? '7' : String(org)));
    await expect(verifyAuditChainAnchor(scopedClient(null, HEADS, []), store, new Date('2026-10-30T02:00:00Z'), { inOrganizationScope: wrong }))
      .rejects.toThrow(/scoped to tenant 7, not to organisation 8/);
    await expect(writeAuditChainAnchor(scopedClient(null, HEADS, []), memoryStore(), new Date(), { inOrganizationScope: wrong, organizations: [8] }))
      .rejects.toThrow(/scoped to tenant 7, not to organisation 8/);
  });

  it('without the opener, a tenant-scoped connection is refused for the cross-tenant read, as before', async () => {
    await expect(writeAuditChainAnchor(scopedClient('7', HEADS, []), memoryStore())).rejects.toThrow(/scoped to one tenant/);
  });
});
