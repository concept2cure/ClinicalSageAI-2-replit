import { describe, expect, it, vi } from 'vitest';
import { lockDocumentDispositionProgram } from '../program-lock';

describe('shared source-save/withdrawal program lock', () => {
  it('uses one transaction-scoped key for equivalent UUID spellings', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    await lockDocumentDispositionProgram({ query }, 7, id);
    await lockDocumentDispositionProgram({ query }, 7, id.toUpperCase());
    expect(query.mock.calls).toEqual([
      ["SET LOCAL lock_timeout = '5s'"],
      ["SELECT pg_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext($1))", [`7:${id}`]],
      ["SET LOCAL lock_timeout = '5s'"],
      ["SELECT pg_advisory_xact_lock(hashtext('document_data_dispositions'),hashtext($1))", [`7:${id}`]],
    ]);
  });

  it('propagates an unavailable lock instead of permitting unchecked writes', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('Lock unavailable'));
    await expect(lockDocumentDispositionProgram({ query }, 7, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'))
      .rejects.toThrow('Lock unavailable');
  });
});
