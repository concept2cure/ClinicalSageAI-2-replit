// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVaultUpload, type VaultUploadFileStatus } from '../useVaultUpload';
import { stubIngestXhr } from './_ingest-xhr-fake';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const file = () => new File(['synthetic'], 'gateway.txt');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Vault HTTP failures cannot establish that no write occurred', () => {
  it.each([408, 500, 502, 503, 504])('keeps HTTP%s without a confirmed receipt unknown', async (status) => {
    const request = stubIngestXhr(vi.fn(async () => ({ status, json: async () => null })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const states: VaultUploadFileStatus[] = [];
    await act(async () => {
      const outcome = await result.current.upload([file()], { onFileStatus: (_index, state) => states.push(state) });
      expect(outcome.succeeded).toEqual([]);
      expect(outcome.recorded).toEqual([]);
      expect(outcome.failed).toEqual([{ name: 'gateway.txt', unknown: true,
        reason: `the server reply did not confirm whether it was recorded (HTTP ${status})` }]);
    });
    expect(states.at(-1)).toMatchObject({ state: 'refused', unknown: true });
    expect(result.current.note?.text).toMatch(/not known whether.*recorded/i);
    expect(result.current.note?.text).toMatch(/Reload the Vault and check/);
    expect(result.current.note?.text).not.toMatch(/Not filed|Nothing partial was recorded/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([413, 415])('preserves an explicit uncertain result even with contradictory HTTP%s', async (status) => {
    stubIngestXhr(vi.fn(async () => ({ status, json: async () => ({ error: { code: 'OUTCOME_UNKNOWN', message: 'Review the current Vault records.' } }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => { expect((await result.current.upload([file()])).failed[0].unknown).toBe(true); });
    expect(result.current.note?.text).not.toMatch(/Nothing partial was recorded/);
  });

  it.each([400, 401, 403, 404, 409, 413, 415, 422, 429])('retains a definite HTTP%s refusal', async (status) => {
    const request = stubIngestXhr(vi.fn(async () => ({ status, json: async () => ({ error: { code: 'REFUSED', message: 'The request was refused.' } }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload([file()]);
      expect(outcome.failed).toEqual([{ name: 'gateway.txt', reason: 'The request was refused.' }]);
    });
    expect(result.current.note?.text).toMatch(/Not filed/);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
