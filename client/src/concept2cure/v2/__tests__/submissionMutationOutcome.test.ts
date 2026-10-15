// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest,
}));
import { ApiRequestError } from '@/lib/queryClient';
import { mutateVerbatim } from '../surfaces/SubmissionSeqWorkspaces';
beforeEach(() => { apiRequest.mockReset(); });
it.each([400, 401, 403, 404, 409, 422])('preserves confirmed refusal at %s', async status => {
  apiRequest.mockRejectedValue(new ApiRequestError('The sequence is locked.', status));
  const r = await mutateVerbatim('PUT', '/placement', {});
  expect(r).toMatchObject({ data: null, unconfirmed: false, status });
  expect(r.error).toContain('The sequence is locked.');
});
it.each([408, 500, 502, undefined])('marks a missing or uncertain reply at %s as unknown', async status => {
  apiRequest.mockRejectedValue(status === undefined ? new TypeError('Failed to fetch') : new ApiRequestError('The service could not complete the request.', status));
  const r = await mutateVerbatim('PUT', '/placement', {});
  expect(r).toMatchObject({ data: null, unconfirmed: true });
  expect(r.error).not.toMatch(/change was not saved/i);
});
it('a success whose JSON was lost is unconfirmed', async () => {
  apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => { throw new Error('body lost'); } });
  expect(await mutateVerbatim('POST', '/snapshot', {})).toMatchObject({ data: null, unconfirmed: true, status: 201 });
});
it('an explicit unknown code overrides a status commonly used for refusal', async () => {
  apiRequest.mockRejectedValue(new ApiRequestError('Reload first.', 409, undefined, 'OUTCOME_UNKNOWN'));
  expect(await mutateVerbatim('PUT', '/placement', {})).toMatchObject({ data: null, unconfirmed: true, status: 409, code: 'OUTCOME_UNKNOWN' });
});
