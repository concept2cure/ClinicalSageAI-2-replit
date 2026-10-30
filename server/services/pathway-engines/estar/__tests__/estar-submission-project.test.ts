/**
 * A tracked eSTAR filing names a project of its own organization (PF-15).
 *
 * createEstarSubmission stored the body's projectId as given, so a device
 * filing could sit on another organization's project spine, or on an id naming
 * no project. It now asks projectBelongsToTenant, the one membership check,
 * before the row or its audit entry is written. The check's SQL is proven in
 * services/cmc/__tests__/project-membership.pglite.test.ts; here it is mocked
 * so project 41 is the organization's and 42 is another organization's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The filing is inserted, with its `created` event, on one transaction through
   the pg-style client the shared writers take (fold F5 item 1, 2026-10-30), and
   read back after the commit. The transaction, the client and the read back are
   fakes here; estar-submission-events.pglite.test.ts runs them on a real engine. */
const h = vi.hoisted(() => ({
  queries: [] as Array<{ text: string; params: unknown[] }>,
  logAction: vi.fn(async () => undefined),
  belongs: vi.fn(),
}));

vi.mock('../../../../db', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({}),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      const insert = h.queries.find((q) => /INSERT INTO estar_submissions/.test(q.text));
      return insert ? [{ id: 'es-1', organizationId: insert.params[0], catalogKey: insert.params[1], programType: insert.params[2], projectId: insert.params[7] }] : [];
    } }) }) }),
  },
}));
vi.mock('../../../../db/drizzle-queryable', () => ({
  queryableFromDrizzle: () => ({
    query: async (text: string, params: unknown[] = []) => {
      h.queries.push({ text, params });
      return { rows: /INSERT INTO estar_submissions/.test(text) ? [{ id: 'es-1' }] : [] };
    },
  }),
}));
vi.mock('../../../auditService', () => ({ default: { logAction: h.logAction } }));
vi.mock('../../../cmc/project-membership', () => ({ projectBelongsToTenant: h.belongs }));
vi.mock('../../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));

import { createEstarSubmission, EstarSubmissionError } from '../estar-submission-service';

const ORG = 9;
const CTX = { organizationId: ORG, userId: 55 };
const KEY = '510k';

/** The filing inserts the change wrote (its `created` event aside). */
const inserted = () => h.queries.filter((q) => /INSERT INTO estar_submissions/.test(q.text));
beforeEach(() => {
  h.queries.length = 0;
  h.logAction.mockClear();
  h.belongs.mockReset();
  h.belongs.mockImplementation(async (p: { organizationId: number; projectId: string }) => p.organizationId === ORG && p.projectId === '41');
});

describe('createEstarSubmission — the filing’s project', () => {
  it('a project of the organization is recorded on the filing', async () => {
    const row = await createEstarSubmission({ catalogKey: KEY, projectId: 41 }, CTX);
    expect(h.belongs).toHaveBeenCalledWith({ organizationId: ORG, projectId: '41' }, expect.anything());
    expect(row.projectId).toBe(41);
    expect(inserted()).toHaveLength(1);
    expect(h.logAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another organization's project", 42],
    ['an id naming no project', 9999],
  ])('%s is refused NOT_FOUND — no row, no audit entry', async (_label, projectId) => {
    const err = await createEstarSubmission({ catalogKey: KEY, projectId }, CTX).catch((e) => e);
    expect(err).toBeInstanceOf(EstarSubmissionError);
    expect((err as EstarSubmissionError).code).toBe('NOT_FOUND');
    expect(inserted()).toHaveLength(0);
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('a project lookup that cannot complete writes nothing and is not a "not found"', async () => {
    h.belongs.mockRejectedValueOnce(new Error('connection reset'));
    const err = await createEstarSubmission({ catalogKey: KEY, projectId: 41 }, CTX).catch((e) => e);
    expect(err).not.toBeInstanceOf(EstarSubmissionError);
    expect(inserted()).toHaveLength(0);
  });

  it('a filing tracked with no project yet looks nothing up and is recorded unattached', async () => {
    const row = await createEstarSubmission({ catalogKey: KEY }, CTX);
    expect(h.belongs).not.toHaveBeenCalled();
    expect(row.projectId).toBeNull();
  });
});
