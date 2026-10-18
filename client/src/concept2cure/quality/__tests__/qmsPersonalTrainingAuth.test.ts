// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QmsTrainingAcknowledgement, QmsTrainingContext } from '@shared/qms/training';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { acknowledgePersonalTraining, readPersonalTraining } from '../qmsPersonalTraining';

const scope = { organizationId: 12, userId: 7, documentId: 6 };
const token = (userId = '7', organizationId = '12', nonce = 'initial') => `fixture.${btoa(JSON.stringify({ userId, organizationId, jti: nonce }))}.fixture`;
const context: QmsTrainingContext = {
  documentId: 6, docNumber: 'SOP-015', title: 'Supplier controls', documentVersion: '1.0',
  status: 'effective', eligible: true, canEditControlledText: false, contentDigest: 'a'.repeat(64), unavailableReason: null,
  sections: [{ key: 'purpose', label: 'Purpose', body: 'Use the approved supplier record.' }], acknowledgement: null,
};
const receipt: QmsTrainingAcknowledgement = {
  id: 31, documentId: 6, userId: 7, documentVersion: '1.0', contentDigest: 'a'.repeat(64),
  acknowledgedAt: '2026-10-01T09:00:00.000Z', expiresAt: '2099-10-01T09:00:00.000Z', method: 'attestation',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearAuthToken();
  localStorage.setItem('currentOrganizationId', '12');
  setAuthToken(token());
});
afterEach(() => { clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('personal training through the actual authenticated client transport', () => {
  it('uses fresh bearer and organization headers with cookies for reads and the strict personal write', async () => {
    const fetch = vi.fn(async (_path: string, options: { method?: string; body?: unknown }) => options.method === 'GET' ?
      json({ data: { id: 6, organization_id: 12, version: '1.0', status: 'effective' }, meta: { training: context } }) :
      json({ data: receipt, meta: { auditTrail: { persisted: true, chained: true } } }, 201));
    vi.stubGlobal('fetch', fetch);
    await readPersonalTraining(scope);
    setAuthToken(token('7', '12', 'refreshed'));
    expect((await acknowledgePersonalTraining(scope, context)).receipt).toEqual(receipt);
    expect(fetch.mock.calls[0]).toEqual(['/api/mdx/qms/documents/6', expect.objectContaining({
      method: 'GET', credentials: 'include', headers: expect.objectContaining({ Authorization: `Bearer ${token()}`, 'x-organization-id': '12' }),
    })]);
    expect(fetch.mock.calls[1]).toEqual(['/api/mdx/qms/documents/6/training-ack', expect.objectContaining({
      method: 'POST', credentials: 'include', headers: expect.objectContaining({ Authorization: `Bearer ${token('7', '12', 'refreshed')}`, 'x-organization-id': '12' }),
    })]);
    expect(JSON.parse(String(fetch.mock.calls[1][1].body))).toEqual({ documentVersion: '1.0', contentDigest: 'a'.repeat(64), understood: true, method: 'attestation' });
  });

  it('rejects the actual transport’s resolved session refusal before displaying controlled content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Sign in to read this controlled document.' }, 401)));
    await expect(readPersonalTraining(scope)).rejects.toThrow('Sign in to read this controlled document.');
  });

  it('does not equate an actual successful HTTP response with a confirmed audit record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: receipt, meta: {} }, 201)));
    await expect(acknowledgePersonalTraining(scope, context)).rejects.toMatchObject({ unconfirmed: true });
  });

  it.each([
    ['another account in the same organization', token('8', '12')],
    ['another organization', token('7', '13')],
    ['missing identity claims', `fixture.${btoa(JSON.stringify({ role: 'viewer' }))}.fixture`],
    ['malformed bearer', 'synthetic-malformed-token'],
  ])('refuses %s before dispatch even when React still holds the old checked declaration', async (_case, changedToken) => {
    const fetch = vi.fn(async () => json({ data: receipt, meta: { auditTrail: { persisted: true, chained: true } } }));
    vi.stubGlobal('fetch', fetch);
    setAuthToken(changedToken);
    await expect(acknowledgePersonalTraining(scope, context)).rejects.toMatchObject({ unconfirmed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not dispatch a personal write after the canonical token is removed', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    clearAuthToken();
    await expect(acknowledgePersonalTraining(scope, context)).rejects.toMatchObject({ unconfirmed: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
