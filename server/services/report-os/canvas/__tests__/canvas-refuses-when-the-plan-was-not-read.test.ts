/**
 * Report canvases refuse when the plan was not read (2026-10-15).
 *
 * What the code used to do: createDefinition (AnA save_report_definition) and
 * suggestReportsForOrg (AnA suggest_reports) passed the resolver's `tier` on and
 * dropped `tierResolved`. The resolver turned a failed plan read into
 * 'standard' without throwing, so their own "refuse when entitlement is
 * unavailable" path never ran: a canvas of standard-tier panels was SAVED for
 * an organization whose plan nobody read (for a free organization, a grant),
 * and suggestions came back with tier 'standard' and standard reports offered.
 *
 * The resolver here is the real one; only the database answers are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportTypeRegistry } from '@shared/schema/report-os';

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), poolQuery: vi.fn() }));
vi.mock('../../../../db', () => ({
  db: { select: (...a: unknown[]) => mocks.select(...a), insert: (...a: unknown[]) => mocks.insert(...a) },
  pool: { query: (...a: unknown[]) => mocks.poolQuery(...a) },
}));
vi.mock('../../segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../segment')>()),
  deriveOrgSegments: async () => ['device'],
}));

import { createDefinition } from '../definition-service';
import { suggestReportsForOrg } from '../suggestion-service';

const REGISTRY = [{
  typeId: 'readiness.executive_digest', label: 'Executive digest', family: 'readiness',
  allowedScopes: ['project'], allowedPersonas: [], allowedClientSegments: [], enabled: true,
}];

/** A drizzle select whose result is awaitable directly or after `.where()`. */
function rows<T>(value: T[]) {
  return Object.assign(Promise.resolve(value), { where: async () => value });
}

/** `tier: null` makes the organizations.tier read fail. */
function stubDatabase(tier: string | null) {
  mocks.poolQuery.mockImplementation(async (text: string) => {
    if (text.includes('SELECT tier FROM organizations')) {
      if (tier === null) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      return { rows: [{ tier }] };
    }
    return { rows: [] };
  });
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => rows(table === reportTypeRegistry ? REGISTRY : []),
  }));
  mocks.insert.mockImplementation(() => ({
    values: () => ({ returning: async () => [{ id: 1, title: 'Readiness' }] }),
  }));
}

const CANVAS = {
  organizationId: 7,
  title: 'Readiness',
  spec: { scopeType: 'project' as const, panels: [{ reportTypeId: 'readiness.executive_digest', scopeType: 'project' as const }] },
};

beforeEach(() => {
  mocks.select.mockReset();
  mocks.insert.mockReset();
  mocks.poolQuery.mockReset();
});

describe('createDefinition', () => {
  it('saves nothing when the plan could not be read', async () => {
    stubDatabase(null);
    await expect(createDefinition(CANVAS), 'a canvas was saved on a plan nobody read')
      .rejects.toThrow('could not be read');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('control: a read standard plan saves a standard panel', async () => {
    stubDatabase('standard');
    expect(await createDefinition(CANVAS)).toMatchObject({ ok: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});

describe('suggestReportsForOrg', () => {
  it('suggests nothing on a plan nobody read', async () => {
    stubDatabase(null);
    await expect(suggestReportsForOrg(7), 'suggestions were computed on a plan nobody read')
      .rejects.toThrow('could not be read');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('control: a read plan is the tier the suggestions name', async () => {
    stubDatabase('enterprise');
    expect(await suggestReportsForOrg(7)).toMatchObject({ tier: 'enterprise' });
  });
});
