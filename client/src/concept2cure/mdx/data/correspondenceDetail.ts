/**
 * Correspondence detail — full letter bodies, deficiency decomposition, and the
 * AnA-drafted response. Ported from
 * `ui_kits/mdx/data-correspondence-detail.jsx`.
 *
 * Keyed by the correspondence id used in `data/pathwayTabs.ts`
 * (K510_CORRESP / PMA_CORRESP / CER_CORRESP), so the AnaDrafter has real
 * structured input. Consumed by `components/AnaDrafter.tsx`.
 */

import type { CorrespondenceRef } from '../types';

export interface LetterSignature {
  sign_off: string;
  name: string;
  title: string;
  cc?: string[];
}

export interface DrafterLetterDoc {
  from_name: string;
  from_title: string;
  from_office: string;
  ref: string;
  dated: string;
  received_at?: string;
  our_ref?: string;
  via?: string;
  body: string[];
  signature: LetterSignature;
}

export interface DeficiencyReg {
  ref: string;
  title: string;
}

export interface Deficiency {
  id: string;
  n: number;
  title: string;
  body: string;
  refs: CorrespondenceRef[];
  regs: DeficiencyReg[];
  severity: 'major' | 'minor';
  complete?: boolean;
}

export interface DraftTable {
  cols: string[];
  rows: Array<Array<string | number>>;
}

export interface DraftEvidence {
  name: string;
  kind: string;
  size: number;
  source: string;
  new?: boolean;
}

export interface DraftUpdate {
  section: string;
  diff: string;
  summary?: string;
}

export interface DraftDeficiency {
  id: string;
  response: string;
  table?: DraftTable;
  discussion?: string;
  evidence: DraftEvidence[];
  updates: DraftUpdate[];
}

export interface DraftReviewer {
  role: string;
  name: string;
  status: 'pending' | 'approved';
  signed_at?: string | null;
}

export interface ResponseDraft {
  status: 'unstarted' | 'drafted' | 'in_review' | 'approved' | 'sent';
  generated_at?: string;
  generated_by?: string;
  intro?: string;
  deficiencies?: DraftDeficiency[];
  closing?: string;
  reviewers?: DraftReviewer[];
  send_to?: string;
  due?: string;
  acknowledged_by?: string;
  sent_at?: string;
}

export interface CorrespondenceDetail {
  letter: DrafterLetterDoc;
  deficiencies: Deficiency[];
  draft: ResponseDraft;
}

export const CORRESP_DETAIL: Record<string, CorrespondenceDetail> = {
  /* ── 510(k) — AI-Hold (the showcase) ── */
  'rta-3': {
    letter: {
      from_name: 'Dr. Rosemary T. Tanaka, MD',
      from_title: 'Lead Reviewer · Division of Health Technology 2C',
      from_office: 'Center for Devices and Radiological Health · OHT2 · DHT2C',
      ref: 'K-251401 · AI Hold #1',
      our_ref: 'BX-204 / Concept2Cure Diagnostics, Inc.',
      dated: '2026-04-29',
      received_at: '2026-04-29T08:14:00Z',
      via: 'CDRH eSTAR portal',
      body: [
        'The Center for Devices and Radiological Health (CDRH) has completed an initial substantive review of your 510(k) submission for the BX-204 Continuous Glucose Monitor. Acceptance review was completed on April 21, 2026 and the submission was accepted for substantive review on the same date.',
        'During substantive review, we have identified one (1) Additional Information Hold item that must be addressed before review can continue. Pursuant to 21 CFR 807.87 and the FDA Refuse-to-Accept policy for 510(k)s, your response is due within 180 days of this letter; however, the user-fee clock is paused as of the date of this letter and will resume on receipt of a complete response.',
        'AI-Hold Item 1 — §11.4 Performance / Accuracy: Adjudicated Mean Absolute Relative Difference (MARD) is reported in aggregate (8.7%, 95% CI 8.2–9.3%) but is not stratified by clinically relevant age subgroup. For pediatric and geriatric subpopulations within the cleared indication (≥ 2 years of age), please provide stratified MARD by age decile (18–39, 40–64, 65+ years), including the sample size, point estimate, and two-sided 95% confidence interval for each band. Please also provide the underlying paired CGM-comparator dataset as a comma-separated raw export, including the adjudicated YSI 2300 STAT Plus values used as the reference comparator, the device timestamps, the elapsed-time-from-insertion bin, and the consensus error grid zone for each pair.',
        'In addition, please update §11.4 of the eSTAR submission narrative to include the stratified result, a brief discussion of any clinically meaningful differences between bands, and (if applicable) a labeling reconciliation if the stratified result narrows the indicated population.',
        'For your reference, FDA guidance "Self-Monitoring Blood Glucose Test Systems for Over-the-Counter Use" (October 2020) and the special controls under 21 CFR 862.1345 (NBW product code) describe the agency\'s expectations for stratified accuracy reporting.',
        'Please respond through the CDRH eSTAR portal. Submissions of raw data should be provided as a single CSV not exceeding 25 MB per file. If you have questions or wish to request an interactive review meeting, please contact the lead reviewer at the email above.',
      ],
      signature: {
        sign_off: 'Sincerely,',
        name: 'Rosemary T. Tanaka, MD',
        title: 'Lead Reviewer',
        cc: ['Branch Chief, DHT2C · J. Park', 'Concept2Cure Diagnostics, Inc. · Reg Lead of Record'],
      },
    },
    deficiencies: [
      {
        id: 'D1', n: 1, title: 'Stratified MARD by age decile',
        body: 'Provide stratified MARD by age decile (18–39, 40–64, 65+ years) with sample size, point estimate, and two-sided 95% CI for each band.',
        refs: [{ section: 11, label: '§11.4 Accuracy' }],
        regs: [{ ref: '21 CFR 862.1345', title: 'Glucose test system — NBW special controls' },
               { ref: 'FDA SMBG OTC Guidance (Oct 2020)', title: 'Stratified accuracy reporting expectations' }],
        severity: 'major',
      },
      {
        id: 'D2', n: 2, title: 'Raw paired CGM-YSI dataset (CSV)',
        body: 'Provide raw paired CGM-comparator dataset (≤ 25 MB CSV) including adjudicated YSI values, device timestamps, elapsed-time bins, and consensus error grid zones.',
        refs: [{ section: 11, label: '§11.3 Clinical performance' }],
        regs: [{ ref: '21 CFR 807.87(g)', title: 'Performance data — supporting raw data' }],
        severity: 'major',
      },
      {
        id: 'D3', n: 3, title: 'Discussion of stratified differences + labeling reconciliation',
        body: 'Update §11.4 narrative with stratified result and discussion. Reconcile labeling if stratified result narrows the cleared indication.',
        refs: [{ section: 11, label: '§11.4 Accuracy' }, { section: 7, label: '§07 Indications for Use' }],
        regs: [{ ref: '21 CFR 801.109', title: 'Prescription device labeling' }],
        severity: 'minor',
      },
    ],
    draft: {
      status: 'drafted',
      generated_at: '2026-04-29T09:42:00Z',
      generated_by: 'AnA',
      intro: 'Concept2Cure Diagnostics, Inc. acknowledges receipt of AI Hold #1 dated April 29, 2026 for K-251401 (BX-204 Continuous Glucose Monitor). We submit the following response within the 180-day window. Each item below is addressed in the order presented in your letter; updated submission §11.4 is attached, along with the requested raw paired dataset.',
      deficiencies: [
        {
          id: 'D1',
          response: 'Stratified MARD analysis by pre-specified age decile is provided below and incorporated into the revised §11.4 (attached). The stratified analysis was conducted on the same paired CGM-YSI dataset as the primary analysis (n=412 subjects, n=43,218 paired values) using the same adjudication scheme. Point estimates and two-sided 95% confidence intervals are reported per CLSI EP-09 conventions.',
          table: {
            cols: ['Age band', 'Subjects (n)', 'Paired values (n)', 'MARD %', '95% CI', 'Δ vs. overall'],
            rows: [
              ['18–39 years', 142, 14_842, '8.4%', '7.7 – 9.1%', '−0.3'],
              ['40–64 years', 208, 21_902, '8.6%', '8.0 – 9.2%', '−0.1'],
              ['65+ years', 62, 6_474, '9.4%', '8.4 – 10.5%', '+0.7'],
              ['Overall', 412, 43_218, '8.7%', '8.2 – 9.3%', '—'],
            ],
          },
          discussion: 'No band exceeds the special-controls acceptance threshold of MARD ≤ 10%. The 65+ band shows a non-significant trend toward higher MARD (+0.7 points vs. overall), consistent with literature on CGM performance in older adults; the upper bound of the 95% CI (10.5%) does not exceed the threshold. No labeling reconciliation is required.',
          evidence: [
            { name: 'mard-by-age-band-stratified.xlsx', kind: 'xls', size: 184320, source: 'Generated from Sources/clinical/BX204-PIVOT-paired.csv', new: true },
            { name: 'consensus-error-grid-by-band.png', kind: 'img', size: 412334, source: 'Generated from Sources/clinical/BX204-PIVOT-paired.csv', new: true },
          ],
          updates: [
            { section: '§11.4 Accuracy', diff: '+412 / −38', summary: 'Inserted stratified table + discussion paragraph after primary MARD result.' },
          ],
        },
        {
          id: 'D2',
          response: 'The complete adjudicated paired dataset is attached as a single CSV (24.8 MB). Columns: subject_id, device_serial, ts_utc, cgm_mg_dl, ysi_mg_dl, abs_diff_pct, elapsed_hours_from_insertion, age_band, ceg_zone. Adjudication followed the protocol in the SAP (v2.4, attached); 41 paired values were excluded for protocol-defined sensor warm-up (< 2 hr from insertion). Data dictionary attached.',
          evidence: [
            { name: 'BX204-PIVOT-paired-adjudicated.csv', kind: 'csv', size: 26_004_172, source: 'Sources/clinical/raw/', new: false },
            { name: 'data-dictionary-paired.pdf', kind: 'pdf', size: 184320, source: 'Generated', new: true },
          ],
          updates: [],
        },
        {
          id: 'D3',
          response: '§11.4 has been updated to incorporate the stratified analysis (see D1 response above). On labeling reconciliation: because no stratified band exceeds the acceptance threshold and the 65+ upper-CI bound (10.5%) does not cross the threshold, no narrowing of the cleared indication is proposed. The draft IFU attached confirms the existing ≥ 2 years age range. No changes to the Indications for Use are required.',
          evidence: [
            { name: 'IFU-final-locked.pdf', kind: 'pdf', size: 92160, source: 'Files/Dossier/§07 Indications for Use/', new: false },
          ],
          updates: [
            { section: '§11.4 Accuracy', diff: '(included above)' },
          ],
        },
      ],
      closing: 'We respectfully request that CDRH resume substantive review upon receipt of this response. We are available for an interactive review meeting at the lead reviewer\'s convenience and can be reached through the eSTAR portal or at the contact below. Concept2Cure Diagnostics confirms that all data submitted herein were collected under the IRB-approved BX204-PIVOT-001 protocol and that the submitter takes responsibility for the truthfulness and accuracy of the information.',
      reviewers: [
        { role: 'Reg Lead', name: 'Jordan Chen', status: 'pending' },
        { role: 'Biostat', name: 'Marcus Wei', status: 'approved', signed_at: '2026-04-29T11:18:00Z' },
        { role: 'Med Affairs', name: 'Dr. Lee Hartman', status: 'pending' },
        { role: 'QA', name: 'Priya Shah', status: 'pending' },
      ],
      send_to: 'CDRH eSTAR portal · K-251401 · AI Hold #1',
      due: '2026-05-13',
      acknowledged_by: 'Jordan Chen, Reg Lead · 2026-04-29 09:55 UTC',
    },
  },

  /* ── 510(k) — Interactive Review ── */
  'rta-2': {
    letter: {
      from_name: 'Dr. Rosemary T. Tanaka, MD',
      from_title: 'Lead Reviewer · DHT2C',
      from_office: 'CDRH · OHT2 · DHT2C',
      ref: 'K-251401 · Interactive Review #1',
      our_ref: 'BX-204 / Concept2Cure Diagnostics, Inc.',
      dated: '2026-04-26',
      received_at: '2026-04-26T15:32:00Z',
      via: 'eCopy',
      body: [
        'During review of your 510(k) submission for the BX-204 Continuous Glucose Monitor, the reviewer requests clarification on the software-architecture comparison to the cited predicate K221847 (Dexcom G7 CGM System).',
        'Specifically, please provide a side-by-side software architecture diagram showing the subject device and the predicate, with explicit identification of any differences in the glucose-prediction classifier (model class, feature set, training data scope), and a written rationale that any differences do not raise new questions of safety or effectiveness.',
        'This request is informal under the Interactive Review process and does not pause the review clock. Please respond within 7 business days.',
      ],
      signature: { sign_off: 'Best regards,', name: 'Rosemary T. Tanaka, MD', title: 'Lead Reviewer' },
    },
    deficiencies: [
      {
        id: 'D1', n: 1, title: 'Side-by-side software architecture diagram + classifier delta',
        body: 'Provide architecture diagram comparing subject device to K221847 with explicit classifier differences and rationale that differences do not raise new questions of safety or effectiveness.',
        refs: [{ section: 10, label: '§10 Software' }, { section: 5, label: '§5 Predicate comparison' }],
        regs: [{ ref: 'FDA Guidance · Software Functions Premarket (June 2023)', title: 'Software documentation level expectations' }],
        severity: 'minor',
      },
    ],
    draft: { status: 'unstarted' },
  },

  /* ── PMA — Day-100 (5 deficiencies) ── */
  'd100-2': {
    letter: {
      from_name: 'Dr. James K. Park, MD, PhD',
      from_title: 'Branch Chief · Division of Cardiovascular Devices',
      from_office: 'CDRH · OHT2 · DHT2A',
      ref: 'P250048 · Day-100 Letter',
      our_ref: 'CV-330 / Concept2Cure Implantables, Inc.',
      dated: '2026-04-28',
      received_at: '2026-04-28T16:11:00Z',
      via: 'CDRH letter (paper + portal)',
      body: [
        'CDRH has completed the Day-100 review of PMA P250048 for the CV-330 Implantable Cardiac Monitor. The following five (5) deficiencies must be addressed.',
        '1. Module 5.3.5 — Pivotal trial: The primary endpoint analysis uses SAP v2.4 with Bayesian borrowing from the predecessor IDE registry. Please re-analyze the primary endpoint using SAP v3.0 (without borrowing) and provide both estimates side-by-side. Confirm that the conclusion of non-inferiority holds under the frequentist analysis.',
        '2. Module 2.7.3 — Efficacy: Stratified subgroup analysis by age band and baseline rhythm is incomplete. Provide MARD-equivalent metric (sensitivity for clinically significant arrhythmia detection) by age decile and by baseline rhythm category.',
        '3. Module 2.7.4 — AE summary: The Clinical Events Committee adjudication committee composition (members, voting rules, blinding procedures) is not described. Provide composition and procedure documentation.',
        '4. Module 3.2.P.5 — Biocompatibility: Provide additional extractables/leachables data for the hermetic seal materials per ISO 10993-18:2020 § 8.4 (semi-quantitative analysis).',
        '5. Module 3.2.P.7 — Software cybersecurity: Provide updated SBOM (CycloneDX 1.5+) and threat model addressing post-market patch deployment over the BLE link.',
        'Please respond within 30 days. Failure to respond may result in a Major Deficiency letter and PMA filing extension.',
      ],
      signature: { sign_off: 'Sincerely,', name: 'James K. Park, MD, PhD', title: 'Branch Chief' },
    },
    deficiencies: [
      { id: 'D1', n: 1, title: 'Re-analyze PE under SAP v3.0 (no Bayesian borrowing)',
        body: 'Provide both Bayesian and frequentist estimates side-by-side; confirm non-inferiority conclusion holds.',
        refs: [{ section: 'M535', label: 'Module 5.3.5 — Pivotal trial' }],
        regs: [{ ref: '21 CFR 814.20(b)(3)(v)', title: 'Statistical analysis' }, { ref: 'ICH E9', title: 'Statistical principles' }],
        severity: 'major' },
      { id: 'D2', n: 2, title: 'Stratified subgroup analyses (age, baseline rhythm)',
        body: 'Provide sensitivity by age decile and baseline rhythm category.',
        refs: [{ section: 'M273', label: 'Module 2.7.3 — Efficacy' }],
        regs: [{ ref: 'ICH E9', title: 'Subgroup analyses' }], severity: 'major' },
      { id: 'D3', n: 3, title: 'CEC composition + voting procedure',
        body: 'Provide CEC member list, voting rules, blinding procedures.',
        refs: [{ section: 'M274', label: 'Module 2.7.4 — AE summary' }],
        regs: [{ ref: '21 CFR 814.20(b)(3)(vi)', title: 'Adverse event reporting' }], severity: 'minor' },
      { id: 'D4', n: 4, title: 'Extractables/leachables for hermetic seal materials',
        body: 'Provide ISO 10993-18:2020 § 8.4 semi-quantitative analysis.',
        refs: [{ section: 'M325', label: 'Module 3.2.P.5 — Biocompatibility' }],
        regs: [{ ref: 'ISO 10993-18:2020', title: 'Chemical characterization' }], severity: 'major' },
      { id: 'D5', n: 5, title: 'Updated SBOM + post-market patch threat model',
        body: 'CycloneDX 1.5+ SBOM and threat model addressing BLE patch deployment.',
        refs: [{ section: 'M327', label: 'Module 3.2.P.7 — Software cybersecurity' }],
        regs: [{ ref: 'FDA Cybersecurity Guidance (Sept 2023)', title: 'Premarket cybersecurity' }], severity: 'major' },
    ],
    draft: { status: 'unstarted' },
  },

  /* ── CER — NB Major NC ── */
  'nbq-3': {
    letter: {
      from_name: 'Dr. Henrik Olsen',
      from_title: 'Notified Body Reviewer · CE Marking · MDR',
      from_office: 'TÜV SÜD Product Service GmbH · Munich',
      ref: 'CER IV-415 · NC #2026-04-29',
      our_ref: 'IV-415 / Concept2Cure Diagnostics EU GmbH',
      dated: '2026-04-29',
      received_at: '2026-04-29T07:02:00Z',
      via: 'TEAM-NB portal',
      body: [
        'During review of the Clinical Evaluation Report (CER) for IV-415 Companion Diagnostic submitted under MDR Article 61, a Major Non-Conformity has been identified per MDCG 2020-13 § 6.4.',
        'The state-of-the-art (SoA) section §3 cites primarily a single 2018 Cochrane systematic review. MDCG 2020-13 requires the SoA evaluation to reflect "the most recent state of clinical knowledge", with the literature search having been performed within the prior 12 months and covering the publication years up to and including the year prior to CER submission.',
        'Please revise §3 with a refreshed literature search covering 2023–2024 publications, including search strategy (databases, search strings, date restrictions), PRISMA flow diagram, and an updated CASP appraisal grid for newly included studies. The revised SoA narrative should explicitly state how the new evidence affects the equivalence determination and benefit-risk profile.',
        'This is a Major NC and must be resolved before CE-mark renewal can proceed. Please respond within 30 days.',
      ],
      signature: { sign_off: 'Best regards,', name: 'Henrik Olsen', title: 'NB Reviewer' },
    },
    deficiencies: [
      { id: 'D1', n: 1, title: 'Refresh literature search 2023–2024',
        body: 'Provide search strategy, PRISMA diagram, and CASP appraisals for new studies.',
        refs: [{ section: 'S2', label: '§2 State-of-the-art analysis' }, { section: 'S3', label: '§3 Clinical data summary' }],
        regs: [{ ref: 'MDCG 2020-13 § 6.4', title: 'CER state-of-the-art expectations' }, { ref: 'MDR Annex XIV Part A § 3', title: 'Clinical evaluation' }],
        severity: 'major' },
    ],
    draft: { status: 'unstarted' },
  },
};
