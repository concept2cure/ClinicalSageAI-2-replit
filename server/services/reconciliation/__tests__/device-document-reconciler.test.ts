/**
 * Device cross-document reconciler — pure mapping.
 * The DB loader is thin; the reviewer-relevant logic is documentToFigures
 * (prose → reconciler figures) composed with the already-tested
 * reconcileDossierNumbers engine. These tests lock the mapping and the
 * end-to-end divergence detection across device documents.
 */

import { describe, it, expect } from 'vitest';

import { documentToFigures } from '../device-document-reconciler';
import { reconcileDossierNumbers } from '../dossier-number-reconciler';

describe('documentToFigures', () => {
  it('maps device numeric quantities to reconciler figures, skipping text identifiers', () => {
    const figures = documentToFigures({
      id: 'doc-1',
      documentType: 'psur',
      prose: 'Clinical sensitivity of 95% and specificity of 98%. Predicate device K123456 was cited. LoD was 50 copies/mL.',
    });
    const keys = figures.map(f => f.quantityKey).sort();
    expect(keys).toEqual(['lod', 'sensitivity', 'specificity']);
    // K-number is a text identifier — not a numeric figure.
    expect(figures.some(f => f.quantityKey === 'predicate_knumber')).toBe(false);
    const sens = figures.find(f => f.quantityKey === 'sensitivity')!;
    expect(sens.value).toBe(95);
    expect(sens.source.documentId).toBe('doc-1');
    expect(sens.source.section).toBe('psur');
  });

  it('carries the unit through when detected', () => {
    const figures = documentToFigures({ id: 'd', documentType: 'pmcf_evaluation', prose: 'The LoD was 50 copies/mL.' });
    expect(figures.find(f => f.quantityKey === 'lod')?.unit).toBe('copies/mL');
  });
});

describe('device reconciliation end-to-end (mapping + engine)', () => {
  it('flags a sensitivity that disagrees across two device documents as critical', () => {
    const figures = [
      ...documentToFigures({ id: 'pms', documentType: 'pms_report', prose: 'Clinical sensitivity of 95%.' }),
      ...documentToFigures({ id: 'psur', documentType: 'psur', prose: 'Clinical sensitivity of 92%.' }),
    ];
    const report = reconcileDossierNumbers({ figures });
    expect(report.conflictCount).toBe(1);
    const conflict = report.conflicts[0];
    expect(conflict.quantityKey).toBe('sensitivity');
    expect(conflict.severity).toBe('critical');
    expect(conflict.values.map(v => v.value).sort()).toEqual([92, 95]);
    expect(report.verdict).toBe('blocker');
  });

  it('is clean when the same value is restated consistently', () => {
    const figures = [
      ...documentToFigures({ id: 'a', documentType: 'pms_report', prose: 'Clinical specificity was 98% across the validation study sites.' }),
      ...documentToFigures({ id: 'b', documentType: 'psur', prose: 'Clinical specificity was 98% across the validation study sites.' }),
    ];
    expect(figures.length).toBe(2);
    const report = reconcileDossierNumbers({ figures });
    expect(report.conflictCount).toBe(0);
    expect(report.verdict).toBe('clean');
  });
});
