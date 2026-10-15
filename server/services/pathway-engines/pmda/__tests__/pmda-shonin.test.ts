import { describe, it, expect } from 'vitest';
import { assessPmdaShonin, type PmdaInputLeaf } from '../pmda-shonin';
import { assessPathwayReadiness } from '../../index';

const leaf = (over: Partial<PmdaInputLeaf> & { sectionCode: string }): PmdaInputLeaf => ({
  title: over.title ?? over.sectionCode,
  ...over,
});

/* Every Shōnin slot that is required for every device, plus the clinical trial
   results. No STED leaf: the STED is the structure these slots sit in, not one
   of them. */
const complete: PmdaInputLeaf[] = [
  leaf({ sectionCode: 'dd', title: 'Device description', documentType: 'device_description' }),
  leaf({ sectionCode: 'ep', title: 'Essential Principles conformity checklist', documentType: 'essential_principles_checklist' }),
  leaf({ sectionCode: 'spec', title: 'Specifications', documentType: 'specification' }),
  leaf({ sectionCode: 'qms', title: 'QMS conformity', documentType: 'qms' }),
  leaf({ sectionCode: 'perf', title: 'Bench performance', documentType: 'performance' }),
  leaf({ sectionCode: 'clin', title: 'Clinical trial results', documentType: 'clinical_trial_results' }),
  leaf({ sectionCode: 'rm', title: 'Risk management', documentType: 'risk_management' }),
  leaf({ sectionCode: 'pi', title: 'Japanese package insert', documentType: 'japanese_labelling' }),
];
const withoutClinical = complete.filter((l) => l.sectionCode !== 'clin');

const slot = (r: ReturnType<typeof assessPmdaShonin>, id: string) => r.sections.find((s) => s.id === id);

describe('assessPmdaShonin', () => {
  it('is ready when every required Shōnin section is present', () => {
    const r = assessPmdaShonin({ leaves: complete, clinicalDataRequired: true });
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.undetermined).toEqual([]);
    expect(r.summary.ready).toBe(true);
  });

  it('flags missing Japanese labelling and required clinical trial results as gaps', () => {
    const partial = complete.filter((l) => l.documentType !== 'japanese_labelling' && l.sectionCode !== 'clin');
    const r = assessPmdaShonin({ leaves: partial, clinicalDataRequired: true });
    expect(r.summary.missingRequired).toContain('japanese-labelling');
    expect(r.summary.missingRequired).toContain('clinical-data');
    expect(r.summary.ready).toBe(false);
  });

  it('does not require optional sections (stability, foreign-approval status)', () => {
    const r = assessPmdaShonin({ leaves: complete, clinicalDataRequired: true });
    expect(r.summary.missingRequired).not.toContain('stability');
    expect(r.summary.missingRequired).not.toContain('foreign-approval-status');
  });

  it('matches Japanese-language titles (添付文書, 規格, 基本要件)', () => {
    const jp: PmdaInputLeaf[] = [
      leaf({ sectionCode: 'a', title: '添付文書' }),
      leaf({ sectionCode: 'b', title: '規格' }),
      leaf({ sectionCode: 'c', title: '基本要件適合性チェックリスト' }),
    ];
    const r = assessPmdaShonin({ leaves: jp });
    expect(slot(r, 'japanese-labelling')!.present).toBe(true);
    expect(slot(r, 'specifications')!.present).toBe(true);
    expect(slot(r, 'essential-principles-conformity')!.present).toBe(true);
  });
});

/*
 * 2026-10-05 (g-shonin-and-techdoc-fail-closed). The slot set was a drug
 * dossier's: CTD module prefixes filled device slots, every device had to show
 * ICH E5 bridging, the STED was a leaf, and the Essential Principles
 * conformity PMDA reviews had no slot.
 */
describe('assessPmdaShonin — a drug dossier is not a device file', () => {
  it('drug CTD leaves 4.2.3.2 and 5.3.5.1 fill no Shōnin slot', () => {
    const r = assessPmdaShonin({
      leaves: [
        leaf({ sectionCode: '4.2.3.2', title: 'Repeat-dose toxicity' }),
        leaf({ sectionCode: '5.3.5.1', title: 'CSR study 301' }),
      ],
      clinicalDataRequired: true,
    });
    expect(r.sections.filter((s) => s.present).map((s) => s.id)).toEqual([]);
  });

  it("a bench-test leaf numbered '5' (the Shōnin project template's Performance Testing) does not fill the clinical slot", () => {
    const r = assessPmdaShonin({ leaves: [leaf({ sectionCode: '5', title: 'Performance Testing' })], clinicalDataRequired: true });
    expect(slot(r, 'clinical-data')!.present).toBe(false);
    expect(slot(r, 'performance')!.present).toBe(true);
  });

  it("has an Essential Principles conformity slot, no 'sted' slot, and no ICH E5 label", () => {
    const r = assessPmdaShonin({ leaves: [] });
    const ids = r.sections.map((s) => s.id);
    expect(ids).toContain('essential-principles-conformity');
    expect(slot(r, 'essential-principles-conformity')!.required).toBe(true);
    expect(ids).not.toContain('sted');
    expect(ids).not.toContain('clinical-bridging');
    for (const s of r.sections) expect(s.label).not.toMatch(/ICH E5/i);
  });

  it('a STED or "ICH E5 bridging" leaf fills no slot', () => {
    const r = assessPmdaShonin({
      leaves: [
        leaf({ sectionCode: 'sted', title: 'Summary Technical Documentation', documentType: 'sted' }),
        leaf({ sectionCode: 'x', title: 'ICH E5 bridging report', documentType: 'bridging' }),
      ],
    });
    expect(r.sections.filter((s) => s.present).map((s) => s.id)).toEqual([]);
  });

  it('without the Essential Principles checklist the file is not ready', () => {
    const r = assessPmdaShonin({ leaves: complete.filter((l) => l.sectionCode !== 'ep'), clinicalDataRequired: true });
    expect(r.summary.missingRequired).toContain('essential-principles-conformity');
    expect(r.summary.ready).toBe(false);
  });
});

describe('assessPmdaShonin — clinical trial results are required only when the device needs them', () => {
  it('clinicalDataRequired false: ready without a clinical leaf; the slot is not applicable', () => {
    const r = assessPmdaShonin({ leaves: withoutClinical, clinicalDataRequired: false });
    expect(r.summary.ready).toBe(true);
    expect(slot(r, 'clinical-data')!.applicability).toBe('not-applicable');
    expect(slot(r, 'clinical-data')!.required).toBe(false);
  });

  it('clinicalDataRequired undefined: the absent clinical slot is undetermined and blocks ready', () => {
    const r = assessPmdaShonin({ leaves: withoutClinical });
    expect(r.summary.ready).toBe(false);
    expect(r.summary.undetermined).toEqual(['clinical-data']);
    expect(r.summary.missingRequired).toEqual([]);
    expect(slot(r, 'clinical-data')!.applicability).toBe('undetermined');
  });

  it('clinicalDataRequired undefined but clinical trial results present: ready', () => {
    const r = assessPmdaShonin({ leaves: complete });
    expect(r.summary.undetermined).toEqual([]);
    expect(r.summary.ready).toBe(true);
  });

  it('assessPathwayReadiness threads clinicalDataRequired and counts undetermined as a gap', () => {
    const undecided = assessPathwayReadiness({ pathway: 'pmda_shonin', leaves: withoutClinical });
    expect(undecided.ready).toBe(false);
    expect(undecided.missingRequired).toEqual(['clinical-data']);
    const decided = assessPathwayReadiness({ pathway: 'pmda_shonin', leaves: withoutClinical, clinicalDataRequired: false });
    expect(decided.ready).toBe(true);
    expect(decided.missingRequired).toEqual([]);
  });
});

/*
 * Fix round 1 (review of g-shonin-and-techdoc-fail-closed). The slot is
 * clinical TRIAL results. A Japanese nonclinical title contains 臨床試験 as a
 * substring (非臨床試験成績), and a clinical evaluation report (臨床評価) is the
 * literature route used when a trial is NOT needed — neither is trial results.
 */
describe('assessPmdaShonin — only clinical trial results fill the clinical-data slot', () => {
  const nonclinicalJp = leaf({ sectionCode: 'nc', title: '非臨床試験成績' });

  it("'非臨床試験成績' (nonclinical study results) does not fill clinical-data when trial results are required", () => {
    const r = assessPmdaShonin({ leaves: [...withoutClinical, nonclinicalJp], clinicalDataRequired: true });
    expect(slot(r, 'clinical-data')!.present).toBe(false);
    expect(r.summary.missingRequired).toContain('clinical-data');
    expect(r.summary.ready).toBe(false);
  });

  it("'非臨床試験成績' does not clear the undetermined clinical-data gap", () => {
    const r = assessPmdaShonin({ leaves: [...withoutClinical, nonclinicalJp] });
    expect(slot(r, 'clinical-data')!.present).toBe(false);
    expect(r.summary.undetermined).toContain('clinical-data');
    expect(r.summary.ready).toBe(false);
  });

  it('a clinical evaluation report (English or 臨床評価報告書, docType clinical_evaluation) is not clinical trial results', () => {
    const cers: PmdaInputLeaf[] = [
      leaf({ sectionCode: 'cer1', title: 'Clinical evaluation report', documentType: 'clinical_evaluation' }),
      leaf({ sectionCode: 'cer2', title: '臨床評価報告書' }),
      leaf({ sectionCode: 'cer3', title: 'Clinical evaluation report' }),
    ];
    for (const cer of cers) {
      const required = assessPmdaShonin({ leaves: [...withoutClinical, cer], clinicalDataRequired: true });
      expect(slot(required, 'clinical-data')!.present).toBe(false);
      expect(required.summary.missingRequired).toContain('clinical-data');
      expect(required.summary.ready).toBe(false);
      const undecided = assessPmdaShonin({ leaves: [...withoutClinical, cer] });
      expect(undecided.summary.undetermined).toContain('clinical-data');
      expect(undecided.summary.ready).toBe(false);
    }
  });

  it('Japanese and English clinical trial titles still fill the slot', () => {
    for (const title of ['臨床試験の試験成績', 'Clinical trial results', 'Clinical investigation report']) {
      const r = assessPmdaShonin({ leaves: [...withoutClinical, leaf({ sectionCode: 't', title })], clinicalDataRequired: true });
      expect(slot(r, 'clinical-data')!.present).toBe(true);
      expect(r.summary.ready).toBe(true);
    }
  });

  it('the clinical-data basis does not claim the 0804001 title was verified on a regulator site', () => {
    const b = slot(assessPmdaShonin({ leaves: [] }), 'clinical-data')!.basis;
    expect(b).toMatch(/0804001/);
    expect(b).not.toMatch(/search-verified/);
    expect(b).toMatch(/recall/);
  });
});

/*
 * Fix round 2 (review of g-shonin-and-techdoc-fail-closed). A clinical trial
 * plan or protocol is not the trial's results: 'Clinical investigation plan',
 * 'Clinical trial protocol' and 臨床試験計画書 each contain a trial phrase and
 * filled the results slot, so a file with only a CIP reported ready. The
 * docType 'clinical_investigation' is an evidence-type / section id elsewhere
 * in the repo (cerGenerationService.ts, ivdr-routes.ts), not a results type.
 */
describe('assessPmdaShonin — a trial plan or protocol is not clinical trial results', () => {
  const plans: PmdaInputLeaf[] = [
    leaf({ sectionCode: 'p1', title: 'Clinical investigation plan' }),
    leaf({ sectionCode: 'p2', title: 'Clinical trial protocol' }),
    leaf({ sectionCode: 'p3', title: '臨床試験計画書' }),
    leaf({ sectionCode: 'p4', title: 'CIP', documentType: 'clinical_investigation' }),
  ];

  it('does not fill clinical-data when trial results are required', () => {
    for (const p of plans) {
      const r = assessPmdaShonin({ leaves: [...withoutClinical, p], clinicalDataRequired: true });
      expect(slot(r, 'clinical-data')!.present, p.title).toBe(false);
      expect(r.summary.missingRequired).toContain('clinical-data');
      expect(r.summary.ready).toBe(false);
    }
  });

  it('does not clear the undetermined clinical-data gap', () => {
    for (const p of plans) {
      const r = assessPmdaShonin({ leaves: [...withoutClinical, p] });
      expect(slot(r, 'clinical-data')!.present, p.title).toBe(false);
      expect(r.summary.undetermined).toContain('clinical-data');
      expect(r.summary.ready).toBe(false);
    }
  });

  it('a results report still fills it, including one that names its plan or protocol', () => {
    const reports: PmdaInputLeaf[] = [
      leaf({ sectionCode: 'r1', title: 'Clinical investigation report' }),
      leaf({ sectionCode: 'r2', title: '臨床試験の試験成績' }),
      leaf({ sectionCode: 'r3', title: 'Clinical trial results per protocol CIP-01' }),
      leaf({ sectionCode: 'r4', title: 'Clinical investigation of the implant' }),
      leaf({ sectionCode: 'r5', title: 'CIR', documentType: 'clinical_investigation_report' }),
    ];
    for (const rep of reports) {
      const r = assessPmdaShonin({ leaves: [...withoutClinical, rep], clinicalDataRequired: true });
      expect(slot(r, 'clinical-data')!.present, rep.title).toBe(true);
      expect(r.summary.ready).toBe(true);
    }
  });
});
