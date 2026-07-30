import { describe, it, expect } from 'vitest';
import {
  ESTAR_CATALOG,
  getCatalogEntry,
  catalogEntriesForProgramType,
  pmaCatalogEntries,
  qSubCatalogEntries,
  templateFamilyForEntry,
  resolveCatalogTemplate,
  listCatalogKeys,
} from '../estar-catalog';

describe('eSTAR submission catalog', () => {
  it('covers every eSTAR need: marketing, PMA family, Q-Sub sub-types, IDE, 513(g)', () => {
    const keys = listCatalogKeys();
    // Marketing
    expect(keys).toContain('510k');
    expect(keys).toContain('de_novo');
    // PMA family — all six application/supplement types
    expect(keys).toEqual(
      expect.arrayContaining([
        'pma_original',
        'pma_panel_track_supplement',
        'pma_180_day_supplement',
        'pma_real_time_supplement',
        'pma_30_day_notice',
        'pma_135_day_supplement',
      ]),
    );
    // Q-Sub sub-types — all six, incl. PMA Day 100 + Accessory Classification
    expect(keys).toEqual(
      expect.arrayContaining([
        'qsub_pre_submission',
        'qsub_submission_issue_request',
        'qsub_informational_meeting',
        'qsub_study_risk_determination',
        'qsub_pma_day_100_meeting',
        'qsub_accessory_classification_request',
      ]),
    );
    // Other early-submission requests
    expect(keys).toContain('ide');
    expect(keys).toContain('513g');
  });

  it('keys are unique', () => {
    const keys = listCatalogKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('groups the six PMA-family entries under the pma program type', () => {
    expect(pmaCatalogEntries()).toHaveLength(6);
    expect(pmaCatalogEntries().every((e) => e.programType === 'pma')).toBe(true);
  });

  it('groups the six Q-Sub entries under the q_sub program type', () => {
    expect(qSubCatalogEntries()).toHaveLength(6);
    expect(qSubCatalogEntries().every((e) => e.programType === 'q_sub')).toBe(true);
  });

  it('maps IDE and 513(g) to their own program types', () => {
    expect(catalogEntriesForProgramType('ide').map((e) => e.key)).toEqual(['ide']);
    expect(catalogEntriesForProgramType('513g').map((e) => e.key)).toEqual(['513g']);
  });

  it('resolves the template family by variant (nIVD vs IVD; PreSTAR is variant-agnostic)', () => {
    const pma = getCatalogEntry('pma_original')!;
    expect(templateFamilyForEntry(pma, 'device')).toBe('nivd');
    expect(templateFamilyForEntry(pma, 'ivd')).toBe('ivd');
    const qsub = getCatalogEntry('qsub_pre_submission')!;
    expect(templateFamilyForEntry(qsub, 'device')).toBe('prestar');
    expect(templateFamilyForEntry(qsub, 'ivd')).toBe('prestar');
  });

  it('resolves catalog template metadata (family, current version, OMB) from the version registry', () => {
    const resolved = resolveCatalogTemplate('pma_180_day_supplement', 'ivd');
    expect(resolved?.family).toBe('ivd');
    expect(resolved?.currentVersion).toBe('7.0');
    expect(resolved?.ombNumbers).toContain('0910-0231');

    const qsub = resolveCatalogTemplate('qsub_pma_day_100_meeting', 'device');
    expect(qsub?.family).toBe('prestar');
    expect(qsub?.currentVersion).toBe('3.0');
    expect(qsub?.ombNumbers).toContain('0910-0756');
  });

  it('every entry carries a regulatory reference and applies to at least one variant', () => {
    for (const e of ESTAR_CATALOG) {
      expect(e.regulatoryRef).toBeTruthy();
      expect(e.appliesToVariants.length).toBeGreaterThan(0);
    }
  });

  it('populates review clocks only where FDA publishes one', () => {
    expect(getCatalogEntry('510k')?.reviewGoalDays).toBe(90);
    expect(getCatalogEntry('de_novo')?.reviewGoalDays).toBe(150);
    expect(getCatalogEntry('pma_original')?.reviewGoalDays).toBe(180);
    expect(getCatalogEntry('pma_30_day_notice')?.reviewGoalDays).toBe(30);
    expect(getCatalogEntry('pma_135_day_supplement')?.reviewGoalDays).toBe(135);
    expect(getCatalogEntry('ide')?.reviewGoalDays).toBe(30);
    expect(getCatalogEntry('513g')?.reviewGoalDays).toBe(60);
    // Real-time supplement is meeting-based — no fixed clock, carries a note instead.
    expect(getCatalogEntry('pma_real_time_supplement')?.reviewGoalDays).toBeUndefined();
    expect(getCatalogEntry('pma_real_time_supplement')?.reviewNote).toBeTruthy();
  });
});
