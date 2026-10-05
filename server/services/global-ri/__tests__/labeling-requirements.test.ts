/**
 * Cross-market product-labeling requirements expert — per-market required
 * sections and the readiness assessment (missing/extra/obsolete sections,
 * unknown market).
 *
 * The Japanese package insert (2026-10-05, step g-jp-package-insert-format):
 * until this step the PMDA list was the pre-2019 layout (one 使用上の注意
 * umbrella, no 特定の背景を有する患者に関する注意) with all 12 entries required,
 * so a correct new-format insert with no 警告 or no 承認条件 was "not ready", and
 * a draft still carrying 慎重投与 got only an EXTRA_SECTION warning. The new
 * format (薬生発0608第1号, 2017; 薬生発0611第1号, 2021) numbers every item from
 * 警告 onward and leaves an item with nothing to state as a missing number.
 */

import { describe, it, expect } from 'vitest';
import {
  assessLabeling,
  flattenLabelingSections,
  getLabelingNotes,
  getLabelingRequirements,
  LABELING_REQUIREMENTS,
  OBSOLETE_LABELING_SECTIONS,
  type LabelMarket,
} from '../labeling-requirements';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

const ALL_MARKETS: LabelMarket[] = ['FDA', 'EMA', 'PMDA'];

/** Every modeled section code for a market, sub-items included. */
const allCodes = (m: LabelMarket) => flattenLabelingSections(LABELING_REQUIREMENTS[m]).map((s) => s.code);
/** Only the codes a draft must carry (requirement 'required', inherited from the parent). */
const requiredCodes = (m: LabelMarket) =>
  flattenLabelingSections(LABELING_REQUIREMENTS[m])
    .filter((s) => s.requirement === 'required')
    .map((s) => s.code);

const pmda = () => flattenLabelingSections(LABELING_REQUIREMENTS.PMDA);
const pmdaByNumber = (n: string) => pmda().find((s) => s.number === n);

describe('LABELING_REQUIREMENTS', () => {
  it('models every market with a non-empty, well-formed section set', () => {
    for (const m of ALL_MARKETS) {
      const reqs = getLabelingRequirements(m);
      expect(reqs.length).toBeGreaterThan(0);
      for (const s of flattenLabelingSections(reqs)) {
        expect(s.code).toBeTruthy();
        expect(s.title).toBeTruthy();
      }
    }
  });

  it('uses unique section codes within each market', () => {
    for (const m of ALL_MARKETS) {
      const codes = allCodes(m);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('models the expected core sections per market', () => {
    expect(allCodes('FDA')).toContain('us_indications_usage');
    expect(allCodes('FDA')).toContain('us_patient_counseling');
    expect(allCodes('EMA')).toContain('eu_4_1_indications');
    expect(allCodes('EMA')).toContain('eu_10_date_revision');
    expect(allCodes('PMDA')).toContain('jp_1_warnings');
    expect(allCodes('PMDA')).toContain('jp_21_approval_conditions');
  });

  it('keeps every FDA and EMA section required (their behaviour is unchanged)', () => {
    for (const m of ['FDA', 'EMA'] as LabelMarket[]) {
      expect(requiredCodes(m)).toEqual(allCodes(m));
    }
  });
});

describe('PMDA package insert — the numbered new format', () => {
  it('has item 9 特定の背景を有する患者に関する注意 with 9.1–9.8, citing the MHLW/PMDA notice', () => {
    const nine = getLabelingRequirements('PMDA').find((s) => s.number === '9');
    expect(nine?.title).toContain('特定の背景を有する患者に関する注意');
    const childNumbers = (nine?.children ?? []).map((c) => c.number);
    expect(childNumbers).toEqual(['9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8']);
    expect(nine?.children?.find((c) => c.number === '9.2')?.title).toContain('腎機能障害患者');
    expect((nine?.basis ?? []).some((b) => /000805981|000218446/.test(b.url ?? ''))).toBe(true);
  });

  it('numbers items 1–26 in order', () => {
    const top = getLabelingRequirements('PMDA').filter((s) => s.number !== undefined).map((s) => s.number);
    expect(top).toEqual(Array.from({ length: 26 }, (_, i) => String(i + 1)));
    expect(pmdaByNumber('1')?.title).toContain('警告');
    expect(pmdaByNumber('10')?.title).toContain('相互作用');
    expect(pmdaByNumber('11.1')?.title).toContain('重大な副作用');
    expect(pmdaByNumber('11.2')?.title).toContain('その他の副作用');
    expect(pmdaByNumber('13')?.title).toContain('過量投与');
    expect(pmdaByNumber('21')?.title).toContain('承認条件');
    expect(pmdaByNumber('22')?.title).toContain('包装');
  });

  it('deletes the 12 old-format codes with no alias', () => {
    const old = [
      'jp_warnings', 'jp_contraindications', 'jp_composition_description', 'jp_indications',
      'jp_dosage_administration', 'jp_precautions', 'jp_adverse_reactions', 'jp_pharmacokinetics',
      'jp_clinical_studies', 'jp_pharmacology', 'jp_handling_precautions', 'jp_approval_conditions',
    ];
    for (const code of old) expect(allCodes('PMDA')).not.toContain(code);
  });

  it('classes 警告, 承認条件 and every item that may be a missing number as conditional', () => {
    for (const n of ['1', '2', '5', '7', '8', '9', '9.2', '10', '10.1', '11', '12', '13', '14', '15', '21']) {
      expect(pmdaByNumber(n)?.requirement, `item ${n}`).toBe('conditional');
    }
    for (const n of ['3', '4', '6', '22', '26']) {
      expect(pmdaByNumber(n)?.requirement, `item ${n}`).toBe('required');
    }
  });

  it('gives every item a well-formed basis, and regulator-text only where the notice was seen', () => {
    const regulatorText = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '9.1', '9.2', '9.3', '9.4', '10', '11', '11.1', '11.2', '12', '13', '14']);
    for (const s of pmda()) {
      expect(s.basis?.length ?? 0, s.code).toBeGreaterThan(0);
      for (const b of s.basis ?? []) expect(basisProblems(b), s.code).toEqual([]);
      const confidences = new Set((s.basis ?? []).map((b) => b.confidence));
      if (s.number !== undefined && regulatorText.has(s.number)) {
        expect(confidences.has('regulator-text'), s.code).toBe(true);
      } else {
        expect(confidences.has('regulator-text'), s.code).toBe(false);
      }
    }
  });

  it('marks a correct insert with no 警告 and no 承認条件 as ready', () => {
    const provided = requiredCodes('PMDA');
    expect(provided).not.toContain('jp_1_warnings');
    expect(provided).not.toContain('jp_21_approval_conditions');
    const res = assessLabeling({ market: 'PMDA', providedSections: provided });
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.findings.filter((f) => f.code === 'MISSING_SECTION')).toEqual([]);
  });

  it('recognises a sub-item code as a modeled section, not an extra one', () => {
    const res = assessLabeling({ market: 'PMDA', providedSections: [...requiredCodes('PMDA'), 'jp_9_2_renal_impairment'] });
    expect(res.findings.some((f) => f.section === 'jp_9_2_renal_impairment')).toBe(false);
  });

  it('refuses 慎重投与 as obsolete and names the replacement item', () => {
    const res = assessLabeling({ market: 'PMDA', providedSections: [...requiredCodes('PMDA'), 'jp_careful_administration'] });
    expect(res.ready).toBe(false);
    const f = res.findings.find((x) => x.section === 'jp_careful_administration');
    expect(f?.code).toBe('FORMAT_OBSOLETE');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('9');
    expect(f?.message).toContain('特定の背景を有する患者に関する注意');
  });

  it('refuses 原則禁忌 and the old 使用上の注意 umbrella as obsolete', () => {
    for (const code of ['jp_principal_contraindications', 'jp_precautions']) {
      const res = assessLabeling({ market: 'PMDA', providedSections: [...requiredCodes('PMDA'), code] });
      expect(res.ready, code).toBe(false);
      expect(res.findings.find((x) => x.section === code)?.code, code).toBe('FORMAT_OBSOLETE');
    }
    const principal = OBSOLETE_LABELING_SECTIONS.PMDA?.find((o) => o.code === 'jp_principal_contraindications');
    expect(principal?.basis.some((b) => b.confidence === 'regulator-text')).toBe(true);
    const careful = OBSOLETE_LABELING_SECTIONS.PMDA?.find((o) => o.code === 'jp_careful_administration');
    expect(careful?.basis.every((b) => b.confidence === 'recall')).toBe(true);
    for (const o of OBSOLETE_LABELING_SECTIONS.PMDA ?? []) {
      expect(allCodes('PMDA'), o.code).not.toContain(o.code);
      for (const n of o.replacedBy) expect(pmdaByNumber(n), `${o.code} → ${n}`).toBeDefined();
    }
  });

  it('notes electronic publication, the unread 2026 amendment and the drugs-only scope', () => {
    const notes = getLabelingNotes('PMDA').join('\n');
    expect(notes).toMatch(/2021-08-01/);
    expect(notes).toMatch(/医薬安発0430第1号/);
    expect(notes).toMatch(/not (been )?read/i);
    expect(notes).toMatch(/devices?|IVD/i);
    const res = assessLabeling({ market: 'PMDA', providedSections: requiredCodes('PMDA') });
    expect(res.notes).toEqual(getLabelingNotes('PMDA'));
    expect(getLabelingNotes('FDA')).toEqual([]);
  });
});

describe('assessLabeling', () => {
  it('ready when all modeled sections are provided (every market)', () => {
    for (const m of ALL_MARKETS) {
      const res = assessLabeling({ market: m, providedSections: allCodes(m) });
      expect(res.ready).toBe(true);
      expect(res.missing).toEqual([]);
      expect(res.counts.errors).toBe(0);
    }
  });

  it('flags a missing required FDA section (Indications and Usage) as a blocking error', () => {
    const provided = allCodes('FDA').filter((c) => c !== 'us_indications_usage');
    const res = assessLabeling({ market: 'FDA', providedSections: provided });
    expect(res.ready).toBe(false);
    expect(res.missing).toContain('us_indications_usage');
    expect(res.findings.some((f) => f.code === 'MISSING_SECTION' && f.section === 'us_indications_usage')).toBe(true);
    expect(res.counts.errors).toBe(1);
  });

  it('warns (non-blocking) on an unrecognized provided section', () => {
    const res = assessLabeling({ market: 'EMA', providedSections: [...allCodes('EMA'), 'eu_made_up'] });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'EXTRA_SECTION' && f.section === 'eu_made_up')).toBe(true);
    expect(res.counts.errors).toBe(0);
  });

  it('errors on an unknown market', () => {
    const res = assessLabeling({ market: 'XYZ' as LabelMarket, providedSections: [] });
    expect(res.ready).toBe(false);
    expect(res.findings[0].code).toBe('UNKNOWN_MARKET');
    expect(res.required).toEqual([]);
  });

  it('sorts findings by section then severity (errors before warnings)', () => {
    const res = assessLabeling({ market: 'PMDA', providedSections: ['zzz_extra'] });
    const sections = res.findings.map((f) => f.section ?? '');
    const sorted = [...sections].sort((a, b) => a.localeCompare(b));
    expect(sections).toEqual(sorted);
    // every required (not conditional) section missing + one extra
    expect(res.counts.errors).toBe(requiredCodes('PMDA').length);
    expect(res.missing).toEqual(requiredCodes('PMDA'));
    expect(res.counts.warnings).toBe(1);
  });
});
