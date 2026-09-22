/**
 * The write layer against BOTH of `apiRequest`'s contracts.
 *
 * ── The defect this guards ───────────────────────────────────────────────────
 * `apiRequest` THROWS an `ApiRequestError` on every non-2xx except 401 — it
 * does not resolve a `Response` with `ok: false`. A write layer written as
 *
 *     const res = await apiRequest(…);
 *     if (!res.ok) throw new Error('Couldn’t … Nothing was written.');
 *
 * therefore has a dead branch: in the browser the throw happens first and the
 * `if` is never reached. Two things follow, and only one of them is visible.
 * The refusal still reaches the user (the thrown error carries the server's
 * message), so nothing looks broken — but the CODE is lost, so a 409
 * SECTION_CHANGED cannot be told from any other 409, and the editor's
 * concurrency handling never runs. Proven live: the first evidence run showed
 * the generic sentence over a real concurrent edit.
 *
 * Both shapes are exercised here. The resolving shape is what most of this
 * repo's client tests mock, so it must keep working; the throwing shape is
 * what actually happens in a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import {
  ProtocolSectionConflict, addScheduleVisit, saveProtocolSection, updateProtocolHeader,
} from '../surfaces/ProtocolDevWrites';

const REASON = 'Recording the agreed change in the governed register';
const ok = (body: unknown) => ({ ok: true, status: 201, json: async () => body }) as Response;
/* The rejection is built INSIDE the call. `mockRejectedValue` builds it at the
   call site, and `vi.restoreAllMocks()` then surfaces the stored result as an
   unhandled rejection that the runner attributes to the test — both report a
   failure where the assertion passed. */
const throws = (e: unknown) => apiRequest.mockImplementation(async () => { throw e; });

beforeEach(() => apiRequest.mockReset());
afterEach(() => apiRequest.mockReset());

describe('apiRequest throws — the write layer reads the thrown error', () => {
  it('turns a thrown 409 SECTION_CHANGED into the editor’s conflict, not a generic failure', async () => {
    throws(new ApiRequestError(
      'This section was changed by someone else since you opened it.', 409,
      { error: { code: 'SECTION_CHANGED' } }, 'SECTION_CHANGED',
    ));
    await expect(saveProtocolSection({ sectionId: 13, content: 'x', reason: REASON }))
      .rejects.toBeInstanceOf(ProtocolSectionConflict);
  });

  it('names the act and says nothing was written, carrying the server’s sentence', async () => {
    throws(new ApiRequestError('This protocol is finalized and cannot be edited.', 409, {}, 'INVALID_STATE'));
    await expect(addScheduleVisit(2, { visitName: 'Week 12', reason: REASON }))
      .rejects.toThrow(/Couldn.t add the visit — This protocol is finalized and cannot be edited\. Nothing was written\./);
  });

  it('reports a thrown 401 as an unauthenticated session', async () => {
    throws(new ApiRequestError('Unauthorized', 401, {}));
    await expect(updateProtocolHeader(2, { sponsor: 'X', reason: REASON }))
      .rejects.toThrow(/isn.t authenticated/);
  });

  it('does not swallow a failure that is not an API refusal', async () => {
    throws(new TypeError('Failed to fetch'));
    await expect(addScheduleVisit(2, { visitName: 'Week 12', reason: REASON }))
      .rejects.toThrow(/Failed to fetch/);
  });
});

describe('apiRequest resolves — the same refusals, read off the response', () => {
  it('reads a resolved 409 SECTION_CHANGED as the conflict', async () => {
    apiRequest.mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'SECTION_CHANGED', message: 'Changed by someone else.' } }),
    } as Response);
    await expect(saveProtocolSection({ sectionId: 13, content: 'x', reason: REASON }))
      .rejects.toBeInstanceOf(ProtocolSectionConflict);
  });

  it('reads a resolved 401 as an unauthenticated session', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    await expect(addScheduleVisit(2, { visitName: 'Week 12', reason: REASON }))
      .rejects.toThrow(/isn.t authenticated/);
  });
});

describe('the reason floor is enforced before anything leaves the browser', () => {
  it('refuses a reason under eight characters with no request at all', async () => {
    await expect(addScheduleVisit(2, { visitName: 'Week 12', reason: 'short' }))
      .rejects.toThrow(/at least 8 characters/);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('refuses a cover-page save with no field to change', async () => {
    await expect(updateProtocolHeader(2, { reason: REASON })).rejects.toThrow(/Nothing to change/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('the section save carries the concurrency token and the status', () => {
  it('sends expectedUpdatedAt, status and the reason on the section PATCH', async () => {
    apiRequest.mockResolvedValue(ok({ id: 13, updatedAt: '2026-09-22T00:00:00.000Z', status: 'complete' }));
    const out = await saveProtocolSection({
      sectionId: 13, content: 'body', status: 'complete',
      expectedUpdatedAt: '2026-09-21T10:00:00.000Z', reason: REASON,
    });
    const [method, path, body] = apiRequest.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/protocol-development/sections/13');
    expect(body).toEqual({ content: 'body', status: 'complete', expectedUpdatedAt: '2026-09-21T10:00:00.000Z', reason: REASON });
    expect(out).toEqual({ updatedAt: '2026-09-22T00:00:00.000Z', status: 'complete' });
  });
});
