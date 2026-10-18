import { describe, expect, it } from 'vitest';
import type { ImportedSection } from '../../../import/docx-to-authoring';
import { allocateImportedSectionCodes } from '../authoring-source-conversion';

const section = (code: string | null, title = 'Source heading'): ImportedSection => ({
  code, title, html: `<p>${title} body</p>`, level: 1,
});

describe('source section identifiers preserve every Word passage', () => {
  it('keeps the first coded heading and names each repeated heading in its working-code warning', () => {
    const sections = [section('3.2.S.4.1', 'Specification'), section('3.2.S.4.1', 'Specification continued'),
      section('3.2.S.4.1', 'Additional assay')];
    const before = JSON.stringify(sections);
    const result = allocateImportedSectionCodes(sections);
    expect(result.codes).toEqual(['3.2.S.4.1', 'import.2', 'import.3']);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('3.2.S.4.1 Specification continued');
    expect(result.warnings[0]).toContain('import.2');
    expect(result.warnings.join(' ')).toContain('not a CTD filing location');
    expect(JSON.stringify(sections)).toBe(before);
    expect(allocateImportedSectionCodes(sections)).toEqual(result);
  });

  it('reserves all recorded codes before assigning uncoded or repeated working identifiers', () => {
    const result = allocateImportedSectionCodes([section(null), section('IMPORT.1'), section('3.2.S.1'),
      section('3.2.s.1'), section('import.4'), section(null)]);
    expect(result.codes).toEqual(['import.2', 'IMPORT.1', '3.2.S.1', 'import.5', 'import.4', 'import.6']);
    expect(new Set(result.codes.map(code => code.trim().toUpperCase())).size).toBe(result.codes.length);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('3.2.s.1 Source heading');
  });

  it('retains unique recorded codes and the existing single-section source coordinate without extra warnings', () => {
    expect(allocateImportedSectionCodes([section('2.5.1'), section('2.5.2')])).toEqual({
      codes: ['2.5.1', '2.5.2'], warnings: [],
    });
    expect(allocateImportedSectionCodes([section(null)], '3.2.S.4')).toEqual({ codes: ['3.2.S.4'], warnings: [] });
    expect(allocateImportedSectionCodes([section(null), section(null)], '3.2.S.4')).toEqual({
      codes: ['import.1', 'import.2'], warnings: [],
    });
  });
});
