/**
 * A governed fact carries a confidence only when one was stated, and a citation
 * drift the binder flags carries no severity it did not assess.
 *
 * Until 2026-10-15 a fact nobody scored was stored with confidence 0.5
 * (reconcileClaim's `?? 0.5`, the store's '0.5000', the column default), an
 * operator's governed change or an AnA-established value with 1.0, and every
 * divergent citation the binder found was rated 'medium' whatever it was.
 * list_governed_facts handed those numbers to the model as the fact's confidence.
 *
 * The store is stubbed: what is under test is what the engines pass it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
  supersedeAndReversion: vi.fn(),
  upsertCanonicalFact: vi.fn(),
  writeDrift: vi.fn(),
  listProgramFacts: vi.fn(async (): Promise<unknown[]> => []),
  claim: {} as Record<string, unknown>,
}));

vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../../db', () => ({
  db: {
    // reconcileClaim reads the claim; scanArtifactCitations reads the artifact.
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            Object.keys(h.claim).length > 0
              ? [h.claim]
              : [{ artifactId: 'artifact_1', content: 'Enrollment was 120 subjects.', ctdSection: 'm2.5' }],
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
  pool: {},
  getPool: () => ({}),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../program-link', () => ({
  resolveLegacyProgram: async () => null,
  resolveUuidProgram: async () => null,
  linkLegacyProgram: async () => undefined,
}));
vi.mock('../../c2c/program-access', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async (_db: unknown, programId: string, orgId: number) => programId === 'prog-1' && orgId === 7,
}));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async (_db: unknown, programId: string, orgId: number) => programId === 'prog-1' && orgId === 7,
}));
vi.mock('../../living-file/change-router.service', () => ({ propagateRegulatoryChange: async () => undefined }));
vi.mock('../../resolution/resolution-planner', () => ({ createResolutionPlan: async () => null }));
vi.mock('../../intelligence/cross-artifact-consistency', () => ({
  extractNumericalFacts: () => [{ label: 'enrollment', value: '120', context: 'Enrollment was 120', offset: 0 }],
}));

const { FACT, storeMock } = vi.hoisted(() => {
  const FACT = {
    id: 'fact-1',
    organizationId: 7,
    programId: 'prog-1',
    entity: 'study',
    field: 'enrollment',
    valueNum: 186,
    valueText: null,
    unit: 'subjects',
    valueType: 'count',
    comparator: '=',
    status: 'active',
    version: 1,
    confidence: null as string | null,
  };
  const storeMock = async (importOriginal: () => Promise<typeof import('../canonical-fact-store')>) => {
    const actual = await importOriginal();
    return {
      ...actual,
      resolveActiveFact: async () => null,
      getFact: async () => ({ ...FACT }),
      upsertCanonicalFact: async (...a: unknown[]) => {
        h.upsertCanonicalFact(...a);
        return { ...FACT };
      },
      supersedeAndReversion: async (...a: unknown[]) => {
        h.supersedeAndReversion(...a);
        return { ...FACT, id: 'fact-2', valueNum: 120, version: 2 };
      },
      listBindingsForFact: async () => [],
      listOpenDriftForFact: async () => [],
      listProgramFacts: (...a: unknown[]) => h.listProgramFacts(...(a as [])),
      bindToFact: async () => ({ id: 'binding-1' }),
      writeDrift: async (...a: unknown[]) => {
        h.writeDrift(...a);
        return { id: 'drift-1' };
      },
      setBindingStatus: async () => undefined,
      setFactStatus: async () => undefined,
    };
  };
  return { FACT, storeMock };
});
vi.mock('../canonical-fact-store', storeMock);
vi.mock('../canonical-fact-store.js', storeMock);

import { applyFactChange, establishGovernedFact } from '../fact-change-orchestrator';
import { reconcileClaim } from '../reconciliation-engine';
import { bindSectionToFact, scanArtifactCitations } from '../document-binder';

beforeEach(() => {
  h.logAction.mockClear();
  h.supersedeAndReversion.mockClear();
  h.upsertCanonicalFact.mockClear();
  h.writeDrift.mockClear();
  h.listProgramFacts.mockReset();
  h.listProgramFacts.mockResolvedValue([{ ...FACT }]);
  h.claim = {};
});

describe('a fact carries a confidence only when one was stated', () => {
  it("an operator's governed change is not scored 1.0", async () => {
    const r = await applyFactChange({
      factId: 'fact-1',
      organizationId: 7,
      newValue: { valueNum: 120 },
      reason: 'Protocol amendment 2',
      actor: 3,
    });
    expect(r.ok).toBe(true);
    expect(h.supersedeAndReversion.mock.calls[0][1]).toMatchObject({ confidence: null });
  });

  it('a value established with no confidence is stored unscored, not 1.0', async () => {
    const r = await establishGovernedFact({
      organizationId: 7,
      programId: 'prog-1',
      entity: 'study',
      field: 'enrollment',
      value: { valueNum: 186, unit: 'subjects' },
      reason: 'Protocol v3',
      actor: 3,
    });
    expect(r.ok).toBe(true);
    expect(h.upsertCanonicalFact.mock.calls[0][0]).toMatchObject({ confidence: null });
  });

  it('a stated confidence is kept as stated', async () => {
    await establishGovernedFact({
      organizationId: 7,
      programId: 'prog-1',
      entity: 'study',
      field: 'enrollment',
      value: { valueNum: 186 },
      confidence: 0.8,
      actor: 3,
    });
    expect(h.upsertCanonicalFact.mock.calls[0][0]).toMatchObject({ confidence: 0.8 });
  });

  it('a claim with no confidence establishes an unscored fact, not 0.5', async () => {
    h.claim = {
      id: 42,
      entity: 'study',
      field: 'enrollment',
      valueNum: '186',
      valueText: null,
      unit: 'subjects',
      valueType: 'count',
      comparator: '=',
      sourceId: 5,
      confidence: null,
      verification: 'unverified',
    };
    const out = await reconcileClaim({ claimId: 42, programId: 'prog-1', organizationId: 7, actor: 3 });
    expect(out.verdict).toBe('established');
    expect(h.upsertCanonicalFact.mock.calls[0][0]).toMatchObject({ confidence: null });
  });
});

describe('a divergent citation the binder records is not rated', () => {
  it('bindSectionToFact', async () => {
    const r = await bindSectionToFact({
      factId: 'fact-1',
      organizationId: 7,
      docRef: 'artifact_1',
      sectionKey: 'm2.5',
      observedValue: '120',
      actor: 3,
    });
    expect(r).toMatchObject({ ok: true, consistency: 'divergent' });
    expect(h.writeDrift.mock.calls[0][0]).toMatchObject({ severity: 'unrated' });
  });

  it('scanArtifactCitations, persisted', async () => {
    const r = await scanArtifactCitations({
      programId: 'prog-1',
      organizationId: 7,
      artifactId: 'artifact_1',
      persist: true,
      actor: 3,
    });
    expect(r.ok).toBe(true);
    expect(h.writeDrift).toHaveBeenCalledTimes(1);
    expect(h.writeDrift.mock.calls[0][0]).toMatchObject({ severity: 'unrated' });
  });
});

describe("AnA's list_governed_facts says 'unscored' rather than handing the model a number", () => {
  it('an unscored fact reads unscored; a scored one keeps its score', async () => {
    h.listProgramFacts.mockResolvedValue([
      { ...FACT, confidence: null },
      { ...FACT, id: 'fact-3', field: 'noael', confidence: '0.8000' },
    ]);
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    const handler = getToolHandler('list_governed_facts');
    expect(handler, 'list_governed_facts must be registered').toBeTypeOf('function');
    const res = JSON.parse(await handler!({ programId: 'prog-1' }, { organizationId: 7, userId: 3 } as never));
    expect(res.status).toBe('computed');
    expect(res.facts.map((f: { confidence: unknown }) => f.confidence)).toEqual(['unscored', '0.8000']);
  }, 120_000);
});
