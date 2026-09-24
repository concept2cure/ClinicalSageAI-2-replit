// @vitest-environment jsdom
/**
 * A saved change whose audit-trail row was not written must reach the person
 * who made it.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `auditService.logAction` never rejects when the §11.10(e) row fails to
 * persist; it resolves an outcome. WO-16C converted the routes that discarded
 * that outcome so they carry it in the response: `auditTrail`, at the top level
 * or under `meta` / `details`, shaped
 *
 *   { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message }
 *
 * or, where a 204 or a verbatim proxy leaves no body, the headers
 * `X-Audit-Row-Persisted: false` and `X-Audit-Row-Code`.
 *
 * On 2026-09-24 not one file under client/src read any of it (git grep for
 * `AUDIT_ROW_NOT_PERSISTED`, `auditTrail.persisted`, `X-Audit-Row`: nothing).
 * So the server told the truth and the browser threw it away: a user whose
 * change committed without its audit row still saw only "Saved". That is the
 * "carried, then dropped one layer up" defect again, at the last layer.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * `apiRequest` / `apiUpload` are the transport every surface uses (directly, or
 * through `apiCall` and `liveMutateOrNull`). They inspect every successful
 * write's response and raise `c2c:audit-row-not-persisted` when either signal is
 * present; `<GlobalMutationErrors>` renders it. Both directions are tested: the
 * signal must raise, and a persisted row, a read, or an unrelated `persisted`
 * field must not — a notice that fires on a healthy save teaches people to
 * ignore it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  apiUpload,
  AUDIT_ROW_NOT_PERSISTED_EVENT,
  findUnpersistedAuditRow,
  type AuditRowNotPersistedDetail,
} from '../queryClient';

const LOST = {
  persisted: false,
  code: 'AUDIT_ROW_NOT_PERSISTED',
  message: 'The change was saved, but its audit-trail entry could not be written.',
} as const;
const KEPT = { persisted: true, chained: true } as const;

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('findUnpersistedAuditRow — the one reader of both wire signals', () => {
  const none = new Headers();

  it('finds the outcome at the top level, under meta, under details, and nested in data', () => {
    expect(findUnpersistedAuditRow(none, { ok: true, auditTrail: LOST })).toEqual({ code: LOST.code });
    expect(findUnpersistedAuditRow(none, { data: {}, meta: { auditTrail: LOST } })).toEqual({ code: LOST.code });
    expect(findUnpersistedAuditRow(none, { error: 'X', details: { auditTrail: LOST } })).toEqual({ code: LOST.code });
    expect(
      findUnpersistedAuditRow(none, { data: { results: [{ id: 1, auditTrail: KEPT }, { id: 2, auditTrail: LOST }] } }),
    ).toEqual({ code: LOST.code });
  });

  it('reads the header pair a 204 or a proxied body carries', () => {
    const h = new Headers({ 'X-Audit-Row-Persisted': 'false', 'X-Audit-Row-Code': 'AUDIT_ROW_NOT_PERSISTED' });
    expect(findUnpersistedAuditRow(h, null)).toEqual({ code: 'AUDIT_ROW_NOT_PERSISTED' });
    // The code header is optional; the persisted header alone is the signal.
    expect(findUnpersistedAuditRow(new Headers({ 'X-Audit-Row-Persisted': 'false' }), null)).toEqual({
      code: 'AUDIT_ROW_NOT_PERSISTED',
    });
  });

  it('stays silent for a persisted row, a true header, and an unrelated `persisted: false`', () => {
    expect(findUnpersistedAuditRow(none, { auditTrail: KEPT })).toBeNull();
    expect(findUnpersistedAuditRow(new Headers({ 'X-Audit-Row-Persisted': 'true' }), { auditTrail: KEPT })).toBeNull();
    // A draft that is "not persisted yet" is not a lost audit row. Only the
    // canonical code is the signal.
    expect(findUnpersistedAuditRow(none, { draft: { persisted: false } })).toBeNull();
    expect(findUnpersistedAuditRow(none, null)).toBeNull();
    expect(findUnpersistedAuditRow(none, 'text')).toBeNull();
  });

  it('terminates on a cyclic body', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(findUnpersistedAuditRow(none, cyclic)).toBeNull();
  });
});

describe('apiRequest / apiUpload raise the notice for a saved change with no audit row', () => {
  let events: AuditRowNotPersistedDetail[];
  const onEvent = (e: Event) => events.push((e as CustomEvent<AuditRowNotPersistedDetail>).detail);

  beforeEach(() => {
    events = [];
    window.addEventListener(AUDIT_ROW_NOT_PERSISTED_EVENT, onEvent);
  });
  afterEach(() => {
    window.removeEventListener(AUDIT_ROW_NOT_PERSISTED_EVENT, onEvent);
    vi.unstubAllGlobals();
  });

  it('a 200 PATCH carrying auditTrail.persisted=false raises it, and the caller still reads the body', async () => {
    const body = { success: true, organization: { id: 7 }, auditTrail: LOST };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, { headers: { 'X-Request-Id': 'req-123' } })));

    const res = await apiRequest('PATCH', '/api/organizations/7/profile?x=1', { name: 'Acme', reason: 'rename' });
    // The probe must not consume the body the surface is about to read.
    await expect(res.json()).resolves.toEqual(body);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({
      method: 'PATCH',
      path: '/api/organizations/7/profile',
      code: 'AUDIT_ROW_NOT_PERSISTED',
      correlationId: 'req-123',
    });
  });

  it('a 204 DELETE carrying the header raises it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204, headers: { 'X-Audit-Row-Persisted': 'false', 'X-Audit-Row-Code': 'AUDIT_ROW_NOT_PERSISTED' } })),
    );
    await apiRequest('DELETE', '/api/submissions/1/leaves/2');
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].code).toBe('AUDIT_ROW_NOT_PERSISTED');
  });

  it('an upload whose row was lost raises it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ logoUrl: '/x.png', updated: true, auditTrail: LOST })));
    const res = await apiUpload('POST', '/api/client-branding/upload-logo', new FormData());
    expect(res.ok).toBe(true);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].path).toBe('/api/client-branding/upload-logo');
  });

  it('a persisted row, and a GET, raise nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, auditTrail: KEPT })));
    await apiRequest('POST', '/api/qms/documents', {});
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ rows: [{ auditTrail: LOST }] })));
    await apiRequest('GET', '/api/history');
    // Give any stray probe the same chance to fire that the positive cases had.
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([]);
  });
});
