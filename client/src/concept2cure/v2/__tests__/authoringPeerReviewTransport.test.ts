// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { peerReviewScope, readPeerReview, recordPeerReview, runPeerReviewIndependentChecks } from '../surfaces/authoringPeerReview';
import type { IndependentCheckContext } from '@shared/authoring/peer-review';
import { actorToken, PEER_DOC, peerContext, peerRead, peerReceipt } from './peerReviewFixtures';

const scope = { documentId: PEER_DOC, userId: 7, organizationId: 7 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const checkReceipt = '3f2c1a10-0000-4000-8000-000000000088';
const findingId = 'b'.repeat(64);
const check = (over: Partial<IndependentCheckContext> = {}): IndependentCheckContext => ({ required: true, receiptId: checkReceipt,
  snapshotHash: peerContext.snapshotHash, checkerVersion: 'test-checker-v1', standing: 'current', semanticVerified: false,
  hardBlockCount: 1, findings: [{ findingId, category: 'missing_source', severity: 'high', hard: true, open: true, current: true }], ...over });
const checkedContext = (independentCheck = check()) => ({ ...peerContext, canRunIndependentChecks: true, independentCheck });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); clearAuthToken(); setAuthToken(actorToken()); });
afterEach(() => { clearAuthToken(); vi.unstubAllGlobals(); });

describe('existing authenticated transport for saved peer review', () => {
  it('uses the captured bearer and organization for the complete read and exact native verdict', async () => {
    const fetch = vi.fn(async (_url: string, options: { method?: string; body?: string; headers?: Record<string, string> }) => json(options.method === 'GET' ? peerRead() : peerReceipt()));
    vi.stubGlobal('fetch', fetch);
    expect(await readPeerReview(scope)).toEqual(peerContext);
    expect(await recordPeerReview(scope, peerContext, 'approved', '')).toEqual(peerReceipt().review);
    const [path, options] = fetch.mock.calls[1];
    expect(path).toBe(`/api/authoring/documents/${PEER_DOC}/review`);
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'x-organization-id': '7' } });
    expect(new Headers(options.headers).get('Authorization')).toBe(`Bearer ${actorToken()}`);
    expect(JSON.parse(String(options.body))).toEqual({ review_status: 'approved', expected: {
      reviewId: peerContext.myReview!.reviewId, requestedAt: peerContext.myReview!.requestedAt,
      snapshotHash: peerContext.snapshotHash, bindingBasis: peerContext.bindingBasis,
    } });
  });

  it('permits a refreshed token for the same actor and pins it at dispatch', async () => {
    const refreshed = `synthetic.${btoa(JSON.stringify({ userId: 7, organizationId: 7, jti: 'refreshed' }))}.fixture`;
    setAuthToken(refreshed);
    const fetch = vi.fn(async (_url: string, _options: { headers?: Record<string, string> }) => json(peerReceipt())); vi.stubGlobal('fetch', fetch);
    await recordPeerReview(scope, peerContext, 'approved', '');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe(`Bearer ${refreshed}`);
  });

  it.each([['same-org actor swap', actorToken(8, 7)], ['organization swap', actorToken(7, 8)],
    ['missing claims', `synthetic.${btoa(JSON.stringify({ role: 'reviewer' }))}.fixture`], ['malformed token', 'fixture-malformed']])(
    'refuses %s before transport even before React rerenders', async (_name, token) => {
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); setAuthToken(token);
      await expect(recordPeerReview(scope, peerContext, 'approved', '')).rejects.toThrow(/account|organization/i);
      expect(fetch).not.toHaveBeenCalled();
    });

  it('refuses missing bearer before reading the document', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); clearAuthToken();
    await expect(readPeerReview(scope)).rejects.toThrow(/account|organization/i); expect(fetch).not.toHaveBeenCalled();
  });

  it('retires an old actor response before exposing its saved document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { setAuthToken(actorToken(8, 7)); return json(peerRead()); }));
    await expect(readPeerReview(scope)).rejects.toThrow(/account|organization/i);
  });
});

describe('authoritative read context', () => {
  it.each(['actor', 'organization', 'document', 'missing snapshot', 'malformed digest'])('refuses %s mismatch', async (kind) => {
    const body = peerRead();
    if (kind === 'actor') body.reviewContext = { ...peerContext, actorId: '8' };
    if (kind === 'organization') body.reviewContext = { ...peerContext, organizationId: 8 };
    if (kind === 'document') body.reviewContext = { ...peerContext, documentId: '3f2c1a10-0000-4000-8000-000000000099' };
    if (kind === 'missing snapshot') body.reviewContext = { ...peerContext, snapshot: null } as never;
    if (kind === 'malformed digest') body.reviewContext = { ...peerContext, snapshotHash: 'not-a-digest' };
    vi.stubGlobal('fetch', vi.fn(async () => json(body)));
    await expect(readPeerReview(scope)).rejects.toThrow(/verified|reload/i);
  });

  it.each([0, -7, '07', '7.0', true, null, 2147483648])('refuses noncanonical actor %s', (id) => {
    expect(peerReviewScope({ id, organizationId: 7 }, PEER_DOC)).toBeNull();
  });
});

describe('audited exact verdict receipt', () => {
  it.each(['audit missing', 'audit false', 'actor', 'organization', 'document', 'request', 'round', 'hash', 'basis', 'verdict', 'snapshot', 'note', 'stale'])('keeps %s receipt unconfirmed', async (kind) => {
    const body = peerReceipt();
    if (kind === 'audit missing') delete (body as { auditTrail?: unknown }).auditTrail;
    if (kind === 'audit false') body.auditTrail.persisted = false;
    if (kind === 'actor') body.review.reviewer_id = '8';
    if (kind === 'organization') body.review.tenant_id = 8;
    if (kind === 'document') body.review.doc_id = '3f2c1a10-0000-4000-8000-000000000099';
    if (kind === 'request') body.review.id = '3f2c1a10-0000-4000-8000-000000000099';
    if (kind === 'round') body.review.requested_at = '2026-10-14T10:00:00Z';
    if (kind === 'hash') body.review.reviewed_snapshot_hash = 'b'.repeat(64);
    if (kind === 'basis') body.review.review_binding_basis = 'other';
    if (kind === 'verdict') body.review.review_status = 'rejected';
    if (kind === 'snapshot') body.review.reviewed_snapshot = { ...peerContext.snapshot, title: 'Different saved title' };
    if (kind === 'note') body.review.review_comments = 'Different note';
    if (kind === 'stale') body.review.standing = 'stale';
    vi.stubGlobal('fetch', vi.fn(async () => json(body)));
    await expect(recordPeerReview(scope, peerContext, 'approved', '')).rejects.toMatchObject({ reloadRequired: true });
  });

  it.each([408, 503])('requires reconciliation after HTTP%s', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'The response was interrupted.' }, status)));
    await expect(recordPeerReview(scope, peerContext, 'approved', '')).rejects.toThrow(/did not confirm whether/i);
  });

  it('shows a stale-content refusal without claiming rollback or allowing an unbound retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'The saved document changed. Reload before deciding.' }, 409)));
    await expect(recordPeerReview(scope, peerContext, 'approved', '')).rejects.toMatchObject({ reloadRequired: true, message: 'The saved document changed. Reload before deciding.' });
  });

  it.each(['', 'short'])('requires meaningful grounds before a change request with %s', async (note) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(recordPeerReview(scope, peerContext, 'changes_requested', note)).rejects.toThrow(/reason/i); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('server-bound independent check receipts', () => {
  it('dispatches only the captured saved snapshot and validates the server-issued check receipt', async () => {
    const fetch = vi.fn(async () => json({ success: true, independentCheck: check() }));
    vi.stubGlobal('fetch', fetch);
    expect(await runPeerReviewIndependentChecks(scope, checkedContext())).toEqual(check());
    const [path, options] = fetch.mock.calls[0] as unknown as [string, { body?: unknown; headers?: Record<string, string> }];
    expect(path).toBe(`/api/authoring/documents/${PEER_DOC}/review`);
    expect(JSON.parse(String(options.body))).toEqual({ action: 'run_independent_checks', expectedSnapshotHash: peerContext.snapshotHash });
    expect(new Headers(options.headers).get('Authorization')).toBe(`Bearer ${actorToken()}`);
  });

  it.each(['hash', 'receipt', 'stale', 'hard count', 'semantic claim', 'duplicates'])('keeps a %s check response unconfirmed', async kind => {
    const result = check();
    if (kind === 'hash') result.snapshotHash = 'c'.repeat(64);
    if (kind === 'receipt') result.receiptId = null;
    if (kind === 'stale') result.standing = 'stale';
    if (kind === 'hard count') result.hardBlockCount = 0;
    if (kind === 'semantic claim') (result as { semanticVerified: boolean }).semanticVerified = true;
    if (kind === 'duplicates') { result.findings.push({ ...result.findings[0] }); result.hardBlockCount = 2; }
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, independentCheck: result })));
    await expect(runPeerReviewIndependentChecks(scope, checkedContext())).rejects.toMatchObject({ reloadRequired: true });
  });

  it.each([408, 503])('requires reconciliation after an unknown check outcome HTTP%s', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Response interrupted' }, status)));
    await expect(runPeerReviewIndependentChecks(scope, checkedContext())).rejects.toThrow(/whether independent checks were recorded/i);
  });

  it('fences an account swap before dispatch and does not accept stale check metadata on a read', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); setAuthToken(actorToken(8, 7));
    await expect(runPeerReviewIndependentChecks(scope, checkedContext())).rejects.toThrow(/account|organization/i);
    expect(fetch).not.toHaveBeenCalled();
    setAuthToken(actorToken());
    vi.stubGlobal('fetch', vi.fn(async () => json(peerRead(checkedContext(check({ snapshotHash: 'c'.repeat(64) }))))));
    await expect(readPeerReview(scope)).rejects.toThrow(/verified|reload/i);
  });
});

describe('human dispositions bind to server findings without overriding hard checks', () => {
  it('automatically carries exact receipt, snapshot and finding identities for a removed finding', async () => {
    const context = checkedContext(check({ findings: [{ ...check().findings[0], current: false }] }));
    const fetch = vi.fn(async () => json(peerReceipt())); vi.stubGlobal('fetch', fetch);
    await recordPeerReview(scope, context, 'approved', '',
      { findingDrafts: { [findingId]: { decision: 'resolved', reason: '  Source link was corrected and checked.  ' } } });
    const options = fetch.mock.calls[0] as unknown as [string, { body?: unknown }];
    expect(JSON.parse(String(options[1].body)).independent_findings).toEqual({ receiptId: checkReceipt,
      snapshotHash: peerContext.snapshotHash, dispositions: [{ findingId, decision: 'resolved', reason: 'Source link was corrected and checked.' }] });
  });

  it.each(['resolve current', 'reject hard approval', 'unknown finding', 'short reason'])('refuses %s before posting a human verdict', async kind => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const key = kind === 'unknown finding' ? 'f'.repeat(64) : findingId;
    const decision = kind === 'resolve current' ? 'resolved' : 'rejected';
    await expect(recordPeerReview(scope, checkedContext(), 'approved', '',
      { findingDrafts: { [key]: { decision, reason: kind === 'short reason' ? 'short' : 'This disagreement needs further investigation.' } } })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records disagreement with a change request while retaining the blocking finding', async () => {
    const fetch = vi.fn(async () => json(peerReceipt('changes_requested'))); vi.stubGlobal('fetch', fetch);
    await recordPeerReview(scope, checkedContext(), 'changes_requested', 'The dose rationale requires revision.',
      { findingDrafts: { [findingId]: { decision: 'rejected', reason: 'The rationale should be checked by the source owner.' } } });
    const options = fetch.mock.calls[0] as unknown as [string, { body?: unknown }];
    expect(JSON.parse(String(options[1].body)).independent_findings.dispositions).toEqual([
      { findingId, decision: 'rejected', reason: 'The rationale should be checked by the source owner.' },
    ]);
  });
});
