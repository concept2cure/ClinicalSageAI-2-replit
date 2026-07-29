/**
 * Build-from-template labeling authoring (roadmap E9) — unit tests.
 *
 * Deterministic: PLR vs QRD mandatory-section checklists, required_strings
 * derivation per mode, the section guard (complete vs missing), and the
 * build_from_template replacements. No live data, no AI.
 */
import { describe, it, expect } from 'vitest';
import {
  getLabelingModeSpec,
  modeToFormat,
  requiredSectionHeaders,
  deriveRequiredStrings,
  checkSectionGuard,
  buildTemplateReplacements,
} from '../labeling-authoring';

describe('labeling-authoring mode specs', () => {
  it('maps US → uspi/PLR and EU → smpc/QRD', () => {
    expect(modeToFormat('us')).toBe('uspi');
    expect(modeToFormat('eu')).toBe('smpc');
    expect(getLabelingModeSpec('us').structure).toBe('PLR');
    expect(getLabelingModeSpec('eu').structure).toBe('QRD');
  });

  it('cites the FDA PLR and EMA QRD bases', () => {
    expect(getLabelingModeSpec('us').basis).toMatch(/201\.56/);
    expect(getLabelingModeSpec('eu').basis).toMatch(/QRD/);
  });
});

describe('required section headers (PLR vs QRD checklists)', () => {
  it('US PLR carries the mandatory numbered full-text sections', () => {
    const h = requiredSectionHeaders('us');
    expect(h).toContain('1 INDICATIONS AND USAGE');
    expect(h).toContain('5 WARNINGS AND PRECAUTIONS');
    expect(h).toContain('17 PATIENT COUNSELING INFORMATION');
    // PLR-specific: no SmPC-style "Posology" heading leaks into US.
    expect(h.some((x) => /posology/i.test(x))).toBe(false);
  });

  it('EU QRD carries the full fixed section set including driving + MAH', () => {
    const h = requiredSectionHeaders('eu');
    expect(h).toContain('4.2 Posology and method of administration');
    expect(h).toContain('4.7 Effects on ability to drive and use machines');
    expect(h).toContain('7. MARKETING AUTHORISATION HOLDER');
    // QRD uses dotted subsection numbering, not the US flat scheme.
    expect(h.some((x) => x.startsWith('4.'))).toBe(true);
  });

  it('the two checklists differ (mode-specific completeness)', () => {
    expect(requiredSectionHeaders('us')).not.toEqual(requiredSectionHeaders('eu'));
  });
});

describe('required_strings derivation per mode', () => {
  it('derives required_strings identical to the mode section guard', () => {
    expect(deriveRequiredStrings('us')).toEqual(requiredSectionHeaders('us'));
    expect(deriveRequiredStrings('eu')).toEqual(requiredSectionHeaders('eu'));
  });
});

describe('section guard (completeness)', () => {
  it('reports complete when every US header is present (case/space tolerant)', () => {
    const draft = requiredSectionHeaders('us').join('\n').toLowerCase();
    const g = checkSectionGuard('us', draft);
    expect(g.complete).toBe(true);
    expect(g.missing).toEqual([]);
    expect(g.structure).toBe('PLR');
  });

  it('flags a missing US section (e.g. dropped Warnings and Precautions)', () => {
    const headers = requiredSectionHeaders('us').filter((h) => !/WARNINGS AND PRECAUTIONS/.test(h));
    const g = checkSectionGuard('us', headers.join('\n'));
    expect(g.complete).toBe(false);
    expect(g.missing).toContain('5 WARNINGS AND PRECAUTIONS');
  });

  it('flags a missing EU QRD section (e.g. dropped 4.8 Undesirable effects)', () => {
    const headers = requiredSectionHeaders('eu').filter((h) => !/Undesirable effects/.test(h));
    const g = checkSectionGuard('eu', headers.join('\n'));
    expect(g.complete).toBe(false);
    expect(g.missing).toContain('4.8 Undesirable effects');
  });
});

describe('build_from_template replacements', () => {
  it('seeds product name, title, basis and a placeholder per section', () => {
    const r = buildTemplateReplacements('eu', 'Examplumab');
    expect(r['{{PRODUCT_NAME}}']).toBe('Examplumab');
    expect(r['{{LABEL_TITLE}}']).toContain('Examplumab');
    expect(r['{{LABEL_BASIS}}']).toMatch(/QRD/);
    // Dotted section numbers become underscore placeholders.
    expect(r['{{SECTION_4_8}}']).toBe('4.8 Undesirable effects');
  });
});
