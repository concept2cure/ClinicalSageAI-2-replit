// @vitest-environment jsdom
/** Actual upload hook, XHR boundary and canonical session owner; HTTP records are synthetic. */
import { StrictMode, createElement, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVaultUpload, type VaultUploadFileStatus, type VaultUploadOutcome } from '../useVaultUpload';
import { ingestReceipt, stubIngestXhr, type IngestInit } from './_ingest-xhr-fake';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const file = (name: string) => new File(['synthetic upload bytes'], name, { type: 'text/plain' });
const noActionableRecords = (outcome: VaultUploadOutcome) => {
  expect(outcome.succeeded).toEqual([]);
  expect(outcome.recorded).toEqual([]);
  expect(outcome.filings).toEqual([]);
  expect(outcome.conflicts).toEqual([]);
  expect(outcome.alreadyRecorded).toEqual([]);
  expect(outcome.newVersions).toEqual([]);
};
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
function success(init: IngestInit) {
  return { status: 201, json: async () => ingestReceipt(init.body as FormData) };
}
function heldFirstResponse() {
  const held = deferred();
  let count = 0;
  const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
    count += 1;
    if (count === 1) await held.promise;
    return success(init);
  }));
  return { request, release: held.release };
}

beforeEach(() => { seedCompanySession({}, 'upload-owner'); });
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('Vault uploads retain their project visit and canonical account session', () => {
  it.each(['project', 'project ABA', 'account', 'same-account session', 'organization', 'logout', 'session ABA', 'unmount'] as const)(
    'retires queued dispatch, callbacks and actionable outcomes on %s replacement', async (transition) => {
      const held = heldFirstResponse();
      const statuses = vi.fn<(index: number, status: VaultUploadFileStatus) => void>();
      const { result, rerender, unmount } = renderHook(({ program }) => useVaultUpload(program), {
        initialProps: { program: PROGRAM },
      });
      let pending!: Promise<VaultUploadOutcome>;
      act(() => { pending = result.current.upload([file('first.txt'), file('queued.txt')], { onFileStatus: statuses }); });
      await waitFor(() => expect(held.request).toHaveBeenCalledTimes(1));
      act(() => {
        if (transition === 'project' || transition === 'project ABA') rerender({ program: OTHER_PROGRAM });
        if (transition === 'account') seedCompanySession({ id: '43', email: 'replacement@example.test' }, 'replacement');
        if (transition === 'same-account session') seedCompanySession({}, 'replacement');
        if (transition === 'organization') seedCompanySession({ organizationId: '2' }, 'replacement');
        if (transition === 'logout' || transition === 'session ABA') endCompanySession();
        if (transition === 'session ABA') seedCompanySession({}, 'returned');
        if (transition === 'unmount') unmount();
      });
      if (transition === 'project ABA') rerender({ program: PROGRAM });
      const callbacksAtRetirement = statuses.mock.calls.length;
      await act(async () => { held.release(); noActionableRecords(await pending); });
      expect(held.request).toHaveBeenCalledTimes(1);
      expect(statuses).toHaveBeenCalledTimes(callbacksAtRetirement);
      if (transition !== 'unmount') {
        expect(result.current.note).toBeNull();
        expect(result.current.uploading).toBe(false);
      }
    },
  );

  it.each(['project', 'account', 'unmount'] as const)('a retained %s callback cannot acquire the replacement owner', async (transition) => {
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const { result, rerender, unmount } = renderHook(({ program }) => useVaultUpload(program), { initialProps: { program: PROGRAM } });
    const retainedUpload = result.current.upload;
    act(() => {
      if (transition === 'project') rerender({ program: OTHER_PROGRAM });
      if (transition === 'account') seedCompanySession({ id: '43', email: 'replacement@example.test' }, 'replacement');
      if (transition === 'unmount') unmount();
    });
    await act(async () => { noActionableRecords(await retainedUpload([file('stale.txt')])); });
    expect(request).not.toHaveBeenCalled();
  });

});

describe('Vault upload admission and state ownership', () => {
  it('admits one request for same-frame repeated upload calls and remains busy until it settles', async () => {
    const held = heldFirstResponse();
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let first!: Promise<VaultUploadOutcome>;
    let duplicate!: Promise<VaultUploadOutcome>;
    act(() => {
      first = result.current.upload([file('first.txt')]);
      duplicate = result.current.upload([file('duplicate.txt')]);
    });
    await waitFor(() => expect(held.request).toHaveBeenCalled());
    await act(async () => { noActionableRecords(await duplicate); });
    expect(held.request).toHaveBeenCalledTimes(1);
    expect(result.current.uploading).toBe(true);
    await act(async () => { held.release(); expect((await first).succeeded).toEqual(['first.txt']); });
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.text).toContain('Unfiled');
  });

  it('an old project reply cannot clear the replacement project upload state or overwrite its note', async () => {
    const old = deferred();
    const current = deferred();
    let count = 0;
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
      count += 1;
      await (count === 1 ? old.promise : current.promise);
      return success(init);
    }));
    const { result, rerender } = renderHook(({ program }) => useVaultUpload(program), { initialProps: { program: PROGRAM } });
    let oldPending!: Promise<VaultUploadOutcome>;
    let currentPending!: Promise<VaultUploadOutcome>;
    act(() => { oldPending = result.current.upload([file('old.txt')]); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    rerender({ program: OTHER_PROGRAM });
    act(() => { currentPending = result.current.upload([file('current.txt')]); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await act(async () => { old.release(); noActionableRecords(await oldPending); });
    expect(result.current.uploading).toBe(true);
    expect(result.current.note).toBeNull();
    await act(async () => { current.release(); expect((await currentPending).succeeded).toEqual(['current.txt']); });
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.text).not.toContain('old.txt');
  });

  it.each(['project', 'session'] as const)('the %s replacement clears an already rendered outcome', async (transition) => {
    stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const { result, rerender } = renderHook(({ program }) => useVaultUpload(program), { initialProps: { program: PROGRAM } });
    await act(async () => { await result.current.upload([file('previous.txt')]); });
    expect(result.current.note).not.toBeNull();
    act(() => {
      if (transition === 'project') rerender({ program: OTHER_PROGRAM });
      else seedCompanySession({}, 'replacement');
    });
    await waitFor(() => expect(result.current.note).toBeNull());
  });

});

describe('Vault uploads preserve valid session continuity', () => {
  it('continues a stable owner sequentially and can admit a later batch after settlement', async () => {
    const held = heldFirstResponse();
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let pending!: Promise<VaultUploadOutcome>;
    act(() => { pending = result.current.upload([file('first.txt'), file('second.txt')]); });
    await waitFor(() => expect(held.request).toHaveBeenCalledTimes(1));
    await act(async () => { held.release(); expect((await pending).succeeded).toEqual(['first.txt', 'second.txt']); });
    expect(held.request).toHaveBeenCalledTimes(2);
    await act(async () => { expect((await result.current.upload([file('third.txt')])).succeeded).toEqual(['third.txt']); });
    expect(held.request).toHaveBeenCalledTimes(3);
  });

  it('continues the same session across a canonical bearer refresh using the current bearer', async () => {
    const held = heldFirstResponse();
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let pending!: Promise<VaultUploadOutcome>;
    act(() => { pending = result.current.upload([file('first.txt'), file('second.txt')]); });
    await waitFor(() => expect(held.request).toHaveBeenCalledTimes(1));
    let rotated = '';
    await act(async () => { rotated = await rotateCompanyBearer(); });
    await act(async () => { held.release(); expect((await pending).succeeded).toEqual(['first.txt', 'second.txt']); });
    expect(held.request).toHaveBeenCalledTimes(2);
    expect(held.request.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${rotated}`);
    expect(held.request.mock.calls[1][1].headers['x-organization-id']).toBe('1');
    expect(result.current.note?.tone).toBe('ok');
  });
});


describe('Vault upload browser credential and mount boundaries', () => {
  it.each(['account', 'organization', 'missing'] as const)('stops queued files after raw %s bearer drift outside the canonical session', async (drift) => {
    const held = heldFirstResponse();
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const statuses = vi.fn<(index: number, status: VaultUploadFileStatus) => void>();
    let pending!: Promise<VaultUploadOutcome>;
    act(() => { pending = result.current.upload([file('first.txt'), file('queued.txt')], { onFileStatus: statuses }); });
    await waitFor(() => expect(held.request).toHaveBeenCalledTimes(1));
    act(() => {
      if (drift === 'missing') clearAuthToken();
      else setAuthToken(`fixture.${btoa(JSON.stringify({ userId: drift === 'account' ? 43 : 42,
        organizationId: drift === 'organization' ? 2 : 1 }))}.synthetic`);
    });
    const callbacksAtDrift = statuses.mock.calls.length;
    await act(async () => { held.release(); noActionableRecords(await pending); });
    expect(held.request).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveBeenCalledTimes(callbacksAtDrift);
    expect(result.current.note).toBeNull();
    expect(result.current.uploading).toBe(false);
  });

  it('admits the live StrictMode effect replay mount while retiring retained callbacks after unmount', async () => {
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const { result, unmount } = renderHook(() => useVaultUpload(PROGRAM), {
      wrapper: ({ children }: PropsWithChildren) => createElement(StrictMode, null, children),
    });
    await act(async () => { expect((await result.current.upload([file('live.txt')])).succeeded).toEqual(['live.txt']); });
    expect(request).toHaveBeenCalledTimes(1);
    const retainedUpload = result.current.upload;
    unmount();
    await act(async () => { noActionableRecords(await retainedUpload([file('retired.txt')])); });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('Vault upload retained callbacks never acquire drifted browser credentials', () => {
  it.each(['account', 'organization', 'missing'] as const)('refuses raw %s drift before the first dispatch', async (drift) => {
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const retainedUpload = result.current.upload;
    act(() => {
      if (drift === 'missing') clearAuthToken();
      else setAuthToken(`fixture.${btoa(JSON.stringify({ userId: drift === 'account' ? 43 : 42,
        organizationId: drift === 'organization' ? 2 : 1 }))}.synthetic`);
    });
    await act(async () => { noActionableRecords(await retainedUpload([file('must-not-send.txt')])); });
    expect(request).not.toHaveBeenCalled();
    expect(result.current.note).toBeNull();
    expect(result.current.uploading).toBe(false);
  });

  it('restoring the original bearer cannot revive a callback that observed raw credential drift', async () => {
    const originalBearer = seedCompanySession({}, 'original-before-drift');
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const retainedUpload = result.current.upload;
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 43, organizationId: 1 }))}.synthetic`);
    await act(async () => { noActionableRecords(await retainedUpload([file('during-drift.txt')])); });
    setAuthToken(originalBearer);
    await act(async () => { noActionableRecords(await retainedUpload([file('after-drift.txt')])); });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('Vault upload admission starts with the canonical account credentials', () => {
  it.each(['account', 'organization', 'missing'] as const)('refuses premount raw %s bearer drift from the canonical account', async (drift) => {
    const request = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => success(init)));
    if (drift === 'missing') clearAuthToken();
    else setAuthToken(`fixture.${btoa(JSON.stringify({ userId: drift === 'account' ? 43 : 42,
      organizationId: drift === 'organization' ? 2 : 1 }))}.synthetic`);
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => { noActionableRecords(await result.current.upload([file('must-not-send.txt')])); });
    expect(request).not.toHaveBeenCalled();
    expect(result.current.note).toBeNull();
    expect(result.current.uploading).toBe(false);
  });
});
