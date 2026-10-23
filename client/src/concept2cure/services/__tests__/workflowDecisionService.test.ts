import { afterEach, describe, expect, it, vi } from 'vitest';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
import { rejectWorkflow } from '../workflowDecisionService';

afterEach(() => apiRequest.mockReset());

describe('isolated optional workflow decision adapter', () => {
  it('keeps the canonical authenticated transport and rejection reason', async () => {
    const decision = { success: true, status: 'rejected', workflowRejected: true };
    apiRequest.mockResolvedValue({ status: 200, json: async () => decision });
    expect(await rejectWorkflow('review/7', 'Missing source evidence')).toEqual(decision);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/approval-workflows/review%2F7/reject', {
      comments: 'Missing source evidence',
    });
  });

  it('continues to reject an error envelope returned with HTTP 200', async () => {
    apiRequest.mockResolvedValue({ status: 200, json: async () => ({ error: 'DECISION_FAILED', message: 'The decision could not be recorded.' }) });
    await expect(rejectWorkflow(7, 'Missing source evidence')).rejects.toThrow('The decision could not be recorded.');
  });
});
