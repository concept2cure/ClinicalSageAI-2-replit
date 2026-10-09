/**
 * The cross-object payload says what it read, or refuses (VSR-001 F-23).
 *
 * Every resolver in cross-object-resolver.ts caught its own query failure,
 * logged a warning and returned an empty result. The payload was then
 * indistinguishable from a project that has nothing in it, and every consumer
 * assessed it: executed for a program the engine could not read at all, the
 * submission readiness review completed all five steps for "Project", with 0
 * documents, and recommended "No critical issues found … All analyzers
 * returned no critical or high findings". OQ-SRDY-05 passed on that.
 *
 * A read that fails, or a project that is not in the organisation, now fails
 * the payload and names what could not be read. Every consumer already
 * reports a thrown payload honestly (a failed run, a 500 naming the cause,
 * `blocked: null`, readiness "unknown"). A project that has no records is
 * still an empty payload: rows that are absent are an answer, a read that
 * failed is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  /** Tables whose reads reject, by SQL name. */
  failing: new Set<string>(),
  /** Whether the raw-SQL reads (CMC signals, last signal) reject. */
  executeFails: false,
  /** The row `projects` answers with, or null for a project the organisation does not hold. */
  project: null as Record<string, unknown> | null,
}));

vi.mock('../../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  // A stand-in for drizzle's query builder: every call chains, and awaiting it
  // answers the rows the read would return, or rejects when its table is failing.
  function chain(table?: string): any {
    const builder: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            if (table && h.failing.has(table)) {
              return Promise.reject(new Error(`could not read ${table}`)).then(resolve, reject);
            }
            const rows = table === 'projects' ? (h.project ? [h.project] : []) : [];
            return Promise.resolve(rows).then(resolve, reject);
          };
        }
        if (prop === 'from') return (t: Parameters<typeof getTableName>[0]) => chain(getTableName(t));
        return () => builder;
      },
    });
    return builder;
  }
  return {
    db: {
      select: () => chain(),
      execute: async () => {
        if (h.executeFails) throw new Error('could not read the CMC tables');
        return { rows: [] };
      },
    },
  };
});

import { assembleCrossObjectPayload, CrossObjectReadError } from '../cross-object-resolver';

const SCOPE = { organizationId: 1, projectId: 7 };

beforeEach(() => {
  h.failing = new Set();
  h.executeFails = false;
  h.project = { id: 7, name: 'Lead program', status: 'active', progress: 10 };
});

describe('a read that fails', () => {
  it('fails the payload and names every read it took with it', async () => {
    h.failing = new Set(['concept2cure_artifacts']);

    const outcome = await assembleCrossObjectPayload(SCOPE).then(
      () => 'assembled',
      (err: unknown) => err,
    );

    expect(outcome).toBeInstanceOf(CrossObjectReadError);
    expect((outcome as CrossObjectReadError).failedReads).toEqual(
      expect.arrayContaining(['project', 'documents', 'artifacts', 'module placements']),
    );
    expect((outcome as Error).message).toMatch(/documents/);
  });

  it('never lets a project nothing could be read from be assessed', async () => {
    // What a program's uuid did to every read: the review then reported an
    // empty project with no critical issues.
    h.failing = new Set(['projects', 'concept2cure_artifacts', 'regulatory_audit_logs']);
    h.executeFails = true;

    await expect(assembleCrossObjectPayload(SCOPE)).rejects.toMatchObject({
      name: 'CrossObjectReadError',
      failedReads: expect.arrayContaining([
        'project', 'documents', 'artifacts', 'validations', 'tasks', 'module placements',
        'recent actions', 'evidence', 'CMC signals', 'last signal',
      ]),
    });
  });
});

describe('a project the organisation does not hold', () => {
  it('is refused, not assessed as "Unknown Project"', async () => {
    h.project = null;

    await expect(assembleCrossObjectPayload(SCOPE)).rejects.toMatchObject({
      name: 'CrossObjectReadError',
      failedReads: ['project'],
    });
  });
});

describe('a project with no records', () => {
  it('is an empty payload that names the project it read', async () => {
    const payload = await assembleCrossObjectPayload(SCOPE);

    expect(payload.project).toMatchObject({ id: 7, name: 'Lead program' });
    expect(payload.documents).toEqual([]);
    expect(payload.artifacts).toEqual([]);
    expect(payload.cmcSignals.sourceObjectCount).toBe(0);
    expect(payload.lastSignalAt).toBeNull();
  });
});
