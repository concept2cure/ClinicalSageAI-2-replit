import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../../db';
import {
  computeRetrievalMode,
  estimateProjectKnowledgeTokens,
  refreshProjectRetrievalMode,
  getProjectRetrievalMode,
  RETRIEVAL_MODE_THRESHOLD_TOKENS,
} from '../../services/projects/retrieval-mode';

const queryMock = pool.query as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => queryMock.mockReset());

describe('computeRetrievalMode', () => {
  it('is in_context at/below the threshold and retrieval above it', () => {
    expect(computeRetrievalMode(0)).toBe('in_context');
    expect(computeRetrievalMode(RETRIEVAL_MODE_THRESHOLD_TOKENS)).toBe('in_context');
    expect(computeRetrievalMode(RETRIEVAL_MODE_THRESHOLD_TOKENS + 1)).toBe('retrieval');
  });
  it('honors a custom threshold', () => {
    expect(computeRetrievalMode(100, 50)).toBe('retrieval');
    expect(computeRetrievalMode(50, 50)).toBe('in_context');
  });
});

describe('estimateProjectKnowledgeTokens', () => {
  it('returns 0 without querying for invalid ids', async () => {
    expect(await estimateProjectKnowledgeTokens(0, 7)).toBe(0);
    expect(await estimateProjectKnowledgeTokens(42, 0)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it('estimates tokens as ceil(total_chars / 4), org+project scoped', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_chars: '40002' }] });
    expect(await estimateProjectKnowledgeTokens(42, 7)).toBe(Math.ceil(40002 / 4));
    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([7, 42]); // organization_id, project_id
  });
  it('returns 0 on a DB error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));
    expect(await estimateProjectKnowledgeTokens(42, 7)).toBe(0);
  });
});

describe('refreshProjectRetrievalMode', () => {
  it('computes from the estimate and persists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_chars: '400' }] }); // estimate
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE
    const state = await refreshProjectRetrievalMode(42, 7);
    expect(state).toEqual({ mode: 'in_context', tokenEstimate: 100 });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [updateSql] = queryMock.mock.calls[1] as [string];
    expect(updateSql).toContain('UPDATE projects');
  });
  it('still returns the computed state when persistence fails', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_chars: '400' }] }); // estimate
    queryMock.mockRejectedValueOnce(new Error('no such column')); // UPDATE fails
    const state = await refreshProjectRetrievalMode(42, 7);
    expect(state).toEqual({ mode: 'in_context', tokenEstimate: 100 });
  });
});

describe('getProjectRetrievalMode', () => {
  it('returns the persisted mode when present (single read)', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ retrieval_mode: 'retrieval', knowledge_token_estimate: 250000 }],
    });
    expect(await getProjectRetrievalMode(42, 7)).toEqual({ mode: 'retrieval', tokenEstimate: 250000 });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
  it('recomputes when not yet persisted (null)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ retrieval_mode: null, knowledge_token_estimate: 0 }] }); // read
    queryMock.mockResolvedValueOnce({ rows: [{ total_chars: '0' }] }); // estimate
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE
    const state = await getProjectRetrievalMode(42, 7);
    expect(state).toEqual({ mode: 'in_context', tokenEstimate: 0 });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
