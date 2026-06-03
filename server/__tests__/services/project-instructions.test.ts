import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the DB pool before importing the module under test.
vi.mock('../../db', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../db';
import {
  formatProjectInstructionsBlock,
  getProjectInstructions,
  getProjectInstructionsBlock,
} from '../../services/projects/project-instructions';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  queryMock.mockReset();
});

describe('formatProjectInstructionsBlock', () => {
  it('returns empty string when both fields are empty or whitespace', () => {
    expect(formatProjectInstructionsBlock({ customInstructions: '', context: '' })).toBe('');
    expect(formatProjectInstructionsBlock({ customInstructions: '   ', context: '\n\t' })).toBe('');
  });

  it('includes the instructions when present, no context section', () => {
    const out = formatProjectInstructionsBlock({ customInstructions: 'Always cite CFR.', context: '' });
    expect(out).toContain('PROJECT INSTRUCTIONS');
    expect(out).toContain('Always cite CFR.');
    expect(out).not.toContain('Project knowledge context');
  });

  it('includes the context section when present', () => {
    const out = formatProjectInstructionsBlock({ customInstructions: '', context: 'Device: CardioFlow.' });
    expect(out).toContain('Project knowledge context');
    expect(out).toContain('Device: CardioFlow.');
  });

  it('includes both and trims surrounding whitespace', () => {
    const out = formatProjectInstructionsBlock({ customInstructions: '  Be precise.  ', context: '  ctx  ' });
    expect(out).toContain('Be precise.');
    expect(out).toContain('ctx');
  });
});

describe('getProjectInstructions', () => {
  it('returns empty for null/undefined/empty id without querying', async () => {
    expect(await getProjectInstructions(null, 1)).toEqual({ customInstructions: '', context: '' });
    expect(await getProjectInstructions(undefined, 1)).toEqual({ customInstructions: '', context: '' });
    expect(await getProjectInstructions('', 1)).toEqual({ customInstructions: '', context: '' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns empty for a non-numeric id without querying', async () => {
    expect(await getProjectInstructions('not-a-number', 1)).toEqual({ customInstructions: '', context: '' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('reads knowledge.customInstructions + context, tenant-scoped', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ settings: { knowledge: { customInstructions: 'Cite predicate.', context: 'K123' } } }],
    });
    const res = await getProjectInstructions(42, 7);
    expect(res).toEqual({ customInstructions: 'Cite predicate.', context: 'K123' });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id');
    expect(params).toEqual([42, 7]);
  });

  it('prefers top-level settings.customInstructions over the nested one', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ settings: { customInstructions: 'TOP', knowledge: { customInstructions: 'NESTED' } } }],
    });
    expect((await getProjectInstructions(42, 7)).customInstructions).toBe('TOP');
  });

  it('strips a proj_ prefix and omits the org filter when org is null', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ settings: {} }] });
    await getProjectInstructions('proj_99', null);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('organization_id');
    expect(params).toEqual([99]);
  });

  it('returns empty when there are no rows', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getProjectInstructions(42, 7)).toEqual({ customInstructions: '', context: '' });
  });

  it('never throws on a DB error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    expect(await getProjectInstructions(42, 7)).toEqual({ customInstructions: '', context: '' });
  });
});

describe('getProjectInstructionsBlock', () => {
  it('formats fetched instructions into a block', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ settings: { knowledge: { customInstructions: 'Be precise.', context: '' } } }],
    });
    const block = await getProjectInstructionsBlock(42, 7);
    expect(block).toContain('PROJECT INSTRUCTIONS');
    expect(block).toContain('Be precise.');
  });

  it('returns empty string when there is nothing to inject', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ settings: {} }] });
    expect(await getProjectInstructionsBlock(42, 7)).toBe('');
  });
});
