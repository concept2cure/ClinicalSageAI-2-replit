/**
 * Data-integrity / Part 11 advisor — unit tests. Deterministic; verifies
 * requirement resolution, ALCOA+ gap check + scoring, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseDataIntegrity, checkDataIntegrity, listDataIntegrity } from '../data-integrity';

describe('adviseDataIntegrity', () => {
  it('explains the audit-trail requirement with its citation', () => {
    const r = adviseDataIntegrity({ requirement: 'audit_trail' });
    expect(r.resolved.requirement).toBe('audit_trail');
    expect(r.brief).toContain('21 CFR 11.10(e)');
    expect(r.brief.toLowerCase()).toContain('cannot be edited');
  });

  it('resolves an alias (e-signature → esignature)', () => {
    const r = adviseDataIntegrity({ requirement: 'e-signature' });
    expect(r.resolved.requirement).toBe('esignature');
  });
});

describe('checkDataIntegrity', () => {
  it('flags gaps in a thin process description', () => {
    const r = checkDataIntegrity('Records are stored in a database.');
    expect(r.coverageScore).toBeLessThan(100);
    expect(r.gaps.map(g => g.id)).toContain('attributable');
  });

  it('credits principles that are described', () => {
    const r = checkDataIntegrity(
      'Every action is attributable to a unique user login with authentication, time-stamped ' +
        'contemporaneously, the original source data and raw data are retained as a certified copy, ' +
        'values are validated and accurate, the complete record incl. metadata is kept in chronological ' +
        'sequence, archived for the full retention period and retrievable/available for audit, legible.',
    );
    expect(r.coverageScore).toBe(100);
    expect(r.gaps).toEqual([]);
  });

  it('lists ALCOA+ principles and Part 11 control areas', () => {
    const cat = listDataIntegrity();
    expect(cat.alcoa.map(a => a.id)).toContain('attributable');
    expect(cat.alcoa).toHaveLength(9); // ALCOA + CCEA
    expect(cat.part11.map(p => p.id)).toContain('esignature');
  });
});
