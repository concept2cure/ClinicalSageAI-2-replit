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

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  logAction: vi.fn(async () => undefined),
  belongs: vi.fn(),
}));

vi.mock('../../../../db', () => ({ db: { insert: h.insert } }));
vi.mock('../../../auditService', () => ({ default: { logAction: h.logAction } }));
vi.mock('../../../cmc/project-membership', () => ({ projectBelongsToTenant: h.belongs }));
vi.mock('../../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));

import { createEstarSubmission, EstarSubmissionError } from '../estar-submission-service';

const ORG = 9;
const CTX = { organizationId: ORG, userId: 55 };
const KEY = '510k';

let inserted: Record<string, unknown>[] = [];
beforeEach(() => {
  inserted = [];
  h.insert.mockReset();
  h.insert.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return { returning: async () => [{ id: 'es-1', ...v }] };
    },
  }));
  h.logAction.mockClear();
  h.belongs.mockReset();
  h.belongs.mockImplementation(async (p: { organizationId: number; projectId: string }) => p.organizationId === ORG && p.projectId === '41');
});

describe('createEstarSubmission — the filing’s project', () => {
  it('a project of the organization is recorded on the filing', async () => {
    const row = await createEstarSubmission({ catalogKey: KEY, projectId: 41 }, CTX);
    expect(h.belongs).toHaveBeenCalledWith({ organizationId: ORG, projectId: '41' }, expect.anything());
    expect(row.projectId).toBe(41);
    expect(inserted).toHaveLength(1);
    expect(h.logAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another organization's project", 42],
    ['an id naming no project', 9999],
  ])('%s is refused NOT_FOUND — no row, no audit entry', async (_label, projectId) => {
    const err = await createEstarSubmission({ catalogKey: KEY, projectId }, CTX).catch((e) => e);
    expect(err).toBeInstanceOf(EstarSubmissionError);
    expect((err as EstarSubmissionError).code).toBe('NOT_FOUND');
    expect(inserted).toHaveLength(0);
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('a project lookup that cannot complete writes nothing and is not a "not found"', async () => {
    h.belongs.mockRejectedValueOnce(new Error('connection reset'));
    const err = await createEstarSubmission({ catalogKey: KEY, projectId: 41 }, CTX).catch((e) => e);
    expect(err).not.toBeInstanceOf(EstarSubmissionError);
    expect(inserted).toHaveLength(0);
  });

  it('a filing tracked with no project yet looks nothing up and is recorded unattached', async () => {
    const row = await createEstarSubmission({ catalogKey: KEY }, CTX);
    expect(h.belongs).not.toHaveBeenCalled();
    expect(row.projectId).toBeNull();
  });
});
