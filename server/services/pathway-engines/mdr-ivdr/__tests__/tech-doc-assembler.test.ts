import { describe, it, expect } from 'vitest';
import { assembleTechDoc, type TechDocInputLeaf } from '../tech-doc-assembler';

const leaf = (over: Partial<TechDocInputLeaf> & { sectionCode: string }): TechDocInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

const mdrComplete: TechDocInputLeaf[] = [
  leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
  leaf({ sectionCode: 'ifu', title: 'Instructions for use', documentType: 'ifu' }),
  leaf({ sectionCode: 'dm', title: 'Design and manufacturing', documentType: 'design_manufacturing' }),
  leaf({ sectionCode: 'gspr', title: 'GSPR checklist', documentType: 'gspr' }),
  leaf({ sectionCode: 'rm', title: 'Risk management file', documentType: 'risk_management' }),
  leaf({ sectionCode: 'vv', title: 'Verification and validation', documentType: 'verification_validation' }),
  leaf({ sectionCode: 'cer', title: 'Clinical Evaluation Report', documentType: 'cer' }),
  leaf({ sectionCode: 'pms', title: 'Post-market surveillance plan', documentType: 'pms_plan' }),
];

describe('assembleTechDoc — MDR', () => {
  it('marks every required MDR Annex II/III section present for a complete file', () => {
    const r = assembleTechDoc({ leaves: mdrComplete, regulation: 'mdr' });
    expect(r.regulation).toBe('mdr');
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.ready).toBe(true);
    expect(r.sections.find((s) => s.id === 'clinical-evaluation')!.annex).toBe('Annex XIV');
  });

  it('reports missing GSPR and CER as gaps, never invents them', () => {
    const partial = mdrComplete.filter((l) => l.documentType !== 'gspr' && l.documentType !== 'cer');
    const r = assembleTechDoc({ leaves: partial, regulation: 'mdr' });
    expect(r.summary.missingRequired).toContain('gspr');
    expect(r.summary.missingRequired).toContain('clinical-evaluation');
    expect(r.summary.ready).toBe(false);
  });
});

describe('assembleTechDoc — IVDR', () => {
  it('requires analytical + clinical performance and the PER (not a CER)', () => {
    const r = assembleTechDoc({ leaves: mdrComplete, regulation: 'ivdr' });
    // IVDR registry has no 'clinical-evaluation'; it needs performance evidence instead.
    expect(r.sections.some((s) => s.id === 'clinical-evaluation')).toBe(false);
    expect(r.summary.missingRequired).toContain('analytical-performance');
    expect(r.summary.missingRequired).toContain('performance-evaluation');
  });

  it('is ready when IVDR performance evidence is supplied', () => {
    const ivdr: TechDocInputLeaf[] = [
      leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
      leaf({ sectionCode: 'ifu', title: 'IFU', documentType: 'ifu' }),
      leaf({ sectionCode: 'dm', title: 'Design & manufacturing', documentType: 'design_manufacturing' }),
      leaf({ sectionCode: 'gspr', title: 'GSPR', documentType: 'gspr' }),
      leaf({ sectionCode: 'rm', title: 'Risk management', documentType: 'risk_management' }),
      leaf({ sectionCode: 'ap', title: 'Analytical performance', documentType: 'analytical_performance' }),
      leaf({ sectionCode: 'cp', title: 'Clinical performance', documentType: 'clinical_performance' }),
      leaf({ sectionCode: 'per', title: 'Performance Evaluation Report', documentType: 'per' }),
      // 2026-09-23 (W5/D7, residual repair): the eu-ivdr outline marks II.6.3
      // stability mandatory and IVDR_SECTIONS now has the slot, so a complete
      // IVDR file includes it. This fixture gained the stability leaf.
      leaf({ sectionCode: 'stab', title: 'Stability', documentType: 'stability' }),
      leaf({ sectionCode: 'pms', title: 'PMS plan', documentType: 'pms_plan' }),
    ];
    const r = assembleTechDoc({ leaves: ivdr, regulation: 'ivdr' });
    expect(r.summary.ready).toBe(true);
  });
});

/*
 * 2026-09-23 (W5/D7, residual repair). Two changes to the slot projection:
 *   1. A slot reports WHICH leaves it matched (`leafIndices`, parallel to
 *      `sources`), not only their section-code strings. Two leaves can share a
 *      code and belong to different slots (a bench report and the CER both at
 *      II.6.1.b); the packager re-found each leaf from the string and filled the
 *      CER slot with whichever same-code leaf came first.
 *   2. IVDR_SECTIONS gains the eu-ivdr outline's II.6.3 (stability, mandatory),
 *      II.6.4 (software and cybersecurity, optional) and II.6.5 (usability,
 *      optional) — migrations/20260810b_eu_mdr_ivdr_outlines.sql.
 */
describe('assembleTechDoc — each slot names the leaves it matched', () => {
  it('two leaves with one section code: the CER slot holds the CER, not the first leaf with that code', () => {
    const bench = leaf({ sectionCode: 'II.6.1.b', title: 'Physical and chemical characterisation bench report' });
    const cer = leaf({ sectionCode: 'II.6.1.b', title: 'CER', documentType: 'cer' });
    for (const leaves of [[bench, cer], [cer, bench]]) {
      const r = assembleTechDoc({ leaves, regulation: 'mdr' });
      const cerSlot = r.sections.find((s) => s.id === 'clinical-evaluation')!;
      expect(cerSlot.leafIndices).toEqual([leaves.indexOf(cer)]);
      expect(cerSlot.sources).toEqual(['II.6.1.b']);
      const vv = r.sections.find((s) => s.id === 'preclinical-clinical')!;
      expect(vv.leafIndices).toEqual([0, 1]);
      expect(vv.sources).toEqual(['II.6.1.b', 'II.6.1.b']);
    }
  });

  it('an unmatched slot names no leaf', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.1.a', title: 'Device' })], regulation: 'mdr' });
    expect(r.sections.find((s) => s.id === 'gspr')!.leafIndices).toEqual([]);
    expect(r.sections.find((s) => s.id === 'device-description')!.leafIndices).toEqual([0]);
  });
});

describe('assembleTechDoc — IVDR slots for the outline\'s II.6.3 / II.6.4 / II.6.5', () => {
  const ivdrKeys = (extra: string[]) =>
    ['II.1.a', 'II.2.b', 'II.3.b', 'II.4.a', 'II.5.a', 'II.6.1.a', 'II.6.2.b', 'II.6.2.c', 'III.1', ...extra].map((k) =>
      leaf({ sectionCode: k, title: `Section ${k}` }),
    );

  it('stability is a required slot after the PER; software/cybersecurity and usability are optional', () => {
    const r = assembleTechDoc({ leaves: [], regulation: 'ivdr' });
    const ids = r.sections.map((s) => s.id);
    expect(ids.slice(ids.indexOf('performance-evaluation'))).toEqual([
      'performance-evaluation',
      'stability',
      'software-cybersecurity',
      'usability',
      'pms-plan',
    ]);
    const byId = (id: string) => r.sections.find((s) => s.id === id)!;
    expect(byId('stability')).toMatchObject({ annex: 'Annex II 6.3', required: true });
    expect(byId('software-cybersecurity')).toMatchObject({ annex: 'Annex II 6.4', required: false });
    expect(byId('usability')).toMatchObject({ annex: 'Annex II 6.5', required: false });
  });

  it('an IVDR file without II.6.3 stability is not ready; with it, it is', () => {
    const without = assembleTechDoc({ leaves: ivdrKeys([]), regulation: 'ivdr' });
    expect(without.summary.missingRequired).toEqual(['stability']);
    expect(without.summary.ready).toBe(false);
    const withStability = assembleTechDoc({ leaves: ivdrKeys(['II.6.3.a', 'II.6.3.b', 'II.6.3.c']), regulation: 'ivdr' });
    expect(withStability.summary.ready).toBe(true);
    expect(withStability.sections.find((s) => s.id === 'stability')!.sources).toEqual(['II.6.3.a', 'II.6.3.b', 'II.6.3.c']);
  });

  it('claims II.6.3 / II.6.4 / II.6.5 keys (and the stability document type) and nothing next to them', () => {
    const r = assembleTechDoc({
      leaves: ivdrKeys(['II.6.3', 'II.6.4.a', 'II.6.4.b', 'II.6.5', 'II.6.1.f', 'II.6.30']).concat(
        leaf({ sectionCode: '3.2.P.8', title: 'Shelf-life data', documentType: 'stability' }),
      ),
      regulation: 'ivdr',
    });
    const src = (id: string) => r.sections.find((s) => s.id === id)!.sources;
    expect(src('stability')).toEqual(['II.6.3', '3.2.P.8']);
    expect(src('software-cybersecurity')).toEqual(['II.6.4.a', 'II.6.4.b']);
    expect(src('usability')).toEqual(['II.6.5']);
    // II.6.1.f is specimen stability — analytical performance, not the II.6.3 group.
    expect(src('analytical-performance')).toContain('II.6.1.f');
    expect(src('stability')).not.toContain('II.6.1.f');
    // 'II.6.30' is not under 'II.6.3'.
    expect(r.sections.some((s) => s.sources.includes('II.6.30'))).toBe(false);
  });

  it('the MDR registry is unchanged: stability evidence stays under Annex II 6 verification and validation', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.6.1.e', title: 'Stability, shelf life and transport validation' })], regulation: 'mdr' });
    expect(r.sections.some((s) => s.id === 'stability')).toBe(false);
    expect(r.sections.find((s) => s.id === 'preclinical-clinical')!.sources).toEqual(['II.6.1.e']);
  });
});

/*
 * 2026-09-23 (W5/D7, residual repair — round 3). A slot's title matcher is a
 * fallback for a leaf the governed EU outline does not key. The MDR CER slot
 * matched titleHas('clinical evaluation') as a substring, so a bench report at
 * II.6.1.a titled "Preclinical evaluation - biocompatibility" filled the
 * required Annex XIV slot and the file reported ready with no CER. The IVDR PER
 * slot did the same with "Analytical performance evaluation report".
 */
describe('assembleTechDoc — an outline-keyed leaf is placed by its key, not its title', () => {
  const byId = (r: ReturnType<typeof assembleTechDoc>, id: string) => r.sections.find((s) => s.id === id)!;

  it('MDR: a II.6.1.a report titled "Preclinical evaluation ..." is verification and validation, not the CER', () => {
    for (const title of ['Preclinical evaluation - biocompatibility (ISO 10993)', 'Pre-clinical evaluation of bench performance']) {
      const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.6.1.a', title })], regulation: 'mdr' });
      expect(byId(r, 'clinical-evaluation').leafIndices).toEqual([]);
      expect(r.summary.missingRequired).toContain('clinical-evaluation');
      expect(byId(r, 'preclinical-clinical').leafIndices).toEqual([0]);
    }
  });

  it('IVDR: a II.6.1.a "Analytical performance evaluation report" is analytical performance, not the PER', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.6.1.a', title: 'Analytical performance evaluation report' })], regulation: 'ivdr' });
    expect(byId(r, 'performance-evaluation').leafIndices).toEqual([]);
    expect(r.summary.missingRequired).toContain('performance-evaluation');
    expect(byId(r, 'analytical-performance').leafIndices).toEqual([0]);
  });

  it('IVDR: the II.6.2.a scientific-validity section does not stand in for the II.6.2.c PER', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.6.2.a', title: 'Scientific validity of the analyte-condition association' })], regulation: 'ivdr' });
    expect(byId(r, 'performance-evaluation').leafIndices).toEqual([]);
    expect(byId(r, 'clinical-performance').leafIndices).toEqual([0]);
  });

  it('a group IV leaf is claimed by no slot through its title (IVDR IV.4 SSP names "clinical performance")', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'IV.4', title: 'Summary of safety and clinical performance' })], regulation: 'ivdr' });
    expect(r.sections.every((s) => s.leafIndices.length === 0)).toBe(true);
  });

  it('a document type still places a keyed leaf (the CER at II.6.1.b), and the key still places it too', () => {
    const r = assembleTechDoc({ leaves: [leaf({ sectionCode: 'II.6.1.b', title: 'Preclinical evaluation', documentType: 'cer' })], regulation: 'mdr' });
    expect(byId(r, 'clinical-evaluation').leafIndices).toEqual([0]);
    expect(byId(r, 'preclinical-clinical').leafIndices).toEqual([0]);
  });
});

describe('assembleTechDoc — a title matcher matches the phrase as words, not inside another word', () => {
  const cerOf = (title: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode: 'x', title })], regulation: 'mdr' }).sections.find((s) => s.id === 'clinical-evaluation')!.leafIndices;
  const perOf = (title: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode: 'x', title })], regulation: 'ivdr' }).sections.find((s) => s.id === 'performance-evaluation')!.leafIndices;

  it('"preclinical", "pre-clinical" and "non-clinical" evaluation are not a clinical evaluation', () => {
    expect(cerOf('Preclinical evaluation summary')).toEqual([]);
    expect(cerOf('Pre-clinical evaluation summary')).toEqual([]);
    expect(cerOf('Non-clinical evaluation summary')).toEqual([]);
    // Control: the phrase itself still matches an unkeyed leaf.
    expect(cerOf('Clinical Evaluation Report')).toEqual([0]);
    expect(cerOf('CER - clinical evaluation (Annex XIV)')).toEqual([0]);
  });

  it('an analytical or clinical performance evaluation is not the performance evaluation report', () => {
    expect(perOf('Analytical performance evaluation report')).toEqual([]);
    expect(perOf('Clinical performance evaluation')).toEqual([]);
    // Controls: the PER, including one that mentions its analytical part.
    expect(perOf('Performance Evaluation Report')).toEqual([0]);
    expect(perOf('Performance evaluation report: analytical performance evaluation and clinical evidence')).toEqual([0]);
  });
});

/*
 * 2026-09-23 (W5/D7, final pass). The round-3 word-boundary rule treated '_'
 * and '-' as word characters, so the single-token matchers stopped matching
 * the titles the Vault upload flow produces: a Vault document is titled with
 * its file name minus the extension (client/src/concept2cure/v2/useVaultUpload.ts)
 * and is placed at a CTD code, so its title is the only signal. 'IFU_EN_rev3'
 * and 'GSPR_Checklist_v2' left their required slots empty. A title is now
 * matched as a sequence of tokens: it is split on every non-letter ('_', '-',
 * digits, spaces, punctuation) and at lower-to-upper case transitions, and
 * lowercased.
 */
describe('assembleTechDoc — titles are matched as tokens, so file-name titles match', () => {
  const slotsOf = (regulation: 'mdr' | 'ivdr', sectionCode: string, title: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode, title })], regulation }).sections.filter((s) => s.leafIndices.length > 0).map((s) => s.id);

  it('underscore- and hyphen-joined file-name titles fill the IFU, GSPR and risk slots (the HEAD result)', () => {
    for (const t of ['IFU_EN_rev3', 'IFU-EN', 'IFU_v3', 'Labelling-and-packaging']) expect(slotsOf('mdr', '1.14', t)).toEqual(['manufacturer-information']);
    for (const t of ['GSPR_Checklist_v2', 'GSPR-Checklist', 'GSPR_checklist']) expect(slotsOf('mdr', '3.2', t)).toEqual(['gspr']);
    expect(slotsOf('mdr', '3.3', 'Risk_management_file')).toEqual(['risk-management']);
    expect(slotsOf('mdr', '3.3', 'Risk management-file')).toEqual(['risk-management']);
  });

  it('the electronic IFU: "eIFU" (case transition) and "eifu" / "EIFU" / "e-IFU" (the eIFU token) fill the IFU slot', () => {
    for (const t of ['eIFU', 'eifu_de', 'EIFU', 'e-IFU', 'eIFU_EN_v2']) expect(slotsOf('mdr', '1.14', t)).toEqual(['manufacturer-information']);
  });

  it('a phrase starts a token: "ifu" / "gspr" at the end of a longer word does not match', () => {
    expect(slotsOf('mdr', '1.14', 'Gifu_site_audit')).toEqual([]);
    expect(slotsOf('mdr', '1.14', 'GIFU_SITE_AUDIT')).toEqual([]);
    expect(slotsOf('mdr', '3.2', 'mdrgspr')).toEqual([]);
  });

  it('file-name titles of the CER and the PER fill their slots', () => {
    expect(slotsOf('mdr', 'x', 'Clinical_Evaluation_Report_v2')).toEqual(['clinical-evaluation']);
    expect(slotsOf('mdr', 'x', 'Clinical-evaluation report')).toEqual(['clinical-evaluation']);
    expect(slotsOf('ivdr', 'x', 'PerformanceEvaluationReport')).toEqual(['performance-evaluation']);
    expect(slotsOf('ivdr', 'x', 'IVD-performance evaluation report')).toEqual(['performance-evaluation']);
  });

  it('pre-/non-clinical evaluation, in any spelling, is not the CER', () => {
    for (const t of ['Preclinical_evaluation_v2', 'Pre_clinical_evaluation', 'Pre clinical evaluation', 'Non clinical evaluation report', 'nonClinicalEvaluation', 'Non-clinical evaluation summary']) {
      expect(slotsOf('mdr', 'x', t)).not.toContain('clinical-evaluation');
    }
  });

  it('a plan is not the report: the CEP is not the CER and a performance evaluation plan is not the PER', () => {
    expect(slotsOf('mdr', 'x', 'Clinical evaluation plan (CEP)')).not.toContain('clinical-evaluation');
    expect(slotsOf('mdr', 'x', 'Clinical_Evaluation_Plan_v1')).not.toContain('clinical-evaluation');
    expect(slotsOf('ivdr', 'x', 'Performance evaluation plan')).not.toContain('performance-evaluation');
  });
});

/*
 * 2026-09-23 (W5/D7, final pass — repair). The first token rewrite closed a
 * phrase on both sides, so it dropped titles HEAD's substring match filed:
 * plural acronyms ('IFUs', 'GSPRs', 'eIFUs' — 'IFUs' was also split 'if' +
 * 'us' at the end of the capital run), an acronym glued to a lower-case word
 * ('GSPRchecklist', 'IFUen') and plural or glued nouns ('Device descriptions',
 * 'Risk managementfile'). A phrase now starts at a token (so 'Gifu' and
 * 'preclinical' stay out) and its last token may continue into the title token
 * (as HEAD's substring did on that side); a capital run that is one of the
 * registry's acronyms is that acronym before the lower-case letters after it.
 * Every expectation below is the HEAD result.
 */
describe('assembleTechDoc — the end of a phrase is open: plurals and glued suffixes match, as at HEAD', () => {
  const slotsOf = (regulation: 'mdr' | 'ivdr', title: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode: '1.11', title })], regulation }).sections.filter((s) => s.leafIndices.length > 0).map((s) => s.id);

  it('plural acronyms fill the IFU and GSPR slots', () => {
    for (const t of ['IFUs', 'IFUs_EN', 'IFUs_all_languages', 'eIFUs', 'EIFUs', 'eifus_de']) expect(slotsOf('mdr', t)).toEqual(['manufacturer-information']);
    for (const t of ['GSPRs', 'GSPRs_checklist', 'GSPRs_overview_notes']) expect(slotsOf('mdr', t)).toEqual(['gspr']);
    expect(slotsOf('ivdr', 'IFUs')).toEqual(['manufacturer-information']);
    expect(slotsOf('ivdr', 'GSPRs')).toEqual(['gspr']);
  });

  it('an acronym glued to a lower-case word is still the acronym; a capital run before a capitalised word still splits', () => {
    for (const t of ['IFUen', 'IFUmanual', 'eIFUen', 'IFUManual']) expect(slotsOf('mdr', t)).toEqual(['manufacturer-information']);
    for (const t of ['GSPRchecklist', 'GSPRChecklist']) expect(slotsOf('mdr', t)).toEqual(['gspr']);
    for (const t of ['PMSplan', 'PMSPlan', 'PMS plans']) expect(slotsOf('mdr', t)).toEqual(['pms-plan']);
  });

  it('plural and glued nouns at the end of a phrase fill their slots', () => {
    expect(slotsOf('mdr', 'Device descriptions')).toEqual(['device-description']);
    expect(slotsOf('mdr', 'Risk managementfile')).toEqual(['risk-management']);
    expect(slotsOf('mdr', 'Clinical evaluations report')).toEqual(['clinical-evaluation']);
    expect(slotsOf('ivdr', 'Performance evaluations')).toEqual(['performance-evaluation']);
  });

  it('the qualifiers still apply: a glued or plural plan is not the report, and a preclinical evaluation is not the CER', () => {
    for (const t of ['Clinical evaluationplan', 'Clinical evaluation plans', 'Clinical_evaluation_planning']) expect(slotsOf('mdr', t)).not.toContain('clinical-evaluation');
    expect(slotsOf('ivdr', 'Performance evaluationplan')).not.toContain('performance-evaluation');
    expect(slotsOf('mdr', 'Preclinical evaluations')).not.toContain('clinical-evaluation');
    expect(slotsOf('mdr', 'Clinical evaluationplan and report')).toContain('clinical-evaluation');
  });
});

describe('assembleTechDoc — the outline key is read trimmed and case-insensitively', () => {
  const slotsOf = (sectionCode: string, title: string, documentType?: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode, title, documentType })], regulation: 'mdr' }).sections.filter((s) => s.leafIndices.length > 0).map((s) => s.id);

  it('" II.6.1.a" and "ii.6.1.a" are the outline key: placed by key, never by title', () => {
    expect(slotsOf(' II.6.1.a', 'Pre clinical evaluation')).toEqual(['preclinical-clinical']);
    expect(slotsOf('ii.6.1.a ', 'Clinical evaluation report')).toEqual(['preclinical-clinical']);
    expect(slotsOf('ii.6.1.g', 'x')).toEqual(['clinical-evaluation']);
    expect(slotsOf(' iii.1', 'x')).toEqual(['pms-plan']);
  });

  it('a group IV leaf is claimed by no slot, by title or by document type (IV.4 SSCP with documentType "cer")', () => {
    expect(slotsOf('IV.4', 'Summary of safety and clinical performance', 'cer')).toEqual([]);
    expect(slotsOf(' iv.1', 'EU declaration of conformity', 'ifu')).toEqual([]);
  });
});

/*
 * 2026-09-23 (W5/D7, final pass). A leaf with no outline key and no document
 * type is placed by its title alone — for a Vault-built sequence (CTD codes,
 * no document type) that is the only signal, so it cannot be refused without
 * refusing the Vault flow. It is not hidden either: each slot names the leaves
 * it matched by title only (`titleOnlyLeafIndices`, a subset of leafIndices),
 * i.e. leaves the slot would not match with the title blanked.
 */
describe('assembleTechDoc — a slot names the leaves it matched by title only', () => {
  const titleOnly = (leaves: TechDocInputLeaf[], id: string) =>
    assembleTechDoc({ leaves, regulation: 'mdr' }).sections.find((s) => s.id === id)!.titleOnlyLeafIndices;

  it('a CTD-coded "Clinical_Evaluation_Report_v2" with no document type is a title-only CER', () => {
    expect(titleOnly([leaf({ sectionCode: '5.3.5.4', title: 'Clinical_Evaluation_Report_v2' })], 'clinical-evaluation')).toEqual([0]);
  });

  it('a leaf matched by its outline key, its document type or its code prefix is not title-only', () => {
    expect(titleOnly([leaf({ sectionCode: 'II.6.1.g', title: 'Clinical evaluation report' })], 'clinical-evaluation')).toEqual([]);
    expect(titleOnly([leaf({ sectionCode: '5.3.5.4', title: 'Clinical evaluation report', documentType: 'cer' })], 'clinical-evaluation')).toEqual([]);
    // 'Preclinical bench testing' at 4.2.1 is matched by the '4' code prefix as well as its title.
    expect(titleOnly([leaf({ sectionCode: '4.2.1', title: 'Preclinical bench testing' })], 'preclinical-clinical')).toEqual([]);
  });

  it('a slot with a keyed and a title-only leaf names only the title-only one', () => {
    const leaves = [
      leaf({ sectionCode: 'II.6.1.g', title: 'CER' }),
      leaf({ sectionCode: '1.11', title: 'Clinical evaluation report addendum' }),
    ];
    const s = assembleTechDoc({ leaves, regulation: 'mdr' }).sections.find((x) => x.id === 'clinical-evaluation')!;
    expect(s.leafIndices).toEqual([0, 1]);
    expect(s.titleOnlyLeafIndices).toEqual([1]);
  });
});

/*
 * 2026-09-23 (W5/D7, final pass, lead's repair): the IVDR stability slot was
 * made required (the eu-ivdr outline's II.6.3 is mandatory) but matched only
 * the 'stability' document type or an II.6.3 outline key. A Vault-built
 * sequence carries CTD section codes and no document type, so nothing in it
 * could fill the slot: a complete IVDR technical file built through the Vault
 * flow could never be ready, and its manifest said stability was missing while
 * the sequence held the stability report. Every other slot has a title
 * fallback; stability, software/cybersecurity and usability now have one too.
 * Specimen (sample) stability is analytical performance (IVDR Annex II
 * 6.1(f)), not the device stability of 6.3, and is not claimed here.
 */
describe('assembleTechDoc — a Vault-built IVDR file: stability, software and usability match by title', () => {
  const slotsOf = (sectionCode: string, title: string) =>
    assembleTechDoc({ leaves: [leaf({ sectionCode, title })], regulation: 'ivdr' }).sections.filter((s) => s.leafIndices.length > 0).map((s) => s.id);

  it('file-name stability and shelf-life titles fill the stability slot', () => {
    for (const t of ['Stability_study_report_v2', 'Shelf-life_data', 'In-use stability', 'Transport stability study', 'STABILITY_REPORT'])
      expect(slotsOf('3.2.P.8', t), t).toEqual(['stability']);
  });

  it('specimen or sample stability is not the device stability of Annex II 6.3', () => {
    for (const t of ['Specimen_stability_study', 'Sample stability (pre-analytical)']) expect(slotsOf('3.2.R', t), t).not.toContain('stability');
  });

  it('software verification, cybersecurity and usability titles fill their optional slots', () => {
    for (const t of ['Cybersecurity_assessment', 'Software_verification_report', 'Software validation summary'])
      expect(slotsOf('3.2.R', t), t).toEqual(['software-cybersecurity']);
    for (const t of ['Usability_engineering_file', 'Human-factors report']) expect(slotsOf('3.2.R', t), t).toEqual(['usability']);
  });

  it('a complete Vault-built IVDR set (CTD codes, no document type) is ready, and without its stability report it is not', () => {
    const titles = [
      'Device_description', 'IFU_EN', 'Design_and_manufacturing', 'GSPR_Checklist', 'Risk_management_file',
      'Analytical_performance_report', 'Clinical_performance_study', 'Performance_Evaluation_Report', 'Stability_report', 'PMS_plan',
    ];
    const leaves = titles.map((title, i) => leaf({ sectionCode: `1.${i + 1}`, title }));
    const complete = assembleTechDoc({ leaves, regulation: 'ivdr' });
    expect(complete.summary.missingRequired).toEqual([]);
    expect(complete.summary.ready).toBe(true);
    const without = assembleTechDoc({ leaves: leaves.filter((l) => l.title !== 'Stability_report'), regulation: 'ivdr' });
    expect(without.summary.missingRequired).toEqual(['stability']);
    expect(without.summary.ready).toBe(false);
  });
});
