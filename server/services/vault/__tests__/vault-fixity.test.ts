/**
 * Fixity verdicts a real database does not stage easily (plan critique 15):
 * a store this server cannot open is `unreadable`, a version with no recorded
 * SHA-256 is `unverifiable` (nothing can be proven, so it is never called
 * verified), and a program with more versions than one run checks says so.
 * The verified, altered and missing cases run on PostgreSQL with real files:
 * tests/db/vault-fixity.dbtest.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query, connect, read, chained } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  read: vi.fn(),
  chained: [] as Array<{ resourceId: string; details: { verdict: string } }>,
}));
vi.mock('../../../db.js', () => ({ pool: { query, connect } }));
vi.mock('../../c2c/program-access', () => ({ programInOrganization: vi.fn(async () => true) }));
vi.mock('../../../routes/c2c/project-vault.js', () => ({ readVerifiedVaultBytes: read }));
vi.mock('../../auditService.js', () => ({
  writeChainedAuditRow: vi.fn(async (_c: unknown, e: { resourceId: string; details: { verdict: string } }) => { chained.push(e); }),
}));

import { checkProgramFixity, FIXITY_BATCH_LIMIT } from '../vault-fixity';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const row = (id: string, hash: string | null) => ({
  id, document_title: `Doc ${id}`, version: '1.0', content_hash: hash, storage_version_id: `v-${id}`, s3_key: null, storage_provider: 'local',
});

beforeEach(() => {
  vi.clearAllMocks();
  chained.length = 0;
  connect.mockResolvedValue({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() });
});

describe('checkProgramFixity', () => {
  it('an unopenable store is unreadable; no recorded hash is unverifiable, never verified', async () => {
    query.mockResolvedValueOnce({ rows: [row('a', 'a'.repeat(64)), row('b', null)] });
    read
      .mockResolvedValueOnce({ ok: false, status: 409, error: 'STORED_FILE_UNREADABLE' })
      .mockResolvedValueOnce({ ok: true, bytes: Buffer.from('x') });
    const out = await checkProgramFixity({ programId: PROGRAM, organizationId: 7, userId: 3 });
    if (!out.ok) throw new Error('expected a result');
    expect(out.counts).toEqual({ verified: 0, altered: 0, missing: 0, unreadable: 1, unverifiable: 1 });
    expect(out.findings.map((f) => [f.documentId, f.verdict])).toEqual([['a', 'unreadable'], ['b', 'unverifiable']]);
    expect(chained.map((e) => [e.resourceId, e.details.verdict])).toEqual([['a', 'unreadable'], ['b', 'unverifiable']]);
  });

  it('a program with more versions than one run checks says so, and checks the limit', async () => {
    query.mockResolvedValueOnce({ rows: Array.from({ length: FIXITY_BATCH_LIMIT + 1 }, (_, i) => row(String(i), 'f'.repeat(64))) });
    read.mockResolvedValue({ ok: true, bytes: Buffer.from('x') });
    const out = await checkProgramFixity({ programId: PROGRAM, organizationId: 7, userId: 3 });
    if (!out.ok) throw new Error('expected a result');
    expect(out.truncated).toBe(true);
    expect(out.checked).toBe(FIXITY_BATCH_LIMIT);
    expect(chained).toHaveLength(FIXITY_BATCH_LIMIT);
  });
});
