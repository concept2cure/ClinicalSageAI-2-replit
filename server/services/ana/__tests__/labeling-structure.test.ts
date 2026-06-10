/**
 * Labeling-structure advisor — unit tests. Deterministic; verifies template
 * resolution, content placement with US↔EU cross-map, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseLabelingStructure, listLabelTemplates } from '../labeling-structure';

describe('adviseLabelingStructure', () => {
  it('lists the USPI section architecture', () => {
    const r = adviseLabelingStructure({ format: 'uspi' });
    expect(r.resolved.format).toBe('uspi');
    expect(r.brief).toContain('Indications and Usage');
    expect(r.brief).toContain('Warnings and Precautions');
  });

  it('resolves the SmPC via alias (spc)', () => {
    const r = adviseLabelingStructure({ format: 'spc' });
    expect(r.resolved.format).toBe('smpc');
    expect(r.brief).toContain('Posology');
  });

  it('places interaction content into USPI §7 with cross-map to SmPC 4.5', () => {
    const r = adviseLabelingStructure({ format: 'uspi', content: 'drug interaction with strong CYP3A4 inhibitors; concomitant use' });
    expect(r.placement[0].number).toBe('7');
    expect(r.placement[0].crossMap).toBe('4.5');
  });

  it('places pregnancy content into SmPC 4.6', () => {
    const r = adviseLabelingStructure({ format: 'smpc', content: 'use during pregnancy and breast-feeding; fertility' });
    expect(r.placement[0].number).toBe('4.6');
    expect(r.placement[0].crossMap).toBe('8');
  });

  it('lists both label templates', () => {
    expect(listLabelTemplates().map(t => t.id)).toEqual(['uspi', 'smpc']);
  });
});
