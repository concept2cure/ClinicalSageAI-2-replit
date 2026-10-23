// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rejectWorkflow = vi.hoisted(() => vi.fn());
vi.mock('../../services/workflowDecisionService', () => ({ rejectWorkflow }));
import { useRejectWorkflow } from '../useRejectWorkflow';
import { programTabsQueryKeys } from '../useProgramTabs';

afterEach(() => { cleanup(); rejectWorkflow.mockReset(); });

describe('preserved optional rejection hook', () => {
  it('writes only on mutation and refreshes the pending queue after success', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    rejectWorkflow.mockResolvedValue({ success: true, status: 'rejected' });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRejectWorkflow(), { wrapper });
    expect(rejectWorkflow).not.toHaveBeenCalled();
    await act(async () => { await result.current.mutateAsync({ approvalId: 7, comment: 'Missing source evidence' }); });
    expect(rejectWorkflow).toHaveBeenCalledWith(7, 'Missing source evidence');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: programTabsQueryKeys.approvals() });
    client.clear();
  });
});
