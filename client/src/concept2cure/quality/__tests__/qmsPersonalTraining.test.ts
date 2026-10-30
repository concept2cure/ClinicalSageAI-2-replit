import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QmsTrainingAcknowledgement, QmsTrainingContext } from '@shared/qms/training';

const request = vi.hoisted(() => vi.fn());
const TOKEN = vi.hoisted(() => `fixture.${btoa(JSON.stringify({ userId: '7', organizationId: '42' }))}.fixture`);
vi.mock('@/lib/queryClient', async () => ({
  ...await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient'),
  apiRequest: request,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import {
  acknowledgePersonalTraining,
  PersonalTrainingError,
  personalTrainingScope,
  readPersonalTraining,
} from '../qmsPersonalTraining';

const SCOPE = { documentId: 31, userId: 7, organizationId: 42 };
const PATH = '/api/mdx/qms/documents/31';
const DIGEST = 'a'.repeat(64);
const NOW = new Date('2026-10-14T12:00:00.000Z');
const RECEIPT: QmsTrainingAcknowledgement = {
  id: 51,
  documentId: 31,
  userId: 7,
  documentVersion: '2.0',
  contentDigest: DIGEST,
  acknowledgedAt: '2026-10-14T11:00:00.000Z',
  expiresAt: '2027-10-14T11:00:00.000Z',
  method: 'attestation',
};
const CONTEXT: QmsTrainingContext = {
  documentId: 31,
  docNumber: 'SOP-031',
  title: 'Supplier controls',
  documentVersion: '2.0',
  status: 'effective',
  contentDigest: DIGEST,
  eligible: true,
  canEditControlledText: false,
  unavailableReason: null,
  sections: [{ key: 'purpose', label: 'Purpose', body: 'Use the approved supplier list.\nRecord the review.' }],
  acknowledgement: null,
};
const envelope = (context: unknown = CONTEXT) => ({
  data: { id: 31, organization_id: 42, version: '2.0', status: 'effective' },
  meta: { training: context },
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response;
const saved = (receipt: unknown = RECEIPT) => ({
  data: receipt,
  meta: { auditTrail: { persisted: true, chained: true } },
});

beforeEach(() => {
  request.mockReset();
  clearAuthToken();
  setAuthToken(TOKEN);
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => { clearAuthToken(); vi.useRealTimers(); });

describe('personal training uses an explicit authenticated scope', () => {
  it('takes integer session identities without a fallback organization', () => {
    expect(personalTrainingScope({ id: '7', organizationId: '42' }, 31)).toEqual(SCOPE);
    expect(personalTrainingScope({ id: 7, organizationId: 42 }, 31)).toEqual(SCOPE);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { id: '7' },
    { id: '7', organizationId: '' },
    { id: '7', organizationId: ' 42 ' },
    { id: '07', organizationId: '42' },
    { id: true, organizationId: '42' },
    { id: '7', organizationId: '1.5' },
    { id: '7', organizationId: '2147483648' },
  ])('does not invent a scope from incomplete or invalid session %j', user => {
    expect(personalTrainingScope(user, 31)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])('rejects an invalid document id %s', documentId => {
    expect(personalTrainingScope({ id: '7', organizationId: '42' }, documentId)).toBeNull();
  });
});

describe('reading a verified personal training context', () => {
  it('uses canonical authenticated GET and retains exact released text', async () => {
    request.mockResolvedValue(response(envelope()));
    expect(await readPersonalTraining(SCOPE)).toEqual(CONTEXT);
    expect(request).toHaveBeenCalledExactlyOnceWith('GET', PATH);
  });

  it('accepts this person’s unexpired receipt for the exact released revision', async () => {
    const context = { ...CONTEXT, acknowledgement: RECEIPT };
    request.mockResolvedValue(response(envelope(context)));
    expect((await readPersonalTraining(SCOPE)).acknowledgement).toEqual(RECEIPT);
  });

  /* The row is the newest version; training reads the version in force while the
     row is its successor (in-force-release.ts; P-49). */
  const SUCCESSOR = { ...CONTEXT, documentVersion: '3.0', contentDigest: 'b'.repeat(64), inForce: false, effectiveDate: '2026-11-16' };
  const IN_FORCE = { ...CONTEXT, inForce: true, effectiveDate: '2026-09-01' };
  const rowOf = (context: unknown, data: Record<string, unknown>) => ({ ...envelope(context), data: { ...envelope().data, ...data } });

  it.each([
    ['a revision being drafted', 'draft'],
    ['a revision under review', 'in_review'],
  ])('reads the version in force while the row is %s', async (_case, status) => {
    request.mockResolvedValue(response(rowOf(IN_FORCE, { version: '3.0', status })));
    expect(await readPersonalTraining(SCOPE)).toEqual(IN_FORCE);
  });

  it('reads the version in force and its successor when the row is the version approved for a later day', async () => {
    const context = { ...IN_FORCE, successor: { ...SUCCESSOR, acknowledgement: { ...RECEIPT, documentVersion: '3.0', contentDigest: 'b'.repeat(64) } } };
    request.mockResolvedValue(response(rowOf(context, { version: '3.0', status: 'effective' })));
    expect((await readPersonalTraining(SCOPE)).successor?.acknowledgement?.documentVersion).toBe('3.0');
  });

  it.each([
    ['a draft row beside a version not said to be in force', CONTEXT, { version: '3.0', status: 'draft' }],
    ['a later effective row with no successor read', IN_FORCE, { version: '3.0', status: 'effective' }],
    ['a successor that is not the row', { ...IN_FORCE, successor: { ...SUCCESSOR, documentVersion: '4.0' } }, { version: '3.0', status: 'effective' }],
    ['a successor of another document', { ...IN_FORCE, successor: { ...SUCCESSOR, documentId: 32 } }, { version: '3.0', status: 'effective' }],
    ['another person’s receipt on the successor', { ...IN_FORCE, successor: { ...SUCCESSOR, acknowledgement: { ...RECEIPT, userId: 8, documentVersion: '3.0', contentDigest: 'b'.repeat(64) } } }, { version: '3.0', status: 'effective' }],
  ])('rejects %s', async (_case, context, data) => {
    request.mockResolvedValue(response(rowOf(context, data)));
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ unconfirmed: false, message: expect.stringMatching(/could not be verified/i) });
  });

  it('treats the canonical transport’s resolved 401 as a failed read', async () => {
    request.mockResolvedValue(response({ error: 'UNAUTHENTICATED', message: 'Sign in to read this record.' }, 401));
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ name: 'PersonalTrainingError', unconfirmed: false, message: 'Sign in to read this record.' });
  });

  it.each([null, {}, { data: [] }, { ...envelope(), meta: {} }])('rejects a malformed read without inventing an empty record %j', async body => {
    request.mockResolvedValue(response(body));
    await expect(readPersonalTraining(SCOPE)).rejects.toBeInstanceOf(PersonalTrainingError);
  });

  it('rejects an unreadable JSON response', async () => {
    request.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Lost JSON'); } });
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ unconfirmed: false, message: expect.stringMatching(/could not be verified/i) });
  });

  it.each([
    ['foreign tenant', { organization_id: 43 }],
    ['foreign document', { id: 32 }],
    ['different version', { version: '3.0' }],
    ['different release status', { status: 'retired' }],
  ])('rejects a document envelope from a %s', async (_name, patch) => {
    const body = envelope();
    request.mockResolvedValue(response({ ...body, data: { ...body.data, ...patch } }));
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ unconfirmed: false });
  });

  it.each([
    ['foreign document', { documentId: 32 }],
    ['unreleased state', { status: 'draft' }],
    ['unverified content', { contentDigest: null }],
    ['no readable bodies', { sections: [] }],
    ['outline only', { sections: [{ key: 'purpose', label: 'Purpose', hint: 'Describe the purpose.' }] }],
    ['blank body', { sections: [{ key: 'purpose', label: 'Purpose', body: ' \n ' }] }],
    ['unavailable release', { unavailableReason: 'This document has no released text.' }],
  ])('rejects an eligible context with %s', async (_name, patch) => {
    request.mockResolvedValue(response(envelope({ ...CONTEXT, ...patch })));
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ unconfirmed: false });
  });

  it('returns unavailable controlled content honestly without making it eligible', async () => {
    const unavailable = { ...CONTEXT, eligible: false, contentDigest: null, sections: [], unavailableReason: 'The release contains an artifact pointer without readable text.' };
    request.mockResolvedValue(response(envelope(unavailable)));
    expect(await readPersonalTraining(SCOPE)).toEqual(unavailable);
  });

  it.each([
    ['another person', { userId: 8 }],
    ['another document', { documentId: 32 }],
    ['another revision', { documentVersion: '1.0' }],
    ['other content', { contentDigest: 'b'.repeat(64) }],
    ['expired receipt', { expiresAt: '2026-10-14T11:59:59.999Z' }],
    ['expiry at the present instant', { expiresAt: NOW.toISOString() }],
    ['unverified legacy method', { method: 'quiz' }],
  ])('rejects a read that claims this acknowledgement belongs to %s', async (_name, patch) => {
    request.mockResolvedValue(response(envelope({ ...CONTEXT, acknowledgement: { ...RECEIPT, ...patch } })));
    await expect(readPersonalTraining(SCOPE)).rejects.toMatchObject({ unconfirmed: false });
  });
});

describe('recording a personal acknowledgement', () => {
  it('posts only the exact released version, digest and personal declaration through canonical transport', async () => {
    request.mockResolvedValue(response(saved()));
    expect(await acknowledgePersonalTraining(SCOPE, CONTEXT)).toEqual({ receipt: RECEIPT, alreadyAcknowledged: false });
    expect(request).toHaveBeenCalledExactlyOnceWith('POST', `${PATH}/training-ack`, {
      documentVersion: '2.0', contentDigest: DIGEST, understood: true, method: 'attestation',
    }, { Authorization: `Bearer ${TOKEN}`, 'x-organization-id': '42' });
  });

  it.each([
    ['unavailable content', { eligible: false }],
    ['foreign document', { documentId: 32 }],
    ['unverified content', { contentDigest: null }],
  ])('makes no write for %s', async (_name, patch) => {
    await expect(acknowledgePersonalTraining(SCOPE, { ...CONTEXT, ...patch } as QmsTrainingContext)).rejects.toMatchObject({ unconfirmed: false });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['missing audit confirmation', { data: RECEIPT, meta: {} }],
    ['unpersisted audit', { data: RECEIPT, meta: { auditTrail: { persisted: false, chained: true } } }],
    ['unchained audit', { data: RECEIPT, meta: { auditTrail: { persisted: true, chained: false } } }],
    ['malformed data', { data: {}, meta: { auditTrail: { persisted: true, chained: true } } }],
    ['missing envelope', null],
  ])('keeps %s unconfirmed rather than declaring success', async (_name, body) => {
    request.mockResolvedValue(response(body));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ name: 'PersonalTrainingError', unconfirmed: true });
  });

  it('keeps a successful status with lost JSON unconfirmed', async () => {
    request.mockResolvedValue({ ok: true, status: 201, json: async () => { throw new SyntaxError('Lost JSON'); } });
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: true });
  });

  it.each([
    ['another person', { userId: 8 }],
    ['another document', { documentId: 32 }],
    ['another revision', { documentVersion: '1.0' }],
    ['other content', { contentDigest: 'b'.repeat(64) }],
    ['an expired receipt', { expiresAt: NOW.toISOString() }],
  ])('does not confirm a receipt for %s', async (_name, patch) => {
    request.mockResolvedValue(response(saved({ ...RECEIPT, ...patch })));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: true });
  });

  it('accepts an already-current receipt without claiming another audited insertion', async () => {
    request.mockResolvedValue(response({ data: RECEIPT, meta: { alreadyAcknowledged: true } }));
    expect(await acknowledgePersonalTraining(SCOPE, CONTEXT)).toEqual({ receipt: RECEIPT, alreadyAcknowledged: true });
  });

  it('does not accept the already-current flag for another person', async () => {
    request.mockResolvedValue(response({ data: { ...RECEIPT, userId: 8 }, meta: { alreadyAcknowledged: true } }));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: true });
  });

  it.each([400, 403, 404, 409, 422])('keeps an explicit HTTP %s refusal distinct from an unknown commit', async status => {
    request.mockRejectedValue(new ApiRequestError('The released revision changed. Reload it.', status, {}, 'TRAINING_REFUSED'));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: false, message: 'The released revision changed. Reload it.' });
  });

  it('recognizes the canonical transport’s resolved 401 as a refusal', async () => {
    request.mockResolvedValue(response({ error: 'UNAUTHENTICATED', message: 'Sign in again.' }, 401));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: false, message: 'Sign in again.' });
  });

  it('keeps a confirmed audit rollback as a refusal even at HTTP 500', async () => {
    request.mockRejectedValue(new ApiRequestError('The audit record failed. Nothing was changed.', 500, {}, 'AUDIT_WRITE_FAILED'));
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: false, message: 'The audit record failed. Nothing was changed.' });
  });

  it.each([
    ['a network failure', new TypeError('Connection lost')],
    ['a request timeout', new ApiRequestError('The response timed out.', 408)],
    ['an upstream failure', new ApiRequestError('The upstream response was lost.', 502)],
    ['an unknown commit at HTTP 500', new ApiRequestError('The commit could not be confirmed.', 500, {}, 'OUTCOME_UNKNOWN')],
    ['an unknown commit at HTTP 409', new ApiRequestError('The commit could not be confirmed.', 409, {}, 'OUTCOME_UNKNOWN')],
  ])('requires reconciliation after %s', async (_name, error) => {
    request.mockRejectedValue(error);
    await expect(acknowledgePersonalTraining(SCOPE, CONTEXT)).rejects.toMatchObject({ unconfirmed: true, message: expect.stringMatching(/reload.*before trying again/i) });
  });
});
