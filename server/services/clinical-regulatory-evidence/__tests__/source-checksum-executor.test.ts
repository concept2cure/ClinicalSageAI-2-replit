/** Optional caller transaction for the existing historical checksum lookup. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: poolQuery } }));
vi.mock('../data-room-capture-audit', () => ({}));
import { findSourceByChecksum } from '../evidence-spine.service';

const PROGRAM = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const HASH = 'a'.repeat(64);
const historical = { id: 17, checksum: HASH, client_program_id: PROGRAM, source_type: 'client_document', is_current: false };
beforeEach(() => { poolQuery.mockReset(); poolQuery.mockResolvedValue({ rows: [historical] }); });

describe('findSourceByChecksum supplied executor', () => {
  it('uses the caller transaction without changing historical identity or filters', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [historical] });
    const found = await findSourceByChecksum(7, HASH, { sourceType: 'client_document', clientProgramId: PROGRAM, clientWorkspaceId: null }, { query });
    expect(query).toHaveBeenCalledOnce();
    expect(poolQuery).not.toHaveBeenCalled();
    expect(found).toMatchObject({ id: 17, isCurrent: false });
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([HASH, 7, 'client_document', PROGRAM, null]);
    expect(sql).toContain('ORDER BY created_at ASC LIMIT 1');
    expect(sql).not.toMatch(/is_current|document_data_dispositions/);
  });

  it('retains the existing pool fallback and empty-checksum no-query behavior', async () => {
    expect(await findSourceByChecksum(7, HASH)).toMatchObject({ id: 17 });
    expect(poolQuery).toHaveBeenCalledOnce();
    const query = vi.fn();
    expect(await findSourceByChecksum(7, '', {}, { query })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
