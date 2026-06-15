import { describe, expect, it } from 'vitest';

import type { ProvenanceRef, RenderedReport, ReportBlock, ReportSection } from '../../render/types';
import {
  buildSealedRecord,
  canonicalizeReport,
  computeContentHash,
  extractProvenanceAtoms,
  reportIsAiDisclosed,
  verifySeal,
} from '../seal';

const FIXED_AT = '2026-06-15T00:00:00.000Z';

function report(sections: ReportSection[], overrides: Partial<RenderedReport> = {}): RenderedReport {
  return {
    reportTypeId: 'submission-readiness',
    scopeType: 'project',
    scopeId: '42',
    generatedAt: FIXED_AT,
    status: 'partial',
    sections,
    ...overrides,
  };
}

function metricBlock(provenance?: ProvenanceRef[]): ReportBlock {
  return {
    kind: 'metric',
    label: 'Readiness',
    value: 75,
    unit: '%',
    status: 'partial',
    ...(provenance ? { provenance } : {}),
  };
}

describe('canonicalizeReport', () => {
  it('is stable across object key insertion order', () => {
    // Same logical report, different key insertion order at several levels.
    const a: RenderedReport = {
      reportTypeId: 'r',
      scopeType: 'project',
      scopeId: '1',
      generatedAt: FIXED_AT,
      status: 'partial',
      sections: [
        { id: 's1', title: 'One', blocks: [{ kind: 'summary', text: 'hi' }] },
      ],
    };
    const b = {
      sections: [
        { blocks: [{ text: 'hi', kind: 'summary' }], title: 'One', id: 's1' }],
      status: 'partial',
      generatedAt: FIXED_AT,
      scopeId: '1',
      scopeType: 'project',
      reportTypeId: 'r',
    } as unknown as RenderedReport;

    expect(canonicalizeReport(a)).toBe(canonicalizeReport(b));
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it('sorts keys recursively', () => {
    const r = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'x' }] }]);
    const json = canonicalizeReport(r);
    // Within the block object, "kind" sorts before "text".
    expect(json).toContain('"kind":"summary","text":"x"');
  });
});

describe('computeContentHash', () => {
  it('is deterministic for the same report', () => {
    const r = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'x' }] }]);
    expect(computeContentHash(r)).toBe(computeContentHash(r));
  });

  it('changes when any value changes', () => {
    const r1 = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'x' }] }]);
    const r2 = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'y' }] }]);
    expect(computeContentHash(r1)).not.toBe(computeContentHash(r2));
  });
});

describe('extractProvenanceAtoms', () => {
  it('emits one atom per provenance ref with the correct blockPath', () => {
    const r = report([
      {
        id: 'metrics',
        title: 'Metrics',
        blocks: [
          { kind: 'summary', text: 'intro' },
          metricBlock([
            { sourceTable: 'artifacts', sourceField: 'count', recordId: 7, confidence: 0.9, auditId: 'a1' },
            { sourceTable: 'gaps', transformation: 'sum', recordId: '3' },
          ]),
        ],
      },
    ]);

    const atoms = extractProvenanceAtoms(r);
    expect(atoms).toHaveLength(2);
    expect(atoms[0]).toEqual({
      blockPath: 'metrics#1',
      sourceTable: 'artifacts',
      sourceField: 'count',
      recordId: 7,
      transformation: undefined,
      confidence: 0.9,
      auditId: 'a1',
    });
    expect(atoms[1].blockPath).toBe('metrics#1');
    expect(atoms[1].sourceTable).toBe('gaps');
    expect(atoms[1].transformation).toBe('sum');
  });

  it('returns [] when no block carries provenance', () => {
    const r = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'x' }, metricBlock()] }]);
    expect(extractProvenanceAtoms(r)).toEqual([]);
  });
});

describe('reportIsAiDisclosed', () => {
  it('is true when an aiGenerated narrative is present', () => {
    const r = report([
      {
        id: 's',
        title: 'T',
        blocks: [{ kind: 'narrative', text: 'auto', aiGenerated: true, disclosure: 'AI-generated' }],
      },
    ]);
    expect(reportIsAiDisclosed(r)).toBe(true);
  });

  it('is true when a disclosure block is present', () => {
    const r = report([
      {
        id: 's',
        title: 'T',
        blocks: [{ kind: 'disclosure', method: 'llm', validated: false, note: 'review needed' }],
      },
    ]);
    expect(reportIsAiDisclosed(r)).toBe(true);
  });

  it('is false otherwise', () => {
    const r = report([{ id: 's', title: 'T', blocks: [{ kind: 'summary', text: 'x' }, metricBlock()] }]);
    expect(reportIsAiDisclosed(r)).toBe(false);
  });
});

describe('buildSealedRecord / verifySeal', () => {
  function sampleReport(): RenderedReport {
    return report([
      {
        id: 'metrics',
        title: 'Metrics',
        blocks: [
          metricBlock([{ sourceTable: 'artifacts', sourceField: 'count', recordId: 7 }]),
          { kind: 'disclosure', method: 'llm', validated: true, note: 'reviewed' },
        ],
      },
    ]);
  }

  it('populates all fields including atomCount', () => {
    const rec = buildSealedRecord(sampleReport(), FIXED_AT);
    expect(rec.algorithm).toBe('sha256');
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.atoms).toHaveLength(1);
    expect(rec.atomCount).toBe(1);
    expect(rec.aiDisclosed).toBe(true);
    expect(rec.sealedAt).toBe(FIXED_AT);
  });

  it('defaults sealedAt to an ISO timestamp', () => {
    const rec = buildSealedRecord(sampleReport());
    expect(rec.sealedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('verifies ok for the same report', () => {
    const r = sampleReport();
    const rec = buildSealedRecord(r, FIXED_AT);
    expect(verifySeal(r, rec)).toEqual({ ok: true });
  });

  it('detects tampering after a block value is mutated', () => {
    const r = sampleReport();
    const rec = buildSealedRecord(r, FIXED_AT);

    // Mutate a value in place after sealing.
    const block = r.sections[0].blocks[0];
    if (block.kind === 'metric') {
      block.value = 99;
    }

    const result = verifySeal(r, rec);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('content hash mismatch — report has been modified since sealing');
  });
});
