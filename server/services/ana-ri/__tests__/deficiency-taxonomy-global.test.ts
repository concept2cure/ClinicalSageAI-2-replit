/**
 * Global deficiency patterns — the rejection-risk taxonomy must now cover the
 * cross-regional failure modes a global biotech/pharma program faces (MRCT
 * consistency, ethnic-factor bridging, nitrosamines, GMP certification, RMP,
 * regional labeling) and target the expanded set of agencies. Also guards the
 * whole taxonomy's integrity (unique ids, valid enums, non-empty content).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFICIENCY_TAXONOMY,
  getDeficiencyById,
  getDeficienciesByCategory,
  type Agency,
  type Severity,
} from '../deficiency-taxonomy';

const NEW_IDS = [
  'GLOBAL-001',
  'GLOBAL-002',
  'CMC-NITROSAMINE-001',
  'GMP-CERT-001',
  'PV-RMP-001',
  'LABEL-LOCAL-001',
];

const SEVERITIES: Severity[] = ['critical', 'major', 'minor'];

describe('global deficiency patterns', () => {
  it('registers every new global pattern with references and mitigations', () => {
    for (const id of NEW_IDS) {
      const d = getDeficiencyById(id);
      expect(d, `${id} must exist`).toBeTruthy();
      expect(d!.references.length).toBeGreaterThan(0);
      expect(d!.mitigations.length).toBeGreaterThan(0);
      expect(d!.agencies.length).toBeGreaterThan(0);
    }
  });

  it('targets the expanded global agency set', () => {
    const all = new Set<Agency>();
    for (const d of DEFICIENCY_TAXONOMY) for (const a of d.agencies) all.add(a);
    for (const a of ['mhra', 'swissmedic', 'nmpa', 'anvisa'] as Agency[]) {
      expect(all, `expected some pattern to target ${a}`).toContain(a);
    }
  });

  it('cites the right ICH guidance for the global patterns', () => {
    expect(getDeficiencyById('GLOBAL-001')!.references.join(' ')).toMatch(/E17/);
    expect(getDeficiencyById('GLOBAL-002')!.references.join(' ')).toMatch(/E5/);
    expect(getDeficiencyById('CMC-NITROSAMINE-001')!.references.join(' ')).toMatch(/M7/);
    expect(getDeficiencyById('PV-RMP-001')!.references.join(' ')).toMatch(/E2E/);
  });

  it('a Global category is now queryable', () => {
    const global = getDeficienciesByCategory('Global');
    expect(global.length).toBeGreaterThanOrEqual(2);
  });
});

describe('deficiency taxonomy — integrity (whole corpus)', () => {
  it('has unique ids and well-formed entries', () => {
    const ids = DEFICIENCY_TAXONOMY.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DEFICIENCY_TAXONOMY) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
      expect(SEVERITIES).toContain(d.severity);
      expect(d.submissionTypes.length).toBeGreaterThan(0);
    }
  });

  it('related-deficiency references resolve to real ids', () => {
    const ids = new Set(DEFICIENCY_TAXONOMY.map(d => d.id));
    for (const d of DEFICIENCY_TAXONOMY) {
      for (const rel of d.relatedDeficiencies) {
        expect(ids.has(rel), `${d.id} -> ${rel} must resolve`).toBe(true);
      }
    }
  });
});
