/**
 * getModule3BuildStatus — completeness is the composer's, and only the composer's.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * The status used to score each section by KEY PRESENCE over every source of a
 * matching type: `Object.keys(sourcePayload)`. So a payload key holding '' or
 * null counted as present, and a source whose `payload.status` is 'retired'
 * (which the composer excludes from every section, once, globally) still fed
 * the count. The compile path stores the composer's figures in
 * cmc_module3_sections.deterministic_json and the final-export gate refuses on
 * those — so AnA's `module3_missing_inputs`, the build board and the gate could
 * read three different answers for one project, and the status was the
 * greenest of them.
 *
 * There is one definition of "complete" in the product:
 * composeModule3FromCanonicalSources. These tests hold the status to it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SourceRow = {
  id: string;
  sourceType: string;
  sourceKey: string;
  sourcePayload: Record<string, unknown> | null;
  sourceHash: string | null;
  updatedAt: Date;
};

const sourceRows: SourceRow[] = [];
const sectionRows: any[] = [];

vi.mock('../../db', () => ({
  getPool: () => ({
    query: async (sql: string) => {
      if (sql.includes('FROM cmc_source_objects')) return { rows: sourceRows };
      if (sql.includes('FROM cmc_module3_sections')) return { rows: sectionRows };
      if (sql.includes('FROM cmc_contradictions')) return { rows: [] };
      throw new Error(`unexpected query in test: ${sql}`);
    },
  }),
}));

// The registry is out of reach on purpose: these tests are about the source →
// completeness rule, and an unaddressable spine skips the artifact read.
vi.mock('../cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: async () => ({
    state: 'unaddressable',
    artifactProjectId: null,
    detail: 'stubbed: not a projects.id',
  }),
}));

import { deriveBuildState, getModule3BuildStatus } from '../module3-convergence-service';
import {
  composeModule3FromCanonicalSources,
  MODULE3_SECTION_RULES,
  type CanonicalSource,
} from '../module3Composer';
import { composeAppendices, emittableAppendices } from '../module3-extensions';

const ORG = 7;
const PROJECT = 'proj-cmc-status-1';

let seq = 0;
function row(sourceType: string, sourcePayload: Record<string, unknown> | null): SourceRow {
  seq += 1;
  return {
    id: `src-${seq}`,
    sourceType,
    sourceKey: `${sourceType}:${seq}`,
    sourcePayload,
    sourceHash: `hash-${seq}`,
    updatedAt: new Date('2026-03-01T00:00:00Z'),
  };
}

const section = async (key: string) => {
  const { sections } = await getModule3BuildStatus(ORG, PROJECT);
  const s = sections.find((x) => x.sectionKey === key);
  if (!s) throw new Error(`section ${key} missing from status`);
  return s;
};

beforeEach(() => {
  sourceRows.length = 0;
  sectionRows.length = 0;
  seq = 0;
});

describe('getModule3BuildStatus — a required key holding an empty value is NOT present', () => {
  // 3.2.S.1 requires ['name', 'manufacturer'] from a drug_substance source.
  it("'' does not satisfy a required field", async () => {
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: '' }));
    const s = await section('3.2.S.1');
    expect(s.missingInputs).toEqual(['manufacturer']);
    expect(s.completeness).toBe(50);
  });

  it('null does not satisfy a required field', async () => {
    sourceRows.push(row('drug_substance', { name: null, manufacturer: 'Acme' }));
    const s = await section('3.2.S.1');
    expect(s.missingInputs).toEqual(['name']);
    expect(s.completeness).toBe(50);
  });

  it('a non-empty value from ANY live source of a matching type does satisfy it', async () => {
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: '' }));
    sourceRows.push(row('drug_substance', { name: '', manufacturer: 'Acme' }));
    const s = await section('3.2.S.1');
    expect(s.missingInputs).toEqual([]);
    expect(s.completeness).toBe(100);
    expect(s.sourceObjectCount).toBe(2);
  });
});

describe('getModule3BuildStatus — a retired source feeds nothing', () => {
  it('does not count toward completeness, sourceObjectCount, sourceTypes or build state', async () => {
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: 'Acme', status: 'retired' }));
    const s = await section('3.2.S.1');
    expect(s.completeness).toBe(0);
    expect(s.missingInputs).toEqual(['name', 'manufacturer']);
    expect(s.sourceObjectCount).toBe(0);
    expect(s.sourceTypes).toEqual([]);
    expect(s.buildState).toBe('no_sources');
  });

  it('is excluded from the count while its live sibling still counts', async () => {
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: 'Acme', status: 'Retired ' }));
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: 'Acme', status: 'current' }));
    const s = await section('3.2.S.1');
    expect(s.sourceObjectCount).toBe(1);
    expect(s.sourceTypes).toEqual(['drug_substance']);
    expect(s.completeness).toBe(100);
    expect(s.buildState).toBe('extraction_complete'); // a composed live source: extraction_complete in the one vocabulary the board renders
  });
});

describe('getModule3BuildStatus — equals the composer for the same sources', () => {
  function mixedFixture(): SourceRow[] {
    return [
      row('drug_substance', { name: 'API-1', manufacturer: '', manufacturingRoute: 'synthesis' }),
      row('drug_product', { dosageFormDescription: 'Tablet', composition: null, strength: '5 mg' }),
      row('specification', { acceptanceCriteria: { assay: '98-102%' }, validationStatus: 'validated', releaseCriteria: '' }),
      row('method', { methodName: 'HPLC-UV', validationStatus: 'validated' }),
      row('stability', { timePoints: [0, 3, 6], storageCondition: '25C/60RH', shelfLifeClaim: '' }),
      row('stability', { timePoints: [0, 6], storageCondition: '', status: 'retired', shelfLifeClaim: '24 months' }),
      row('batch', { batchNumber: 'B-1', formulation: 'tab', status: 'retired' }),
      row('excipient', { materialName: 'MCC', excipientSpecifications: 'NF', status: 'specified' }),
      row('container_closure', null),
    ];
  }

  it('completeness, missingInputs and sourceObjectCount match composeModule3FromCanonicalSources section-for-section', async () => {
    sourceRows.push(...mixedFixture());

    // Exactly what the compile path hands the composer: every row, mapped 1:1.
    const canonical: CanonicalSource[] = sourceRows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType as CanonicalSource['sourceType'],
      sourcePayload: r.sourcePayload ?? {},
      sourceHash: r.sourceHash ?? undefined,
    }));
    // The core sections plus the appendices the compile path emits — an
    // approved 3.2.A.* goes stale like any other section and must be reported.
    const composed = composeModule3FromCanonicalSources(canonical).concat(emittableAppendices(composeAppendices(canonical)));

    const { sections } = await getModule3BuildStatus(ORG, PROJECT);
    expect(sections.map((s) => s.sectionKey)).toEqual(composed.map((c) => c.sectionKey));

    for (const c of composed) {
      const s = sections.find((x) => x.sectionKey === c.sectionKey)!;
      expect({ key: s.sectionKey, completeness: s.completeness, missingInputs: s.missingInputs, count: s.sourceObjectCount })
        .toEqual({ key: c.sectionKey, completeness: c.completeness, missingInputs: c.missingInputs, count: c.lineage.length });
    }
  });

  it('is computed live from the sources, not read back from a compiled row', async () => {
    // A compiled row whose stored figure predates a source edit. `stale` is the
    // flag that says the stored figure is out of date; the status must not
    // report that figure as current.
    sourceRows.push(row('drug_substance', { name: 'API-1', manufacturer: '' }));
    sectionRows.push({
      sectionKey: '3.2.S.1',
      stale: true,
      staleReason: 'source data updated',
      approvalState: 'draft',
      compiledHash: 'h',
      deterministicJson: { completeness: 100, missingInputs: [] },
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });
    const s = await section('3.2.S.1');
    expect(s.completeness).toBe(50);
    expect(s.missingInputs).toEqual(['manufacturer']);
    expect(s.isStale).toBe(true);
  });
});

describe('deriveBuildState — the one derivation, in the order the gate implies', () => {
  const base = { sourceObjectCount: 2, uploadedSourceCount: 0, compiled: true, isStale: false, hasContradictions: false, approvalState: 'draft', artifactStatus: null as string | null };
  it('an approved section that went stale is stale, not approved — the gate refuses it', () => {
    expect(deriveBuildState({ ...base, approvalState: 'approved', isStale: true })).toBe('stale');
    expect(deriveBuildState({ ...base, approvalState: 'approved' })).toBe('approved');
  });
  it('staleness outranks an open contradiction; the artifact lifecycle supplies locked and review', () => {
    expect(deriveBuildState({ ...base, isStale: true, hasContradictions: true })).toBe('stale');
    expect(deriveBuildState({ ...base, hasContradictions: true })).toBe('contradiction_flagged');
    expect(deriveBuildState({ ...base, artifactStatus: 'review' })).toBe('review');
    expect(deriveBuildState({ ...base, artifactStatus: 'locked' })).toBe('locked');
    expect(deriveBuildState({ ...base, artifactStatus: 'draft' })).toBe('draft_artifact_created');
  });
  it('an uncompiled section with only uploaded documents is sources_uploaded; with composed sources extraction_complete', () => {
    expect(deriveBuildState({ ...base, compiled: false, sourceObjectCount: 0, uploadedSourceCount: 3 })).toBe('sources_uploaded');
    expect(deriveBuildState({ ...base, compiled: false })).toBe('extraction_complete');
    expect(deriveBuildState({ ...base, compiled: false, sourceObjectCount: 0 })).toBe('no_sources');
  });
});
