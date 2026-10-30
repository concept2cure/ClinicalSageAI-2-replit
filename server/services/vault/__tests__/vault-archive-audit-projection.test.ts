/** Archive copies reduce identities after canonical chain and relationship checks. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RecordAuditHistory } from '../../../routes/audit-trail-ledger.routes';
import { readArchiveAuditExtract } from '../vault-seal-archive';

const canonical = vi.hoisted(() => ({ read: vi.fn(), scope: vi.fn(), relationships: vi.fn() }));
vi.mock('../../../routes/audit-trail-ledger.routes', () => ({ readRecordAuditHistory: canonical.read }));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: canonical.scope }));
vi.mock('../vault-history-access', () => ({
  projectVaultRelationshipHistory: canonical.relationships,
  VaultHistoryAccessError: class extends Error {},
}));

const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
const connect = vi.fn(async () => client);
const pool = { connect } as unknown as Pick<Pool, 'connect'>;
const record = { tableName: 'vault_document', recordId: ['synthetic-document'] };
let history: RecordAuditHistory;

beforeEach(() => {
  vi.clearAllMocks();
  history = {
    data: [{
      id: 'AUD-synthetic-event', when: '2026-10-30 12:00', at: '2026-10-30T12:00:00Z',
      actor: 'Synthetic Person (person@example.test)', actorRef: 'user:42', ip: '192.0.2.42',
      event: 'Document recorded', target: 'vault_document:synthetic-document', kind: 'document',
      sig: true, hash: 'a'.repeat(64), prevHash: 'b'.repeat(64), reason: 'Synthetic reason',
      meaning: 'Approval', source: 'audit_logs', seq: 17, signatureRef: 'electronic_signatures:13',
      targetRef: 'vault_document:synthetic-document',
    }],
    meta: { chain: { store: 'audit_logs', ok: true, rowsChecked: 17, legacyRows: 0, sequencedRows: 17 } },
  };
  canonical.read.mockResolvedValue(history);
  canonical.scope.mockResolvedValue(undefined);
  canonical.relationships.mockImplementation(async (_client, _input, read: RecordAuditHistory) => read);
});

describe('identities in an archive audit copy', () => {
  it.each([undefined, false])('reduces actors and omits IP when namedActors is %s', async (namedActors) => {
    const original = globalThis.structuredClone(history);
    const access = namedActors === undefined ? { of: 'synthetic documents' } : { of: 'synthetic documents', namedActors };
    const read = await readArchiveAuditExtract(pool, 17, 42, record, access);
    const { ip, ...entry } = original.data[0];
    expect(ip).toBe('192.0.2.42');
    expect(read.data).toEqual([{ ...entry, actor: 'user:42' }]);
    expect(read.meta).toBe(history.meta);
    expect(history).toEqual(original);
    expect(canonical.scope).toHaveBeenCalledWith(client, 17);
    expect(canonical.read).toHaveBeenCalledWith(client, 17, { ...record, limit: 1000 });
    expect(canonical.relationships).toHaveBeenCalledWith(client, { organizationId: 17, userId: 42 }, history);
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('preserves names, IP addresses and the complete history only for explicit namedActors true', async () => {
    const read = await readArchiveAuditExtract(pool, 17, 42, record, { of: 'synthetic documents', namedActors: true });
    expect(read).toBe(history);
    expect(read.data[0]).toMatchObject({ actor: 'Synthetic Person (person@example.test)', actorRef: 'user:42', ip: '192.0.2.42' });
    expect(read.meta.chain).toEqual(history.meta.chain);
  });

  it('does not label a person without an account reference as System', async () => {
    history.data[0].actorRef = null;
    const read = await readArchiveAuditExtract(pool, 17, 42, record, { of: 'synthetic documents' });
    expect(read.data[0].actor).toBe('not named in this copy');
    expect(read.data[0].actorRef).toBeNull();
    expect(read.data[0]).not.toHaveProperty('ip');
    expect(read.meta).toBe(history.meta);
  });

  it('keeps a genuine System actor identified as System while removing its IP field', async () => {
    history.data[0].actor = 'System';
    history.data[0].actorRef = null;
    const read = await readArchiveAuditExtract(pool, 17, 42, record, { of: 'synthetic documents' });
    const { ip, ...entry } = history.data[0];
    expect(ip).toBe('192.0.2.42');
    expect(read.data[0]).toEqual(entry);
    expect(read.data[0].actor).toBe('System');
    expect(read.meta).toBe(history.meta);
  });
});
