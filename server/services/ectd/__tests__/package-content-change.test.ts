/**
 * An artifact changed: every package it is mapped into must stop offering a
 * bundle built from the old content.
 *
 * Nothing on a package row changes when an artifact is edited, so before this
 * existed a zip built from superseded text stayed stored and transmittable
 * until the transmit gate recomputed the content fingerprint. Each case here
 * pins one half of the rule: the invalidation itself, its audit row, and the
 * honesty of the outcome when it could not be completed (the edit has already
 * happened and must not be rolled back, so the caller is told rather than
 * given a clean result).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordGovernedActionFn = vi.fn();
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: (...a: unknown[]) => recordGovernedActionFn(...a),
}));

const { dbState } = vi.hoisted(() => ({
  dbState: {
    /** Package ids the artifact is mapped into; an Error is thrown instead. */
    packages: [] as number[] | Error,
    /** Metadata each package row holds, by id, served under the row lock. */
    metadata: {} as Record<number, Record<string, unknown>>,
    /** Package ids whose locked UPDATE throws. */
    failWrite: [] as number[],
    /** Metadata written under the lock, in order. */
    writes: [] as Array<{ packageDbId: number; metadata: Record<string, unknown> }>,
  },
}));

function makeDb() {
  const chain: any = {
    selectDistinct() { return chain; },
    select() { return chain; },
    from() { return chain; },
    innerJoin() { return chain; },
    where() {
      if (dbState.packages instanceof Error) return Promise.reject(dbState.packages);
      return Promise.resolve(dbState.packages.map((packageDbId) => ({ packageDbId })));
    },
  };
  return chain;
}

/** The pool client: one connection per lock, carrying the id it locked. */
const clientQuery = vi.fn(async function (this: { id?: number }, sql: string, params: unknown[] = []) {
  if (/FOR UPDATE/.test(sql)) {
    this.id = Number(params[0]);
    return { rows: [{ metadata: dbState.metadata[this.id] ?? {} }] };
  }
  if (/^UPDATE c2c_submission_packages/.test(sql)) {
    const packageDbId = Number(params[0]);
    if (dbState.failWrite.includes(packageDbId)) throw new Error('lock write failed');
    dbState.writes.push({ packageDbId, metadata: JSON.parse(String(params[1])) });
  }
  return { rows: [] };
});
const connectFn = vi.fn(async () => {
  const ctx: any = { release: vi.fn() };
  ctx.query = (sql: string, params?: unknown[]) => clientQuery.call(ctx, sql, params ?? []);
  return ctx;
});
vi.mock('../../../db', () => ({
  get db() { return makeDb(); },
  pool: { connect: () => connectFn(), query: vi.fn() },
}));

import { markPackagesContentChangedForArtifact } from '../package-content-change';

const BUNDLE = { path: '/bundles/a.zip', sha256: 'f'.repeat(64), sizeBytes: 9, format: 'ectd' };
const PREFLIGHT = { bundleSha256: 'f'.repeat(64), errorCount: 0, blocking: false };

beforeEach(() => {
  dbState.packages = [];
  dbState.metadata = {};
  dbState.failWrite = [];
  dbState.writes = [];
  recordGovernedActionFn.mockReset();
  recordGovernedActionFn.mockResolvedValue({ actionId: 'act_x', auditId: 'aud_x', sha256Chain: 'c' });
  connectFn.mockClear();
  clientQuery.mockClear();
});

describe('markPackagesContentChangedForArtifact', () => {
  it('invalidates EVERY package the artifact is mapped into: bundle and its preflight summary gone, revision bumped, unrelated metadata kept', async () => {
    dbState.packages = [5, 6];
    dbState.metadata[5] = { foo: 'bar', contentRevision: 3, bundle: BUNDLE, preflight: PREFLIGHT };
    dbState.metadata[6] = { bundle: BUNDLE };

    const out = await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'content' });

    expect(out).toEqual({ packagesAffected: 2, bundlesInvalidated: 2, failed: false, ledgerWriteFailed: false });
    expect(dbState.writes).toEqual([
      { packageDbId: 5, metadata: { foo: 'bar', contentRevision: 4 } },
      { packageDbId: 6, metadata: { contentRevision: 1 } },
    ]);
    // Clearing a transmittable bundle is a mutation of regulated state: it is
    // recorded, against the package, naming the artifact and what changed.
    expect(recordGovernedActionFn).toHaveBeenCalledTimes(2);
    const ledger = recordGovernedActionFn.mock.calls[0][1];
    expect(ledger).toMatchObject({ orgId: 99, userId: 777, target: 'submission:5', surface: 'artifact-editor' });
    expect(ledger.reason).toMatch(/artifact 7 had its content changed/);
    expect(ledger.payload).toMatchObject({ change: 'bundle-invalidated', cause: 'content', artifactDbId: 7 });
  });

  it('bumps a package that held no bundle, and records NOTHING for it — no regulated state changed there', async () => {
    dbState.packages = [5];
    dbState.metadata[5] = { foo: 'bar' };
    const out = await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'placement' });
    expect(out).toMatchObject({ packagesAffected: 1, bundlesInvalidated: 0, failed: false });
    expect(dbState.writes[0].metadata).toEqual({ foo: 'bar', contentRevision: 1 });
    expect(recordGovernedActionFn).not.toHaveBeenCalled();
  });

  it('names the cause the auditor needs: a rollback is not an edit', async () => {
    dbState.packages = [5];
    dbState.metadata[5] = { bundle: BUNDLE };
    await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'rollback' });
    expect(recordGovernedActionFn.mock.calls[0][1].payload.cause).toBe('rollback');
    expect(recordGovernedActionFn.mock.calls[0][1].reason).toMatch(/rollback changed/);
  });

  it('an artifact mapped nowhere invalidates nothing and reports no failure', async () => {
    dbState.packages = [];
    const out = await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'content' });
    expect(out).toEqual({ packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false });
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('REPORTS a failed invalidation instead of a clean result, and never throws at the edit that called it', async () => {
    // The lookup itself fails: nothing is known, so nothing is claimed.
    dbState.packages = new Error('db down');
    await expect(markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'content' }))
      .resolves.toEqual({ packagesAffected: 0, bundlesInvalidated: 0, failed: true, ledgerWriteFailed: false });

    // One package's lock write fails: the others are still invalidated, and the
    // failure is reported rather than folded into a clean count.
    dbState.packages = [5, 6];
    dbState.metadata[5] = { bundle: BUNDLE };
    dbState.metadata[6] = { bundle: BUNDLE };
    dbState.failWrite = [5];
    const out = await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'content' });
    expect(out).toMatchObject({ packagesAffected: 1, bundlesInvalidated: 1, failed: true });
    expect(dbState.writes.map((w) => w.packageDbId)).toEqual([6]);
    expect(clientQuery.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
  });

  it('reports a lost audit row instead of pretending the invalidation was audited', async () => {
    dbState.packages = [5];
    dbState.metadata[5] = { bundle: BUNDLE };
    recordGovernedActionFn.mockRejectedValueOnce(new Error('audit db down'));
    const out = await markPackagesContentChangedForArtifact(7, 99, { userId: 777, cause: 'content' });
    expect(out).toMatchObject({ bundlesInvalidated: 1, ledgerWriteFailed: true, failed: false });
    // The invalidation itself still happened — it must not be lost over an audit outage.
    expect(dbState.writes[0].metadata.bundle).toBeUndefined();
  });
});
