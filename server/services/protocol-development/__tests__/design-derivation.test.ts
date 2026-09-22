/**
 * Protocol → study design derivation.
 *
 * The contract under test is `docs/design/PROTOCOL_INTELLIGENCE.md`: a protocol
 * edit produces a REVIEWED PROPOSAL, never a mutation. Most of these tests
 * exist to catch the four ways a derivation destroys a design —
 *
 *   silence read as a value, conflict resolved silently, a value with no
 *   source, and a proposal applied while it would leave the spine invalid
 *
 * — so each of those is constructed deliberately rather than assumed absent.
 */
import { describe, it, expect } from 'vitest';

import {
  applyDerivation,
  deriveDesignFromProtocol,
  normalizeObjectiveLevel,
  normalizePhase,
  parseTimepoint,
  structurallyUnevidencedPaths,
  type ProtocolDerivationInput,
} from '../design-derivation';
import type { StudyDesign } from '../../study-design/study-design-types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function emptyDesign(over: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: '',
    phase: '2',
    indication: 'Type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: '', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [] },
    ...over,
  };
}

function protocol(over: Partial<ProtocolDerivationInput> = {}): ProtocolDerivationInput {
  return {
    documentId: 41,
    title: 'A Phase 3 Study of Compound X in Type 2 Diabetes',
    phase: 'Phase 3',
    designType: 'interventional',
    therapeuticArea: 'Endocrinology',
    objectives: [],
    eligibility: [],
    visits: [],
    ...over,
  };
}

const HBA1C = {
  name: 'Change from baseline in HbA1c at week 24',
  role: 'primary' as const,
  type: 'continuous' as const,
  definition: 'Absolute change in HbA1c (%) from baseline to week 24',
};

// ─── Rule 1 — silence is not a value ─────────────────────────────────────────

describe('derivation — silence is not a value', () => {
  it('reports an empty protocol register as unevidenced, never as an empty value to write', () => {
    const design = emptyDesign({
      population: {
        targetDescription: 'Adults with T2DM',
        analysisPopulations: [],
        eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0–10.5%' }],
      },
    });
    const d = deriveDesignFromProtocol(protocol({ eligibility: [] }), design);

    expect(d.unevidenced.map((u) => u.path)).toContain('population.eligibility');
    expect(d.proposed.map((p) => p.path)).not.toContain('population.eligibility');
    expect(d.conflicts.map((c) => c.path)).not.toContain('population.eligibility');
  });

  it('cannot clear a design field even when the caller asks for the unevidenced path', () => {
    const design = emptyDesign({
      population: {
        targetDescription: 'Adults with T2DM',
        analysisPopulations: [],
        eligibility: [{ type: 'inclusion', text: 'HbA1c 7.0–10.5%' }],
      },
    });
    const d = deriveDesignFromProtocol(protocol({ eligibility: [] }), design);
    const r = applyDerivation(design, d, ['population.eligibility']);

    expect(r.applied).toEqual([]);
    expect(r.rejected[0].path).toBe('population.eligibility');
    expect(r.next.population.eligibility).toHaveLength(1);
  });

  it('reports an unreadable phase with the value it could not read, and derives nothing', () => {
    const d = deriveDesignFromProtocol(protocol({ phase: 'Pivotal registration study' }), emptyDesign());
    const entry = d.unevidenced.find((u) => u.path === 'phase');

    expect(entry?.reason).toContain('Pivotal registration study');
    expect(d.proposed.map((p) => p.path)).not.toContain('phase');
    expect(d.conflicts.map((c) => c.path)).not.toContain('phase');
  });
});

// ─── Rule 2 — conflict is not resolution ─────────────────────────────────────

describe('derivation — conflict is not resolution', () => {
  it('reports a disagreement as a conflict carrying BOTH values, not as a proposal', () => {
    const design = emptyDesign({ title: 'Compound X pivotal trial' });
    const d = deriveDesignFromProtocol(protocol(), design);

    expect(d.proposed.map((p) => p.path)).not.toContain('title');
    const c = d.conflicts.find((x) => x.path === 'title');
    expect(c?.designValue).toBe('Compound X pivotal trial');
    expect(c?.protocolValue).toBe('A Phase 3 Study of Compound X in Type 2 Diabetes');
    expect(c?.why).toBeTruthy();
  });

  it('treats an unset design field as a proposal, because there is nothing to disagree with', () => {
    const d = deriveDesignFromProtocol(protocol(), emptyDesign({ title: '' }));
    expect(d.proposed.map((p) => p.path)).toContain('title');
    expect(d.conflicts.map((c) => c.path)).not.toContain('title');
  });

  it('applies a conflict only when the human accepts that exact path', () => {
    const design = emptyDesign({ title: 'Compound X pivotal trial' });
    const d = deriveDesignFromProtocol(protocol(), design);

    expect(applyDerivation(design, d, []).next.title).toBe('Compound X pivotal trial');
    expect(applyDerivation(design, d, ['title']).next.title).toBe(
      'A Phase 3 Study of Compound X in Type 2 Diabetes',
    );
  });

  it('reports an identical value as unchanged rather than proposing a no-op write', () => {
    const design = emptyDesign({ title: 'A Phase 3 Study of Compound X in Type 2 Diabetes', phase: '3' });
    const d = deriveDesignFromProtocol(protocol(), design);

    expect(d.unchanged).toContain('title');
    expect(d.unchanged).toContain('phase');
  });
});

// ─── Rule 3 — provenance per field ───────────────────────────────────────────

describe('derivation — provenance per field', () => {
  it('names the protocol rows behind every proposal, conflict and incomplete proposal', () => {
    const design = emptyDesign({ title: 'Other', endpoints: [HBA1C] });
    const d = deriveDesignFromProtocol(
      protocol({
        objectives: [
          { id: 9, objectiveType: 'primary', objective: 'Demonstrate glycaemic control', endpoint: HBA1C.name, timepoint: 'Week 24', orderIndex: 0 },
        ],
        eligibility: [{ id: 3, kind: 'inclusion', criterion: 'Adults 18–75', orderIndex: 0 }],
        visits: [{ id: 5, visitName: 'Screening', timepoint: 'Day -14', procedures: [], orderIndex: 0 }],
      }),
      design,
    );

    for (const entry of [...d.proposed, ...d.conflicts, ...d.incomplete]) {
      expect(entry.provenance.table).toBeTruthy();
      expect(entry.provenance.rowIds.length).toBeGreaterThan(0);
      expect(entry.provenance.note).toBeTruthy();
    }
    expect(d.proposed.find((p) => p.path === 'objectives')?.provenance.rowIds).toEqual([9]);
    expect(d.proposed.find((p) => p.path === 'population.eligibility')?.provenance.rowIds).toEqual([3]);
  });

  it('marks the visit timepoint parse as a text scan, not as a structured read', () => {
    const d = deriveDesignFromProtocol(
      protocol({ visits: [{ id: 5, visitName: 'Screening', timepoint: 'Day -14', procedures: [], orderIndex: 0 }] }),
      emptyDesign(),
    );
    const v = d.incomplete.find((i) => i.path === 'scheduleOfActivities.visits');
    expect(v?.provenance.confidence).toBe('text_scan');
  });
});

// ─── Rule 4 — an incomplete proposal is never applied ────────────────────────

describe('derivation — incomplete proposals', () => {
  const namedEndpoint = protocol({
    objectives: [
      { id: 9, objectiveType: 'primary', objective: 'Demonstrate glycaemic control', endpoint: HBA1C.name, timepoint: 'Week 24', orderIndex: 0 },
    ],
  });

  it('will not invent an endpoint measurement type the protocol never records', () => {
    const d = deriveDesignFromProtocol(namedEndpoint, emptyDesign());
    const e = d.incomplete.find((i) => i.path === 'endpoints');

    expect(e).toBeDefined();
    expect(e?.missing).toContain(`endpoints["${HBA1C.name}"].type`);
    expect(d.proposed.map((p) => p.path)).not.toContain('endpoints');
  });

  it('refuses to apply an incomplete proposal and says why', () => {
    const design = emptyDesign();
    const d = deriveDesignFromProtocol(namedEndpoint, design);
    const r = applyDerivation(design, d, ['endpoints']);

    expect(r.applied).toEqual([]);
    expect(r.rejected[0].reason).toContain('incomplete');
    expect(r.next.endpoints).toEqual([]);
  });

  it('refuses objectives that would leave a dangling endpoint reference in the spine', () => {
    const d = deriveDesignFromProtocol(namedEndpoint, emptyDesign());
    const o = d.incomplete.find((i) => i.path === 'objectives');

    expect(o).toBeDefined();
    expect(o?.missing.join(' ')).toContain(HBA1C.name);
    expect(d.proposed.map((p) => p.path)).not.toContain('objectives');
  });

  it('proposes those same objectives once the design carries the endpoint', () => {
    const d = deriveDesignFromProtocol(namedEndpoint, emptyDesign({ endpoints: [HBA1C] }));
    const o = d.proposed.find((p) => p.path === 'objectives');

    expect(d.incomplete.map((i) => i.path)).not.toContain('objectives');
    expect(o?.value).toEqual([
      { level: 'primary', order: 1, text: 'Demonstrate glycaemic control', endpointName: HBA1C.name },
    ]);
  });

  it('will not assign a trial epoch a visit register does not record', () => {
    const d = deriveDesignFromProtocol(
      protocol({
        visits: [
          { id: 5, visitName: 'Screening', timepoint: 'Day -14', procedures: [], orderIndex: 0 },
          { id: 6, visitName: 'Week 24', timepoint: 'Week 24 (±3d)', procedures: [], orderIndex: 1 },
        ],
      }),
      emptyDesign(),
    );
    const v = d.incomplete.find((i) => i.path === 'scheduleOfActivities.visits');

    expect(v?.missing).toEqual([
      'scheduleOfActivities.visits["Screening"].epochId',
      'scheduleOfActivities.visits["Week 24"].epochId',
    ]);
    expect(v?.partial).toEqual([
      { name: 'Screening', order: 1, studyDay: -14, timepointText: 'Day -14' },
      { name: 'Week 24', order: 2, studyDay: 168, windowDays: 3, timepointText: 'Week 24 (±3d)' },
    ]);
  });

  it('refuses an eligibility list it would have to drop rows from', () => {
    const d = deriveDesignFromProtocol(
      protocol({
        eligibility: [
          { id: 1, kind: 'inclusion', criterion: 'Adults 18–75', orderIndex: 0 },
          { id: 2, kind: 'waiver', criterion: 'Investigator discretion', orderIndex: 1 },
        ],
      }),
      emptyDesign(),
    );
    const e = d.incomplete.find((i) => i.path === 'population.eligibility');

    expect(e?.missing).toEqual(['protocol_eligibility_criteria.2.kind']);
    expect(d.proposed.map((p) => p.path)).not.toContain('population.eligibility');
  });
});

// ─── The unevidenced list is a contract ──────────────────────────────────────

describe('derivation — what the protocol structurally cannot say', () => {
  it('enumerates every unevidenced design path by name, each with a reason', () => {
    const paths = structurallyUnevidencedPaths();

    expect(paths.map((p) => p.path).sort()).toEqual(
      [
        'arms',
        'estimands',
        'framework.controlType',
        'framework.inferentialFrame',
        'framework.margin',
        'framework.structuralDesign',
        'indication',
        'population.analysisPopulations',
        'population.targetDescription',
        'productType',
        'randomization',
        'safety',
        'statisticalPlan',
        'targetRegions',
      ].sort(),
    );
    for (const p of paths) expect(p.reason.length).toBeGreaterThan(20);
  });

  it('never derives a governed statistical number from the protocol', () => {
    const d = deriveDesignFromProtocol(protocol(), emptyDesign());
    const written = [...d.proposed, ...d.conflicts].map((x) => x.path);

    expect(written.some((p) => p.startsWith('statisticalPlan'))).toBe(false);
    expect(d.unevidenced.find((u) => u.path === 'statisticalPlan')?.reason).toContain('fabricate');
  });

  it('does not read a structural design out of the protocol study type', () => {
    const d = deriveDesignFromProtocol(protocol({ designType: 'interventional' }), emptyDesign());
    const entry = d.unevidenced.find((u) => u.path === 'framework.structuralDesign');

    expect(entry?.reason).toContain('study TYPE');
    expect([...d.proposed, ...d.conflicts].map((x) => x.path)).not.toContain('framework.structuralDesign');
  });
});

// ─── Apply is pure and closed ────────────────────────────────────────────────

describe('applyDerivation', () => {
  it('never mutates the design it was given', () => {
    const design = emptyDesign({ title: 'Original' });
    const before = JSON.stringify(design);
    const d = deriveDesignFromProtocol(protocol(), design);

    applyDerivation(design, d, ['title']);
    expect(JSON.stringify(design)).toBe(before);
  });

  it('rejects a path that is not a derivable design path', () => {
    const design = emptyDesign();
    const d = deriveDesignFromProtocol(protocol(), design);
    const r = applyDerivation(design, d, ['__proto__', 'statisticalPlan.plannedSampleSize', 'indication']);

    expect(r.applied).toEqual([]);
    expect(r.rejected).toHaveLength(3);
    expect((r.next as Record<string, unknown>).indication).toBe('Type 2 diabetes');
  });

  it('applies each accepted path once, even when the caller repeats it', () => {
    const design = emptyDesign({ title: '' });
    const d = deriveDesignFromProtocol(protocol(), design);
    const r = applyDerivation(design, d, ['title', 'title']);

    expect(r.applied).toEqual(['title']);
  });
});

// ─── Normalizers and determinism ─────────────────────────────────────────────

describe('normalizers', () => {
  it('maps only the phase spellings on the list', () => {
    expect(normalizePhase('Phase 3')).toBe('3');
    expect(normalizePhase('  PHASE III ')).toBe('3');
    expect(normalizePhase('first-in-human')).toBe('FIH');
    expect(normalizePhase('Phase 2/3')).toBeNull();
    expect(normalizePhase('')).toBeNull();
    expect(normalizePhase(null)).toBeNull();
  });

  it('maps only the three objective levels', () => {
    expect(normalizeObjectiveLevel('Primary')).toBe('primary');
    expect(normalizeObjectiveLevel('co-primary')).toBeNull();
  });

  it('reads a timepoint only in the shapes it can read, and returns nothing otherwise', () => {
    expect(parseTimepoint('Day 1')).toEqual({ studyDay: 1 });
    expect(parseTimepoint('Day -14')).toEqual({ studyDay: -14 });
    expect(parseTimepoint('Week 4 (±3d)')).toEqual({ studyDay: 28, windowDays: 3 });
    expect(parseTimepoint('End of treatment')).toEqual({});
    expect(parseTimepoint(null)).toEqual({});
  });
});

describe('determinism', () => {
  it('produces byte-identical output for the same input', () => {
    const input = protocol({
      objectives: [
        { id: 9, objectiveType: 'primary', objective: 'A', endpoint: HBA1C.name, timepoint: 'Week 24', orderIndex: 1 },
        { id: 8, objectiveType: 'secondary', objective: 'B', endpoint: HBA1C.name, timepoint: null, orderIndex: 0 },
      ],
      eligibility: [{ id: 3, kind: 'exclusion', criterion: 'eGFR < 30', orderIndex: 0 }],
      visits: [{ id: 5, visitName: 'Day 1', timepoint: 'Day 1', procedures: ['ECG'], orderIndex: 0 }],
    });
    const design = emptyDesign({ endpoints: [HBA1C] });

    expect(JSON.stringify(deriveDesignFromProtocol(input, design))).toBe(
      JSON.stringify(deriveDesignFromProtocol(input, design)),
    );
  });
});
