// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest, serverMessage: () => null }));
import { rbmWrite, rbmWriteWithMeta } from '../surfaces/rbmWrites';

beforeEach(() => { apiRequest.mockReset(); });

describe('existing RBM transport within its admitted endpoints', () => {
  it('preserves the exact nested KRI write address, body and returned reading', async () => {
    apiRequest.mockResolvedValue(new Response(JSON.stringify({ data: { id: 9, value: 0 } })));
    expect(await rbmWrite('POST', '/rbm-kris/7/values', { value: 0 })).toEqual({ id: 9, value: 0 });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('POST', '/api/mdx/rbm-kris/7/values', { value: 0 });
  });

  it('preserves a monitoring action update and its receipt metadata', async () => {
    apiRequest.mockResolvedValue(new Response(JSON.stringify({ data: { id: 12 }, meta: { recorded: true } })));
    expect(await rbmWriteWithMeta('PATCH', '/rbm-monitoring-actions/12', { status: 'done' }))
      .toEqual({ data: { id: 12 }, meta: { recorded: true } });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('PATCH', '/api/mdx/rbm-monitoring-actions/12', { status: 'done' });
  });

  it.each(['/risk-items/7', '/rbm-kris-other', '/rbm-central-monitoring/unrelated', '/rbm-patient-profiles/unrelated'])(
    'refuses %s before the shared transport is called', async path => {
      await expect(rbmWrite('POST', path, {})).rejects.toThrow('This monitoring action is not available.');
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
});
