/**
 * A governed value is changed only by an identified user, and every living-record
 * audit row names a person or the named living-record component — never 'system'.
 *
 * Until 2026-10-15, establishGovernedFact, applyFactChange and
 * propagateFactToCitations ran with `actor: null` and wrote their 21 CFR Part 11
 * §11.10(e) row as `userId: params.actor ?? 'system'`, while the fact version
 * they wrote recorded `createdBy: null` — two answers for one change, neither of
 * them a person. The citation binder (bindSectionToFact, the persisted citation
 * scans) audited the same 'system'.
 *
 * The store is stubbed: what is under test is who the rows name, not the SQL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
  supersedeAndReversion: vi.fn(),
  upsertCanonicalFact: vi.fn(),
}));

vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../../db', () => ({
  db: {
    // scanArtifactCitations reads the artifact's prose.
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ artifactId: 'artifact_1', content: 'Enrollment was 120 subjects.', ctdSection: 'm2.5' }],
        }),
      }),
    }),
  },
  pool: {},
  getPool: () => ({}),
}));
vi.mock('../program-link', () => ({
  resolveLegacyProgram: async () => null,
  resolveUuidProgram: async () => null,
  linkLegacyProgram: async () => undefined,
}));
vi.mock('../../living-file/change-router.service', () => ({ propagateRegulatoryChange: async () => undefined }));
vi.mock('../../resolution/resolution-planner', () => ({ createResolutionPlan: async () => null }));
vi.mock('../../intelligence/cross-artifact-consistency', () => ({
  extractNumericalFacts: () => [{ label: 'enrollment', value: '120', context: 'Enrollment was 120', offset: 0 }],
}));

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
  confidence: null,
};

vi.mock('../canonical-fact-store', async importOriginal => {
  const actual = await importOriginal<typeof import('../canonical-fact-store')>();
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
    listProgramFacts: async () => [{ ...FACT }],
    bindToFact: async () => ({ id: 'binding-1' }),
    writeDrift: async () => ({ id: 'drift-1' }),
    setBindingStatus: async () => undefined,
  };
});

import { applyFactChange, establishGovernedFact } from '../fact-change-orchestrator';
import { propagateFactToCitations } from '../fact-propagation';
import { bindSectionToFact, scanArtifactCitations } from '../document-binder';

const NAMED_COMPONENT = 'system+living-record@concept2cure.local';

beforeEach(() => {
  h.logAction.mockClear();
  h.supersedeAndReversion.mockClear();
  h.upsertCanonicalFact.mockClear();
});

describe('a governed value is changed only by an identified user', () => {
  it('applyFactChange refuses a change no user made, and writes nothing', async () => {
    const r = await applyFactChange({
      factId: 'fact-1',
      organizationId: 7,
      newValue: { valueNum: 120 },
      reason: 'Protocol amendment 2',
      actor: null,
    });
    expect(r).toMatchObject({ ok: false, code: 'invalid', message: expect.stringMatching(/identified user/) });
    expect(h.supersedeAndReversion).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('establishGovernedFact refuses a value no user declared, and writes nothing', async () => {
    const r = await establishGovernedFact({
      organizationId: 7,
      programId: 'prog-1',
      entity: 'study',
      field: 'enrollment',
      value: { valueNum: 186, unit: 'subjects' },
      reason: 'Protocol v3',
      actor: null,
    });
    expect(r).toMatchObject({ ok: false, code: 'invalid', message: expect.stringMatching(/identified user/) });
    expect(h.upsertCanonicalFact).not.toHaveBeenCalled();
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('propagateFactToCitations refuses to write a value into citations for no user', async () => {
    const r = await propagateFactToCitations({
      factId: 'fact-1',
      organizationId: 7,
      reason: 'Carry the amended enrollment into the claims',
      actor: null,
    });
    expect(r).toMatchObject({ ok: false, code: 'invalid', message: expect.stringMatching(/identified user/) });
    expect(h.logAction).not.toHaveBeenCalled();
  });

  it('the audit row and the new fact version name the same person', async () => {
    const r = await applyFactChange({
      factId: 'fact-1',
      organizationId: 7,
      newValue: { valueNum: 120 },
      reason: 'Protocol amendment 2',
      actor: 3,
    });
    expect(r.ok).toBe(true);
    expect(h.supersedeAndReversion.mock.calls[0][1]).toMatchObject({ createdBy: 3 });
    expect(h.logAction.mock.calls[0][0]).toMatchObject({ action: 'canonical_fact.governed_change', userId: 3 });
  });
});

describe("a citation recorded with no user names the living-record component, not 'system'", () => {
  it('bindSectionToFact', async () => {
    const r = await bindSectionToFact({
      factId: 'fact-1',
      organizationId: 7,
      docRef: 'artifact_1',
      sectionKey: 'm2.5',
      observedValue: '186',
      actor: null,
    });
    expect(r.ok).toBe(true);
    expect(h.logAction.mock.calls[0][0]).toMatchObject({ action: 'canonical_fact.section_bound', userId: NAMED_COMPONENT });
  });

  it('scanArtifactCitations, persisted', async () => {
    const r = await scanArtifactCitations({
      programId: 'prog-1',
      organizationId: 7,
      artifactId: 'artifact_1',
      persist: true,
      actor: null,
    });
    expect(r.ok).toBe(true);
    expect(h.logAction.mock.calls[0][0]).toMatchObject({ action: 'canonical_fact.citations_bound', userId: NAMED_COMPONENT });
  });

  it('a user who bound the citation is named as that user', async () => {
    await bindSectionToFact({
      factId: 'fact-1',
      organizationId: 7,
      docRef: 'artifact_1',
      observedValue: '186',
      actor: 5,
    });
    expect(h.logAction.mock.calls[0][0]).toMatchObject({ userId: 5 });
  });
});
