/**
 * Module 3 Workflow Convergence — End-to-End Test Suite
 *
 * Verifies the full Module 3 pipeline: composer → compiler → contradiction engine → build state.
 * Tests the backend services directly (unit/integration style).
 *
 * Phase 8 of Module 3 Workflow Convergence work order.
 */

import { describe, it, expect } from 'vitest';
import {
  composeModule3FromCanonicalSources,
  MODULE3_SECTION_RULES,
  tablesToMarkdown,
  type CmcSourceType,
  type CanonicalSource,
  type GeneratedTable,
} from '../server/services/module3Composer';
import {
  compileModule3Sections,
  createSourceHash,
  markStaleSections,
  canFinalizeExport,
  type CmcSourceObject,
} from '../server/services/cmc-module3-compiler';
import {
  detectContradictions,
  deriveImpactTasks,
} from '../server/services/cmc-impact-contradiction-engine';

// ── Test Fixtures ─────────────────────────────────────────────────────────────

function makeSources(): CanonicalSource[] {
  return [
    { id: 'ds-1', sourceType: 'drug_substance', sourcePayload: { name: 'Amlodipine Besylate', manufacturer: 'PharmaCorp', manufacturingRoute: 'Chemical synthesis' } },
    { id: 'dp-1', sourceType: 'drug_product', sourcePayload: { dosageFormDescription: 'Tablet', composition: 'Amlodipine 5mg + excipients', strength: '5 mg', formulationDevelopment: 'v3', manufacturingProcessDev: 'wet granulation', containerClosureStudies: 'done' } },
    { id: 'sp-1', sourceType: 'specification', sourcePayload: { acceptanceCriteria: { assay: '98-102%' }, validationStatus: 'validated', releaseCriteria: 'per ICH Q6A', methodName: 'HPLC-UV' } },
    { id: 'mt-1', sourceType: 'method', sourcePayload: { methodName: 'HPLC-UV', purpose: 'assay', validationStatus: 'validated', releaseCriteria: 'ICH Q2', acceptanceCriteria: { rsd: '<2%' } } },
    { id: 'st-1', sourceType: 'stability', sourcePayload: { timePoints: [0, 3, 6, 12, 24], storageCondition: '25°C/60%RH', shelfLifeClaim: '24 months', comparabilityStatus: 'comparable', studyName: 'Long-term 25C' } },
    { id: 'ba-1', sourceType: 'batch', sourcePayload: { batchNumber: 'B-2026-001', formulation: 'Amlodipine 5mg tablet', disposition: 'released' } },
    { id: 'cc-1', sourceType: 'change_control', sourcePayload: { id: 'CC-42', status: 'approved', description: 'Process scale-up' } },
    { id: 'cm-1', sourceType: 'comparability', sourcePayload: { assessmentName: 'Pre/post scale-up', regulatoryRiskLevel: 'low', formulationDevelopment: 'v3', manufacturingProcessDev: 'wet granulation', containerClosureStudies: 'done', comparabilityStatus: 'comparable' } },
    { id: 'mp-1', sourceType: 'manufacturing_process', sourcePayload: { processDescription: 'Wet granulation → compression → coating', processControls: 'In-process blend uniformity', manufacturingRoute: 'Chemical synthesis' } },
    { id: 'ch-1', sourceType: 'characterization', sourcePayload: { structuralElucidation: 'NMR, MS confirmed', physicochemicalProperties: 'White crystalline powder, mp 201°C', biologicalActivity: 'CCB agonist IC50 2nM' } },
    { id: 'rs-1', sourceType: 'reference_standard', sourcePayload: { referenceStandardDescription: 'USP Amlodipine Besylate RS', certificateOfAnalysis: 'Lot RS-2026-01' } },
    { id: 'cl-1', sourceType: 'container_closure', sourcePayload: { containerDescription: 'HDPE bottle', closureDescription: 'Child-resistant cap', suitabilityJustification: 'Moisture barrier demonstrated' } },
    { id: 'ex-1', sourceType: 'excipient', sourcePayload: { excipientSpecifications: 'Microcrystalline cellulose NF', excipientAnalyticalProcedures: 'Per USP monograph' } },
  ];
}

function makeCompilerSources(): CmcSourceObject[] {
  return makeSources().map((s) => ({
    id: s.id,
    sourceType: s.sourceType,
    sourcePayload: s.sourcePayload,
    sourceHash: createSourceHash(s.sourcePayload),
  }));
}

// ── 1. Composer Coverage ──────────────────────────────────────────────────────

describe('Module 3 Composer — Section Rules', () => {
  it('defines exactly 17 sections (15 subsections + 3.1 + 3.3)', () => {
    expect(MODULE3_SECTION_RULES).toHaveLength(17);
  });

  it('covers all 7 Drug Substance (S) subsections', () => {
    const sKeys = MODULE3_SECTION_RULES.filter((r) => r.sectionKey.startsWith('3.2.S.')).map((r) => r.sectionKey);
    expect(sKeys).toEqual(['3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7']);
  });

  it('covers all 8 Drug Product (P) subsections', () => {
    const pKeys = MODULE3_SECTION_RULES.filter((r) => r.sectionKey.startsWith('3.2.P.')).map((r) => r.sectionKey);
    expect(pKeys).toEqual(['3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.4', '3.2.P.5', '3.2.P.6', '3.2.P.7', '3.2.P.8']);
  });

  it('includes structural sections 3.1 and 3.3', () => {
    const keys = MODULE3_SECTION_RULES.map((r) => r.sectionKey);
    expect(keys).toContain('3.1');
    expect(keys).toContain('3.3');
  });

  it('every rule has at least one requiredSourceType', () => {
    for (const rule of MODULE3_SECTION_RULES) {
      expect(rule.requiredSourceTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every rule has at least one requiredField', () => {
    for (const rule of MODULE3_SECTION_RULES) {
      expect(rule.requiredFields.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── 2. Source Type Expansion ──────────────────────────────────────────────────

describe('Module 3 Source Types', () => {
  const ALL_EXPECTED_TYPES: CmcSourceType[] = [
    'drug_substance', 'drug_product', 'specification', 'method', 'stability',
    'batch', 'change_control', 'comparability',
    'manufacturing_process', 'characterization', 'reference_standard', 'container_closure', 'excipient',
  ];

  it('all 13 source types are usable in fixtures', () => {
    const sources = makeSources();
    const usedTypes = new Set(sources.map((s) => s.sourceType));
    for (const t of ALL_EXPECTED_TYPES) {
      expect(usedTypes.has(t)).toBe(true);
    }
  });

  it('new source types appear in at least one section rule', () => {
    const newTypes: CmcSourceType[] = ['manufacturing_process', 'characterization', 'reference_standard', 'container_closure', 'excipient'];
    for (const t of newTypes) {
      const found = MODULE3_SECTION_RULES.some((r) => r.requiredSourceTypes.includes(t));
      expect(found).toBe(true);
    }
  });
});

// ── 3. Composition from Canonical Sources ─────────────────────────────────────

describe('Module 3 Composer — Full Composition', () => {
  it('produces exactly 17 sections from full source set', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    expect(composed).toHaveLength(17);
  });

  it('each composed section has required fields including tables array', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    for (const section of composed) {
      expect(section.sectionKey).toBeTruthy();
      expect(section.structuredPayload).toBeDefined();
      expect(typeof section.completeness).toBe('number');
      expect(Array.isArray(section.missingInputs)).toBe(true);
      expect(Array.isArray(section.lineage)).toBe(true);
      expect(Array.isArray(section.tables)).toBe(true);
    }
  });

  it('sections with all required fields have high completeness', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1');
    expect(s1).toBeDefined();
    expect(s1!.completeness).toBe(100);
    expect(s1!.missingInputs).toHaveLength(0);
  });

  it('lineage traces back to source objects', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.lineage.length).toBeGreaterThan(0);
    expect(s1.lineage[0].sourceObjectId).toBe('ds-1');
    expect(s1.lineage[0].sourceHashAtCompile).toBeTruthy();
  });
});

// ── 4. Completeness Scoring ───────────────────────────────────────────────────

describe('Module 3 Composer — Completeness', () => {
  it('returns 100% when all required fields are present', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.completeness).toBe(100);
  });

  it('returns lower completeness when fields are missing', () => {
    const partialSources: CanonicalSource[] = [
      { id: 'ds-partial', sourceType: 'drug_substance', sourcePayload: { name: 'Amlodipine' } },
      // manufacturer missing for 3.2.S.1
    ];
    const composed = composeModule3FromCanonicalSources(partialSources);
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.completeness).toBe(50); // 1 of 2 fields
    expect(s1.missingInputs).toContain('manufacturer');
  });

  it('returns 0% when no matching sources exist and generates empty tables', () => {
    const composed = composeModule3FromCanonicalSources([]);
    for (const section of composed) {
      expect(section.completeness).toBe(0);
      expect(section.tables).toHaveLength(0);
    }
  });
});

// ── 5. Missing Input Diagnostics ──────────────────────────────────────────────

describe('Module 3 Composer — Missing Inputs', () => {
  it('lists specific missing fields', () => {
    const sources: CanonicalSource[] = [
      { id: 'ds-1', sourceType: 'drug_substance', sourcePayload: { name: 'Test' } },
    ];
    const composed = composeModule3FromCanonicalSources(sources);
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.missingInputs).toContain('manufacturer');
    expect(s1.missingInputs).not.toContain('name');
  });

  it('reports all fields missing when no sources match', () => {
    const composed = composeModule3FromCanonicalSources([]);
    const s4 = composed.find((s) => s.sectionKey === '3.2.S.4')!;
    expect(s4.missingInputs).toEqual(['acceptanceCriteria', 'validationStatus']);
  });
});

// ── 6. Compiler ───────────────────────────────────────────────────────────────

describe('Module 3 Compiler', () => {
  it('compiles all 17 sections', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    expect(compiled).toHaveLength(17);
  });

  it('each compiled section has a deterministic hash', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    for (const section of compiled) {
      expect(section.compiledHash).toBeTruthy();
      expect(section.compiledHash.length).toBe(64); // SHA-256 hex
    }
  });

  it('compiled sections are not stale by default', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    for (const section of compiled) {
      expect(section.stale).toBe(false);
      expect(section.staleReason).toBeNull();
    }
  });
});

// ── 7. Stale Section Marking ──────────────────────────────────────────────────

describe('Module 3 Compiler — Stale Marking', () => {
  it('marks sections that use the changed source type as stale', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    const marked = markStaleSections(compiled, 'stability', 'New stability data uploaded');
    // 3.2.S.7 and 3.2.P.8 use stability
    const s7 = marked.find((s) => s.sectionKey === '3.2.S.7')!;
    const p8 = marked.find((s) => s.sectionKey === '3.2.P.8')!;
    expect(s7.stale).toBe(true);
    expect(s7.staleReason).toBe('New stability data uploaded');
    expect(p8.stale).toBe(true);
  });

  it('does not mark unrelated sections as stale', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    const marked = markStaleSections(compiled, 'stability', 'reason');
    const s1 = marked.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.stale).toBe(false);
  });

  it('marks batch-dependent sections for batch changes', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    const marked = markStaleSections(compiled, 'batch', 'New batch record');
    const p3 = marked.find((s) => s.sectionKey === '3.2.P.3')!;
    expect(p3.stale).toBe(true);
  });
});

// ── 8. Source Hash Determinism ─────────────────────────────────────────────────

describe('Module 3 Compiler — Source Hash', () => {
  it('produces same hash for same payload', () => {
    const payload = { name: 'Test', value: 42 };
    expect(createSourceHash(payload)).toBe(createSourceHash(payload));
  });

  it('produces same hash regardless of key order', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(createSourceHash(a)).toBe(createSourceHash(b));
  });

  it('produces different hash for different payloads', () => {
    const a = { name: 'A' };
    const b = { name: 'B' };
    expect(createSourceHash(a)).not.toBe(createSourceHash(b));
  });

  it('produces 64-char hex string (SHA-256)', () => {
    const hash = createSourceHash({ test: true });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ── 9. Contradiction Detection ────────────────────────────────────────────────

describe('Module 3 Contradiction Engine', () => {
  it('detects batch_rejected contradiction', () => {
    const result = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].contradictionType).toBe('batch_rejected');
    expect(result[0].severity).toBe('critical');
    expect(result[0].impactedSections).toContain('3.2.P.3');
  });

  it('detects comparability_risk contradiction', () => {
    const result = detectContradictions({
      comparability: [{ assessmentName: 'Scale-up', regulatoryRiskLevel: 'critical' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].contradictionType).toBe('comparability_risk');
    expect(result[0].impactedSections).toContain('3.2.P.8');
  });

  it('detects stability_failure contradiction', () => {
    const result = detectContradictions({
      stability: [{ studyName: 'Accelerated 40C', status: 'failed' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].contradictionType).toBe('stability_failure');
    expect(result[0].severity).toBe('high');
    expect(result[0].impactedSections).toContain('3.2.S.7');
  });

  it('returns no contradictions when all data is clean', () => {
    const result = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'released' }],
      stability: [{ studyName: 'LT', status: 'passing' }],
      comparability: [{ assessmentName: 'Test', regulatoryRiskLevel: 'low' }],
    });
    expect(result).toHaveLength(0);
  });

  it('detects multiple contradictions simultaneously', () => {
    const result = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
      stability: [{ studyName: 'Acc', status: 'failed' }],
      comparability: [{ assessmentName: 'X', regulatoryRiskLevel: 'critical' }],
    });
    expect(result).toHaveLength(3);
  });
});

// ── 10. Impact Tasks ──────────────────────────────────────────────────────────

describe('Module 3 Contradiction Engine — Impact Tasks', () => {
  it('derives tasks from contradictions', () => {
    const contradictions = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
    });
    const tasks = deriveImpactTasks(contradictions);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain('batch_rejected');
    expect(tasks[0].priority).toBe('P0'); // critical → P0
  });

  it('assigns correct priority levels', () => {
    const contradictions = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
      stability: [{ studyName: 'X', status: 'failed' }],
    });
    const tasks = deriveImpactTasks(contradictions);
    const batchTask = tasks.find((t) => t.title.includes('batch_rejected'))!;
    const stabilityTask = tasks.find((t) => t.title.includes('stability_failure'))!;
    expect(batchTask.priority).toBe('P0');
    expect(stabilityTask.priority).toBe('P1');
  });
});

// ── 11. Finalize Export Gate ──────────────────────────────────────────────────

describe('Module 3 Compiler — Finalize Export', () => {
  it('allows export when approved and no unresolved critical contradictions', () => {
    expect(canFinalizeExport({
      approvalState: 'approved',
      contradictions: [{ severity: 'critical', status: 'resolved' }],
    })).toBe(true);
  });

  it('blocks export when not approved', () => {
    expect(canFinalizeExport({
      approvalState: 'draft',
      contradictions: [],
    })).toBe(false);
  });

  it('blocks export when unresolved critical contradictions exist', () => {
    expect(canFinalizeExport({
      approvalState: 'approved',
      contradictions: [{ severity: 'critical', status: 'open' }],
    })).toBe(false);
  });

  it('allows export with unresolved non-critical contradictions', () => {
    expect(canFinalizeExport({
      approvalState: 'approved',
      contradictions: [{ severity: 'high', status: 'open' }],
    })).toBe(true);
  });
});

// ── 12. Full Pipeline Integration ─────────────────────────────────────────────

describe('Module 3 Full Pipeline — Compose → Compile → Contradict', () => {
  it('full pipeline produces consistent results', () => {
    const sources = makeSources();
    const composed = composeModule3FromCanonicalSources(sources);
    expect(composed).toHaveLength(17);

    const compilerSources = makeCompilerSources();
    const compiled = compileModule3Sections(compilerSources);
    expect(compiled).toHaveLength(17);

    // All compiled hashes should be stable
    const compiled2 = compileModule3Sections(compilerSources);
    for (let i = 0; i < compiled.length; i++) {
      expect(compiled[i].compiledHash).toBe(compiled2[i].compiledHash);
    }

    // No contradictions with clean data
    const contradictions = detectContradictions({
      batch: [{ batchNumber: 'B-2026-001', disposition: 'released' }],
      stability: [{ studyName: 'Long-term 25C', status: 'passing' }],
      comparability: [{ assessmentName: 'Pre/post scale-up', regulatoryRiskLevel: 'low' }],
    });
    expect(contradictions).toHaveLength(0);
  });

  it('stale marking after source change invalidates correct sections', () => {
    const compiled = compileModule3Sections(makeCompilerSources());

    // Simulate new specification data
    const marked = markStaleSections(compiled, 'specification', 'Spec v2 uploaded');
    const staleSections = marked.filter((s) => s.stale);

    // 3.2.S.4 and 3.2.P.5 both depend on specification
    const staleKeys = staleSections.map((s) => s.sectionKey);
    expect(staleKeys).toContain('3.2.S.4');
    expect(staleKeys).toContain('3.2.P.5');

    // Sections not using specification should be unaffected
    const s1 = marked.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.stale).toBe(false);
  });

  it('contradiction + stale combo blocks finalization', () => {
    const compiled = compileModule3Sections(makeCompilerSources());
    const staleMarked = markStaleSections(compiled, 'batch', 'Batch rejected');

    const contradictions = detectContradictions({
      batch: [{ batchNumber: 'B-001', disposition: 'rejected' }],
    });
    expect(contradictions.length).toBeGreaterThan(0);

    // Even if approved, unresolved critical contradiction blocks export
    expect(canFinalizeExport({
      approvalState: 'approved',
      contradictions: contradictions.map((c) => ({ severity: c.severity, status: 'open' })),
    })).toBe(false);
  });
});

// ── 13. Narrative Generation (Real Prose, Not Placeholders) ───────────────────

describe('Module 3 Composer — Narrative Generation', () => {
  it('generates drug substance name in 3.2.S.1 narrative', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.narrativeDraft).toContain('Amlodipine Besylate');
    expect(s1.narrativeDraft).toContain('PharmaCorp');
    expect(s1.narrativeDraft.length).toBeGreaterThan(50);
  });

  it('generates manufacturing narrative for 3.2.S.2', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s2 = composed.find((s) => s.sectionKey === '3.2.S.2')!;
    expect(s2.narrativeDraft).toContain('Chemical synthesis');
    expect(s2.narrativeDraft).toContain('Wet granulation');
  });

  it('generates stability narrative for 3.2.S.7', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s7 = composed.find((s) => s.sectionKey === '3.2.S.7')!;
    expect(s7.narrativeDraft).toContain('25°C/60%RH');
    expect(s7.narrativeDraft).toContain('stable');
  });

  it('generates drug product description for 3.2.P.1', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const p1 = composed.find((s) => s.sectionKey === '3.2.P.1')!;
    expect(p1.narrativeDraft).toContain('Tablet');
    expect(p1.narrativeDraft).toContain('5 mg');
  });

  it('generates shelf-life narrative for 3.2.P.8', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const p8 = composed.find((s) => s.sectionKey === '3.2.P.8')!;
    expect(p8.narrativeDraft).toContain('24 months');
    expect(p8.narrativeDraft).toContain('comparable');
  });

  it('generates empty-data narrative when no sources match', () => {
    const composed = composeModule3FromCanonicalSources([]);
    const s1 = composed.find((s) => s.sectionKey === '3.2.S.1')!;
    expect(s1.narrativeDraft).toContain('no source data');
    expect(s1.narrativeDraft).toContain('name');
  });

  it('every populated section has narrative longer than 50 chars', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    for (const section of composed) {
      expect(section.narrativeDraft.length).toBeGreaterThan(50);
    }
  });
});

// ── 14. Table Generation ──────────────────────────────────────────────────────

describe('Module 3 Composer — Table Generation', () => {
  it('generates at least one table per populated section', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    for (const section of composed) {
      expect(section.tables.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('tables have headers and rows', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    for (const section of composed) {
      for (const table of section.tables) {
        expect(table.title).toBeTruthy();
        expect(table.headers.length).toBeGreaterThan(0);
        expect(table.rows.length).toBeGreaterThan(0);
      }
    }
  });

  it('3.2.S.4 generates specification table with acceptance criteria', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s4 = composed.find((s) => s.sectionKey === '3.2.S.4')!;
    expect(s4.tables.length).toBeGreaterThanOrEqual(1);
    const specTable = s4.tables.find((t) => t.title.includes('Specification'));
    expect(specTable).toBeDefined();
    expect(specTable!.headers).toContain('Test');
    expect(specTable!.headers).toContain('Acceptance Criteria');
  });

  it('3.2.P.3 generates batch formula table', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const p3 = composed.find((s) => s.sectionKey === '3.2.P.3')!;
    expect(p3.tables.length).toBeGreaterThanOrEqual(1);
    const batchRows = p3.tables[0].rows.flat();
    expect(batchRows).toContain('B-2026-001');
  });

  it('3.1 generates Module 3 table of contents', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s31 = composed.find((s) => s.sectionKey === '3.1')!;
    expect(s31.tables.length).toBeGreaterThanOrEqual(1);
    const tocTable = s31.tables[0];
    expect(tocTable.title).toContain('Table of Contents');
    expect(tocTable.rows.length).toBe(15); // 15 subsection entries
  });

  it('tablesToMarkdown produces valid markdown', () => {
    const tables: GeneratedTable[] = [
      { title: 'Test', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
    ];
    const md = tablesToMarkdown(tables);
    expect(md).toContain('### Test');
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });
});

// ── 15. Structural Sections 3.1 and 3.3 ──────────────────────────────────────

describe('Module 3 Structural Sections — 3.1 and 3.3', () => {
  it('3.1 generates overview narrative with drug substance name', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s31 = composed.find((s) => s.sectionKey === '3.1')!;
    expect(s31).toBeDefined();
    expect(s31.narrativeDraft).toContain('Amlodipine Besylate');
    expect(s31.narrativeDraft).toContain('Module 3');
  });

  it('3.3 generates literature references section', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s33 = composed.find((s) => s.sectionKey === '3.3')!;
    expect(s33).toBeDefined();
    expect(s33.narrativeDraft).toContain('literature references');
    expect(s33.tables.length).toBeGreaterThanOrEqual(1);
    expect(s33.tables[0].title).toContain('References');
  });

  it('3.1 and 3.3 have correct lineage to drug_substance and drug_product', () => {
    const composed = composeModule3FromCanonicalSources(makeSources());
    const s31 = composed.find((s) => s.sectionKey === '3.1')!;
    const lineageIds = s31.lineage.map((l) => l.sourceObjectId);
    expect(lineageIds).toContain('ds-1');
    expect(lineageIds).toContain('dp-1');
  });
});
