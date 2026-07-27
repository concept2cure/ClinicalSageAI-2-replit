/**
 * @vitest-environment jsdom
 */
/**
 * useElectronicSignature — the contract that replaced signature theatre.
 *
 * The MDX approval card previously "signed" with `setSigned(true)`: the
 * password was collected and discarded, the record number came from
 * `Math.random()`, and the footer promised an audit-trail write that
 * never happened. These tests encode the properties that make the
 * replacement real, and would fail if any of that behaviour returned.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElectronicSignature } from '../useElectronicSignature';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ARGS = {
  documentId: 12,
  versionId: 3,
  signatureMeaning: 'Reviewed and approved',
  password: 'correct horse battery',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('useElectronicSignature', () => {
  it('sends the password to the server rather than discarding it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { signatureId: 91, signatureHash: 'abc123def456', signedAt: '2026-07-26T10:00:00Z' }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/esignature/sign');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.password).toBe(ARGS.password);
    /* The revision must be pinned — a signature that does not identify
       what was signed is not compliant (§11.50(a)). */
    expect(body.documentId).toBe(12);
    expect(body.versionId).toBe(3);
    expect(body.signatureMeaning).toBe('Reviewed and approved');
  });

  it('reports success only with a server-issued signature record', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { signatureId: 91, signatureHash: 'abc123def456', signedAt: '2026-07-26T10:00:00Z' }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    expect(result.current.receipt).toEqual({
      signatureId: 91,
      signatureHash: 'abc123def456',
      signedAt: '2026-07-26T10:00:00Z',
    });
    expect(result.current.error).toBeNull();
  });

  it('refuses a 200 that carries no signature record', async () => {
    /* This is the exact failure mode the old code embodied: a "signed"
       state with nothing behind it. A success envelope without an id is
       not a signature. */
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const { result } = renderHook(() => useElectronicSignature());

    let returned: unknown;
    await act(async () => { returned = await result.current.sign(ARGS); });

    expect(returned).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toMatch(/Nothing was signed/i);
  });

  it('surfaces a failed password verification verbatim', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: 'Signature rejected: password verification failed (§11.200)' }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toMatch(/password verification failed/);
  });

  it('distinguishes a missing signing authority from a bad password', async () => {
    /* §11.10(g): identity is not authority. The signer needs to know
       which of the two problems they have. */
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        error: 'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).',
        code: 'ESIGNATURE_NO_AUTHORITY',
      }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    expect(result.current.error).toMatch(/does not permit/);
  });

  it('omits the MFA field entirely when no code was entered', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { signatureId: 1, signatureHash: 'h', signedAt: 't' }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    /* The server decides whether a second factor is required; sending
       an empty string would look like an attempted-and-failed token. */
    expect(body).not.toHaveProperty('mfaToken');
  });

  it('forwards an MFA code when one was entered', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { signatureId: 1, signatureHash: 'h', signedAt: 't' }),
    );
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign({ ...ARGS, mfaToken: '123456' }); });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.mfaToken).toBe('123456');
  });

  it('leaves no signature behind when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });

    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBe('offline');
  });

  it('clears a prior rejection on reset', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'nope' }));
    const { result } = renderHook(() => useElectronicSignature());

    await act(async () => { await result.current.sign(ARGS); });
    expect(result.current.error).toBe('nope');

    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(result.current.receipt).toBeNull();
  });
});
