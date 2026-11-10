/**
 * The Lumen showcase's study data (2026-11-10). The 23-subject synthetic source (v1) carries disposition,
 * demographics, efficacy and adverse events only. Walked in the Lumen account: the CSR build drafted 68 of its 69
 * headings and ended "failed · 98% … §12.5 has no saved text … its study tables hold no results", because §12.5 reads
 * the vital-signs table and the source has none. v1 is pinned by other suites and stays as it is. v2 is the same
 * invented study with the four safety domains the format already takes (exposure, laboratory shifts, vital signs,
 * concomitant medications), so every results heading has a table to be written over.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsrSourceEnvelopeSchema } from '../../../../shared/csr-source-input';
import { buildCSRTables } from '../../csr-tabulation-builders';
import { csrSectionTableKeys } from '../cortex-authoring-context';

const read = (name: string) => JSON.parse(readFileSync(path.resolve('data/seeds/lumen-demo/seed-data', name), 'utf8'));
const v1 = read('lmn201_synthetic_csr_source_v1.json');
const v2 = read('lmn201_synthetic_csr_source_v2.json');
const hasRows = (table: unknown) => Array.isArray((table as { rows?: unknown[] } | undefined)?.rows) && (table as { rows: unknown[] }).rows.length > 0;

describe('the Lumen showcase study data (v2)', () => {
  it('conforms to the governed CSR source contract', () => {
    const result = CsrSourceEnvelopeSchema.safeParse(v2);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('is the same invented study as v1: nothing v1 records is changed', () => {
    const { exposure, labShifts, vitalSigns, concomitantMedications, ...rest } = v2.studyData;
    expect({ ...v2, studyData: rest }).toEqual(v1);
    for (const domain of [exposure, labShifts, vitalSigns, concomitantMedications]) expect(Array.isArray(domain) && domain.length > 0).toBe(true);
  });

  it('gives every results heading a table: §12.5 has vital signs to be written over, where v1 has none', () => {
    const before = buildCSRTables(v1.studyData) as unknown as Record<string, unknown>;
    const after = buildCSRTables(v2.studyData) as unknown as Record<string, unknown>;
    expect(hasRows(before.vitalSigns)).toBe(false);
    for (const key of ['exposure', 'labShifts', 'vitalSigns', 'concomitantMedications']) expect(hasRows(after[key]), key).toBe(true);
    for (const heading of ['10.1', '11.1', '11.2', '11.4', '12.1', '12.2', '12.3', '12.4', '12.5']) {
      const keys = csrSectionTableKeys(heading);
      expect(keys.length, heading).toBeGreaterThan(0);
      expect(keys.some(key => hasRows(after[key])), `§${heading} has no table with rows`).toBe(true);
    }
  });

  it('records one baseline and last value per safety subject and vital sign, and stays unmistakably synthetic', () => {
    const subjects = v2.participants.filter((p: { safety: boolean }) => p.safety).map((p: { subjectId: string }) => p.subjectId);
    const parameters = [...new Set(v2.studyData.vitalSigns.map((r: { parameter: string }) => r.parameter))];
    expect(parameters.length).toBeGreaterThanOrEqual(3);
    expect(v2.studyData.vitalSigns).toHaveLength(subjects.length * parameters.length);
    expect(v2.studyInfo.title).toMatch(/SYNTHETIC|NOT ACTUAL/i);
    expect(v2.participants.every((p: { subjectId: string }) => p.subjectId.startsWith('DEMO-'))).toBe(true);
  });
});
