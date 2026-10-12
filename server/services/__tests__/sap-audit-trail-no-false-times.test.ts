/**
 * A SAP audit trail states no time it does not have (2026-10-11).
 *
 * Two Part 11 defects in `getAuditTrail`, both in surviving code, both found by
 * an adversarial read rather than by use (nothing calls `/audit-trail`):
 *
 * 1. **A fabricated lock time.** `sap_versions` has no `locked_at` column, so
 *    when a version was locked is not recorded — and the `version_locked` entry
 *    was stamped `v.createdAt`. The trail therefore asserted that every locked
 *    version was locked at the instant it was created. Worse, the sort then
 *    placed the lock at or before the creation it followed.
 * 2. **A client-asserted signature read as a verified one.** No writer has set
 *    `signatureId`/`approvedBy` since `505f71263` removed `signVersion` and its
 *    route on 2026-10-08 — precisely because that route took the signer from
 *    the request body and verified nothing. On any database where it ran, the
 *    stored values remain, and this trail rendered them as a `version_signed`
 *    event with no indication of what they are.
 *
 * `null` is the honest timestamp for an event whose time is not recorded, and
 * such an entry sorts LAST for its version rather than at the Unix epoch.
 *
 * The database is stubbed: these cases are about what the trail ASSERTS from a
 * given set of rows, which needs no Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CREATED = new Date('2026-03-01T09:00:00.000Z');
const APPROVED = new Date('2026-03-05T14:30:00.000Z');
const COMMENTED = new Date('2026-03-02T11:00:00.000Z');

const rows: { versions: unknown[]; comments: unknown[]; amendments: unknown[] } = {
  versions: [], comments: [], amendments: [],
};

/* Drizzle's builder is a thenable chain; each `select()` resolves to the next
   table's rows in the order getAuditTrail reads them: thread, versions,
   comments, amendments. */
let selectCall = 0;
const chain = () => {
  const order = [
    [{ id: 7, organizationId: 1, title: 'SAP thread' }],
    rows.versions,
    rows.comments,
    rows.amendments,
  ];
  const result = order[Math.min(selectCall++, order.length - 1)];
  const self: Record<string, unknown> = {};
  for (const k of ['from', 'where', 'orderBy', 'leftJoin', 'innerJoin', 'limit']) self[k] = () => self;
  (self as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return self;
};

vi.mock('../../db', () => ({ db: { select: () => chain() } }));

import { CollaborativeSapService } from '../collaborative-sap-service';

const collaborativeSapService = new CollaborativeSapService();

const version = (over: Record<string, unknown> = {}) => ({
  id: 11, version: 1, status: 'locked', createdBy: 3, createdAt: CREATED,
  diff: [], isLocked: false, signatureId: null, approvedBy: null, approvedAt: null,
  ...over,
});

const trail = async () => {
  selectCall = 0;
  const out = await collaborativeSapService.getAuditTrail(7, 1);
  return out.auditTrail as Array<{ type: string; timestamp: Date | null; details: Record<string, unknown> }>;
};

beforeEach(() => {
  rows.versions = []; rows.comments = []; rows.amendments = [];
});
afterEach(() => vi.clearAllMocks());

describe('a locked version', () => {
  beforeEach(() => { rows.versions = [version({ isLocked: true })]; });

  it('carries no lock time, because none is recorded', async () => {
    const locked = (await trail()).find((e) => e.type === 'version_locked')!;
    expect(locked).toBeTruthy();
    expect(locked.timestamp).toBeNull();
    // The creation time must not stand in for it.
    expect(locked.timestamp).not.toEqual(CREATED);
  });

  it('says that the time is not recorded, rather than leaving it blank', async () => {
    const locked = (await trail()).find((e) => e.type === 'version_locked')!;
    expect(String(locked.details.timeNotRecorded)).toMatch(/no lock time/i);
  });

  it('sorts after the creation it followed, not at the Unix epoch', async () => {
    const t = await trail();
    expect(t.map((e) => e.type)).toEqual(['version_created', 'version_locked']);
  });

  it('keeps a timed event in its real place', async () => {
    rows.comments = [{ id: 1, sapVersionId: 11, sectionPath: '§6', createdBy: 3, createdAt: COMMENTED, resolvedAt: null }];
    const t = await trail();
    expect(t.map((e) => e.type)).toEqual(['version_created', 'comment_added', 'version_locked']);
  });
});

describe('a legacy signature row', () => {
  beforeEach(() => {
    rows.versions = [version({ signatureId: 'sig-legacy-1', approvedBy: 9, approvedAt: APPROVED })];
  });

  it('is marked unverified, with what it actually is', async () => {
    const signed = (await trail()).find((e) => e.type === 'version_signed')!;
    expect(signed.details.unverified).toBe(true);
    expect(String(signed.details.note)).toMatch(/verified nothing/i);
    expect(String(signed.details.note)).toMatch(/does not bind to the content/i);
  });

  it('keeps the recorded approval time when there is one', async () => {
    const signed = (await trail()).find((e) => e.type === 'version_signed')!;
    expect(signed.timestamp).toEqual(APPROVED);
    expect(signed.details.timestampIsCreationTime).toBeUndefined();
  });

  it('flags a signature whose time is the creation time', async () => {
    rows.versions = [version({ signatureId: 'sig-legacy-2', approvedBy: 9, approvedAt: null })];
    const signed = (await trail()).find((e) => e.type === 'version_signed')!;
    expect(signed.details.timestampIsCreationTime).toBe(true);
  });
});

describe('a version that was neither signed nor locked', () => {
  it('produces only its creation entry', async () => {
    rows.versions = [version({ status: 'draft' })];
    const t = await trail();
    expect(t.map((e) => e.type)).toEqual(['version_created']);
    expect(t[0].timestamp).toEqual(CREATED);
  });
});
