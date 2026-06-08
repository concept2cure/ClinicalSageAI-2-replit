/**
 * Unit tests for the technical-file manifest builder — proves the device
 * table-of-contents is deterministic, ordered, and honest about gaps.
 */
import { describe, it, expect } from 'vitest';
import { assembleTechDoc } from '../mdr-ivdr/tech-doc-assembler';
import { buildTechnicalFileManifest } from '../technical-file-manifest';

describe('buildTechnicalFileManifest', () => {
  it('produces one ordered, deterministic entry per tech-doc section', () => {
    const result = assembleTechDoc({ regulation: 'mdr', leaves: [] });
    const m = buildTechnicalFileManifest(result);

    expect(m.regulation).toBe('mdr');
    expect(m.framework).toMatch(/MDR/);
    expect(m.entries).toHaveLength(result.sections.length);
    expect(m.totals.sections).toBe(result.sections.length);
    // Paths are numbered, slugged, and unique.
    const paths = m.entries.map(e => e.path);
    expect(paths[0]).toMatch(/^01-/);
    expect(new Set(paths).size).toBe(paths.length);
    // Deterministic: same input → identical manifest.
    expect(buildTechnicalFileManifest(assembleTechDoc({ regulation: 'mdr', leaves: [] }))).toEqual(m);
  });

  it('marks an empty file as not ready with required sections missing', () => {
    const m = buildTechnicalFileManifest(assembleTechDoc({ regulation: 'ivdr', leaves: [] }));
    expect(m.ready).toBe(false);
    expect(m.totals.requiredMissing).toBeGreaterThan(0);
    expect(m.totals.requiredPresent).toBe(0);
    expect(m.entries.some(e => e.status === 'missing')).toBe(true);
  });

  it('marks a section present (with its sources) once a matching leaf exists', () => {
    const result = assembleTechDoc({
      regulation: 'mdr',
      leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', documentType: 'gspr' }],
    });
    const m = buildTechnicalFileManifest(result);
    const gspr = m.entries.find(e => e.id === 'gspr');
    expect(gspr?.status).toBe('present');
    expect(gspr?.sources.length).toBeGreaterThan(0);
  });

  it('threads product + manufacturer metadata through', () => {
    const m = buildTechnicalFileManifest(assembleTechDoc({ regulation: 'mdr', leaves: [] }), {
      productName: 'AcmeScope',
      manufacturer: 'Acme Devices',
    });
    expect(m.productName).toBe('AcmeScope');
    expect(m.manufacturer).toBe('Acme Devices');
    expect(m.generatedFrom).toBe('canonical-core');
  });
});
