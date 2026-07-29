/* ------------------------------------------------------------------ *
 *  editor-data-pathways.ts
 *  Regulatory pathway definitions, surface-to-pathway routing,
 *  target markets, and template library for the document editor.
 * ------------------------------------------------------------------ */

import type {
  Market,
  Pathway,
  PathwayId,
  SurfaceId,
  TemplateGroup,
} from './editor-data-types';

/* -- Regulatory pathways -------------------------------------------- */

export const REG_PATHWAYS: Readonly<Record<PathwayId, Pathway>> = {
  ctd: {
    id: 'ctd', kind: 'CTD · eCTD', program: 'NDA 212345 — oncology biologic', code: 'eCTD', ta: 'onc',
    owner: 'A. Müller', dueline: 'FDA filing · Q3 2026', readiness: 71, active: 'm25',
    tree: [
      { vol: 'Module 1 — Administrative & prescribing', items: [
        { id: 'm111', num: '1.1', label: 'Forms (FDA 356h / 1571 / 3674)', status: 'complete', conf: 0.99, words: 120 },
        { id: 'm12', num: '1.2', label: 'Cover letter', status: 'complete', conf: 0.97, words: 340 },
        { id: 'm132', num: '1.3.1', label: 'Administrative information', status: 'review', conf: 0.84, words: 610 },
        { id: 'm134', num: '1.3.4', label: 'Financial certification (3454/3455)', status: 'review', conf: 0.80, words: 240 },
        { id: 'm1141', num: '1.14.1', label: 'Draft labeling / package insert', status: 'draft', conf: 0.62, words: 0 },
        { id: 'm1143', num: '1.14.3', label: 'Prescribing information (USPI)', status: 'draft', conf: 0.55, words: 0 },
      ]},
      { vol: 'Module 2 — CTD summaries', items: [
        { id: 'm21', num: '2.1', label: 'CTD table of contents', status: 'complete', conf: 0.99, words: 90 },
        { id: 'm22', num: '2.2', label: 'Introduction', status: 'review', conf: 0.81, words: 420 },
        { id: 'm23', num: '2.3', label: 'Quality overall summary', status: 'review', conf: 0.78, words: 2400 },
        { id: 'm24', num: '2.4', label: 'Nonclinical overview', status: 'complete', conf: 0.93, words: 3100 },
        { id: 'm25', num: '2.5', label: 'Clinical overview', status: 'draft', conf: 0.74, words: 1860, blocker: true },
        { id: 'm26', num: '2.6', label: 'Nonclinical written & tabulated summaries', status: 'draft', conf: 0.55, words: 0 },
        { id: 'm271', num: '2.7.1', label: 'Summary of biopharmaceutic studies', status: 'draft', conf: 0.58, words: 0 },
        { id: 'm272', num: '2.7.2', label: 'Summary of clinical pharmacology', status: 'draft', conf: 0.60, words: 0 },
        { id: 'm273', num: '2.7.3', label: 'Summary of clinical efficacy', status: 'draft', conf: 0.57, words: 0 },
        { id: 'm274', num: '2.7.4', label: 'Summary of clinical safety', status: 'draft', conf: 0.54, words: 0 },
      ]},
      { vol: 'Module 3 — Quality (CMC)', items: [
        { id: 'm32s1', num: '3.2.S.1', label: 'Drug substance — general information', status: 'complete', conf: 0.94, words: 680 },
        { id: 'm32s2', num: '3.2.S.2', label: 'Drug substance — manufacture', status: 'review', conf: 0.86, words: 5200 },
        { id: 'm32s3', num: '3.2.S.3', label: 'Characterisation', status: 'review', conf: 0.83, words: 2100 },
        { id: 'm32s4', num: '3.2.S.4', label: 'Control of drug substance', status: 'review', conf: 0.85, words: 1900 },
        { id: 'm32s7', num: '3.2.S.7', label: 'Stability — drug substance', status: 'draft', conf: 0.66, words: 0 },
        { id: 'm32p1', num: '3.2.P.1', label: 'Drug product — description & composition', status: 'review', conf: 0.80, words: 540 },
        { id: 'm32p3', num: '3.2.P.3', label: 'Drug product — manufacture', status: 'draft', conf: 0.64, words: 3100 },
        { id: 'm32p5', num: '3.2.P.5', label: 'Control of drug product', status: 'draft', conf: 0.60, words: 0 },
        { id: 'm32p8', num: '3.2.P.8', label: 'Stability — drug product', status: 'draft', conf: 0.58, words: 0 },
        { id: 'm32a', num: '3.2.A', label: 'Appendices (facilities, adventitious agents)', status: 'draft', conf: 0.50, words: 0 },
        { id: 'm32r', num: '3.2.R', label: 'Regional information', status: 'draft', conf: 0.40, words: 0 },
      ]},
      { vol: 'Module 4 — Nonclinical study reports', items: [
        { id: 'm421', num: '4.2.1', label: 'Pharmacology reports', status: 'complete', conf: 0.95, words: 7400 },
        { id: 'm422', num: '4.2.2', label: 'Pharmacokinetics reports', status: 'complete', conf: 0.92, words: 3600 },
        { id: 'm423', num: '4.2.3', label: 'Toxicology reports', status: 'complete', conf: 0.94, words: 8800 },
      ]},
      { vol: 'Module 5 — Clinical study reports', items: [
        { id: 'm52', num: '5.2', label: 'Tabular listing of all clinical studies', status: 'complete', conf: 0.97, words: 320 },
        { id: 'm531', num: '5.3.1', label: 'Biopharmaceutic study reports', status: 'complete', conf: 0.92, words: 4100 },
        { id: 'm533', num: '5.3.3', label: 'Human PK study reports', status: 'review', conf: 0.81, words: 5200 },
        { id: 'm535', num: '5.3.5', label: 'Efficacy & safety study reports', status: 'review', conf: 0.83, words: 12600 },
        { id: 'm54', num: '5.4', label: 'Literature references', status: 'draft', conf: 0.60, words: 0 },
      ]},
    ],
  },
  estar: {
    id: 'estar', kind: '510(k) · eSTAR', program: 'Aurora CGM System — Traditional 510(k)', code: 'K-pending', ta: 'dx',
    owner: 'J. Chen', dueline: 'CDRH submission · Aug 2026', readiness: 64, active: 'k7',
    tree: [
      { vol: 'Administrative (§01–06)', items: [
        { id: 'k1', num: '§01', label: 'Medical Device User Fee cover sheet', status: 'complete', conf: 0.99, words: 180 },
        { id: 'k2', num: '§02', label: 'CDRH premarket review cover sheet', status: 'complete', conf: 0.98, words: 140 },
        { id: 'k3', num: '§03', label: 'Truthful & accuracy statement', status: 'complete', conf: 0.99, words: 60 },
        { id: 'k4', num: '§04', label: 'Class & device information / classification', status: 'complete', conf: 0.97, words: 180 },
        { id: 'k5', num: '§05', label: 'Indications for use (FDA 3881)', status: 'complete', conf: 0.94, words: 210 },
        { id: 'k6', num: '§06', label: '510(k) summary or statement', status: 'review', conf: 0.82, words: 760 },
      ]},
      { vol: 'Device description (§07–09)', items: [
        { id: 'k7', num: '§07', label: 'Predicate & substantial equivalence', status: 'draft', conf: 0.74, words: 1420, blocker: true },
        { id: 'k8', num: '§08', label: 'Device description', status: 'review', conf: 0.85, words: 1240 },
        { id: 'k9', num: '§09', label: 'Proposed labeling & IFU', status: 'draft', conf: 0.60, words: 0 },
      ]},
      { vol: 'Performance data (§10–16)', items: [
        { id: 'k10', num: '§10', label: 'Sterilization & shelf life', status: 'draft', conf: 0.52, words: 0 },
        { id: 'k11', num: '§11', label: 'Biocompatibility', status: 'review', conf: 0.82, words: 980 },
        { id: 'k12', num: '§12', label: 'Software / firmware documentation', status: 'draft', conf: 0.58, words: 0 },
        { id: 'k13', num: '§13', label: 'EMC, wireless & electrical safety', status: 'draft', conf: 0.55, words: 0 },
        { id: 'k14', num: '§14', label: 'Performance testing — bench', status: 'review', conf: 0.80, words: 3200 },
        { id: 'k15', num: '§15', label: 'Performance testing — animal', status: 'draft', conf: 0.50, words: 0 },
        { id: 'k16', num: '§16', label: 'Performance testing — clinical', status: 'draft', conf: 0.61, words: 0 },
      ]},
      { vol: 'Cybersecurity & closing (§17–20)', items: [
        { id: 'k17', num: '§17', label: 'Cybersecurity / interoperability', status: 'draft', conf: 0.49, words: 0 },
        { id: 'k18', num: '§18', label: 'Administrative documentation', status: 'review', conf: 0.86, words: 420 },
        { id: 'k19', num: '§19', label: 'Financial disclosure', status: 'complete', conf: 0.95, words: 160 },
        { id: 'k20', num: '§20', label: 'References', status: 'complete', conf: 0.93, words: 720 },
      ]},
    ],
  },
  pma: {
    id: 'pma', kind: 'PMA · 21 CFR 814', program: 'CV-330 Implantable Cardiac Monitor — PMA', code: 'P-pending', ta: 'cv',
    owner: 'J. Adeyemi', dueline: 'PMA filing · Q2 2026', readiness: 61, active: 'p51',
    tree: [
      { vol: 'Module 1 — Administrative', items: [
        { id: 'p11', num: '1.1', label: 'Cover letter', status: 'complete', conf: 0.98, words: 280 },
        { id: 'p12', num: '1.2', label: 'Table of contents', status: 'complete', conf: 0.99, words: 120 },
        { id: 'p13', num: '1.3', label: 'Indications for use', status: 'complete', conf: 0.96, words: 210 },
        { id: 'p14', num: '1.4', label: 'Device description', status: 'review', conf: 0.84, words: 1640 },
        { id: 'p15', num: '1.5', label: 'Alternative practices & procedures', status: 'draft', conf: 0.58, words: 0 },
      ]},
      { vol: 'Module 2 — Summary of safety & effectiveness', items: [
        { id: 'p21', num: '2.1', label: 'Summary of safety & effectiveness (SSED)', status: 'draft', conf: 0.66, words: 4810 },
        { id: 'p22', num: '2.2', label: 'Risk analysis (ISO 14971)', status: 'review', conf: 0.81, words: 1900 },
        { id: 'p23', num: '2.3', label: 'Benefit-risk determination', status: 'draft', conf: 0.60, words: 0 },
      ]},
      { vol: 'Module 3 — Manufacturing', items: [
        { id: 'p31', num: '3.1', label: 'Manufacturing site information', status: 'complete', conf: 0.93, words: 520 },
        { id: 'p32', num: '3.2', label: 'Quality system (QSR) summary', status: 'review', conf: 0.78, words: 1400, blocker: true },
        { id: 'p33', num: '3.3', label: 'Sterilization validation', status: 'complete', conf: 0.94, words: 880 },
        { id: 'p34', num: '3.4', label: 'Packaging & labeling', status: 'draft', conf: 0.56, words: 0 },
      ]},
      { vol: 'Module 4 — Non-clinical', items: [
        { id: 'p41', num: '4.1', label: 'Bench performance testing', status: 'complete', conf: 0.95, words: 3200 },
        { id: 'p42', num: '4.2', label: 'Animal studies', status: 'complete', conf: 0.92, words: 2100 },
        { id: 'p43', num: '4.3', label: 'Biocompatibility', status: 'complete', conf: 0.93, words: 1600 },
        { id: 'p44', num: '4.4', label: 'Software verification & validation', status: 'review', conf: 0.80, words: 1200 },
        { id: 'p45', num: '4.5', label: 'Electromagnetic compatibility', status: 'complete', conf: 0.94, words: 760 },
      ]},
      { vol: 'Module 5 — Clinical', items: [
        { id: 'p51', num: '5.1', label: 'Clinical investigation summary', status: 'draft', conf: 0.72, words: 6230, blocker: true },
        { id: 'p52', num: '5.2', label: 'Clinical data — primary endpoint', status: 'draft', conf: 0.64, words: 0 },
        { id: 'p53', num: '5.3', label: 'Adverse events & SAEs', status: 'review', conf: 0.79, words: 1800 },
        { id: 'p54', num: '5.4', label: 'Statistical analysis plan', status: 'complete', conf: 0.93, words: 2400 },
        { id: 'p55', num: '5.5', label: 'Conclusions', status: 'draft', conf: 0.50, words: 0 },
      ]},
      { vol: 'Module 6 — Post-approval', items: [
        { id: 'p61', num: '6.1', label: 'Post-approval study plan', status: 'draft', conf: 0.52, words: 0 },
        { id: 'p62', num: '6.2', label: 'Post-market surveillance', status: 'draft', conf: 0.48, words: 0 },
        { id: 'p63', num: '6.3', label: 'Tracking & reporting', status: 'draft', conf: 0.44, words: 0 },
      ]},
    ],
  },
  cer: {
    id: 'cer', kind: 'CER · EU MDR Annex XIV', program: 'Meridian Pacing Lead — Clinical Evaluation Report', code: 'CER-2026', ta: 'cv',
    owner: 'L. Hartman', dueline: 'NB submission · Jul 2026', readiness: 58, active: 'cer4',
    tree: [
      { vol: 'Front matter', items: [
        { id: 'cerA', num: 'A', label: 'Scope of the clinical evaluation', status: 'complete', conf: 0.95, words: 520 },
        { id: 'cer1', num: '1', label: 'General details & device identification', status: 'complete', conf: 0.97, words: 340 },
      ]},
      { vol: 'Device & claims', items: [
        { id: 'cer2', num: '2', label: 'Device description & specification', status: 'review', conf: 0.86, words: 1180 },
        { id: 'cer3', num: '3', label: 'Intended purpose & claims', status: 'review', conf: 0.83, words: 740 },
        { id: 'cer4', num: '4', label: 'State of the art', status: 'draft', conf: 0.78, words: 1320, blocker: true },
      ]},
      { vol: 'Clinical evidence', items: [
        { id: 'cer5', num: '5', label: 'Clinical evaluation plan', status: 'draft', conf: 0.60, words: 0 },
        { id: 'cer6', num: '6', label: 'Literature search & appraisal', status: 'draft', conf: 0.57, words: 0 },
        { id: 'cer7', num: '7', label: 'Clinical investigation data', status: 'draft', conf: 0.54, words: 0 },
        { id: 'cer8', num: '8', label: 'PMS & PMCF data', status: 'draft', conf: 0.50, words: 0 },
      ]},
      { vol: 'Conclusion', items: [
        { id: 'cer9', num: '9', label: 'Benefit-risk & GSPR conformity', status: 'draft', conf: 0.46, words: 0 },
        { id: 'cer10', num: '10', label: 'Conclusions', status: 'draft', conf: 0.42, words: 0 },
      ]},
    ],
  },
  csr: {
    id: 'csr', kind: 'CSR · ICH E3', program: 'Study BX-204-301 — Phase III Clinical Study Report', code: 'CSR-301', ta: 'onc',
    owner: 'S. Okafor', dueline: 'Module 5.3.5 lock · Sep 2026', readiness: 62, active: 'e7',
    tree: [
      { vol: 'Front matter', items: [
        { id: 'e0', num: '—', label: 'Synopsis', status: 'review', conf: 0.84, words: 1100 },
        { id: 'e1', num: '1', label: 'Ethics', status: 'complete', conf: 0.96, words: 240 },
        { id: 'e2', num: '2', label: 'Investigators & study administration', status: 'complete', conf: 0.95, words: 380 },
      ]},
      { vol: 'Introduction & design', items: [
        { id: 'e3', num: '3', label: 'Introduction', status: 'complete', conf: 0.93, words: 520 },
        { id: 'e4', num: '4', label: 'Study objectives', status: 'complete', conf: 0.97, words: 210 },
        { id: 'e5', num: '5', label: 'Investigational plan', status: 'review', conf: 0.85, words: 2400 },
      ]},
      { vol: 'Results', items: [
        { id: 'e6', num: '6', label: 'Study patients & disposition', status: 'review', conf: 0.82, words: 1340 },
        { id: 'e7', num: '7', label: 'Efficacy evaluation', status: 'draft', conf: 0.76, words: 1860, blocker: true },
        { id: 'e8', num: '8', label: 'Safety evaluation', status: 'draft', conf: 0.58, words: 0 },
      ]},
      { vol: 'Conclusions', items: [
        { id: 'e9', num: '9', label: 'Discussion & overall conclusions', status: 'draft', conf: 0.50, words: 0 },
        { id: 'e16', num: '16', label: 'Appendices (tables, listings)', status: 'draft', conf: 0.44, words: 0 },
      ]},
    ],
  },
  ivdr: {
    id: 'ivdr', kind: 'IVDR · EU 2017/746', program: 'DxAssay RT-PCR — IVDR Technical Documentation', code: 'IVDR-2026', ta: 'dx',
    owner: 'R. Okonkwo', dueline: 'NB + EU reference lab · Q4 2026', readiness: 54, active: 'iv6',
    tree: [
      { vol: 'Device & classification (Annex II.1)', items: [
        { id: 'iv1', num: '1.1', label: 'Device description & intended purpose', status: 'complete', conf: 0.95, words: 840 },
        { id: 'iv2', num: '1.2', label: 'Classification (Annex VIII)', status: 'complete', conf: 0.96, words: 420 },
        { id: 'iv3', num: '1.3', label: 'Information supplied by manufacturer (IFU/label)', status: 'review', conf: 0.82, words: 610 },
      ]},
      { vol: 'Performance evidence (Annex XIII)', items: [
        { id: 'iv4', num: '2.1', label: 'Analytical performance', status: 'review', conf: 0.80, words: 1480, blocker: true },
        { id: 'iv5', num: '2.2', label: 'Scientific validity', status: 'draft', conf: 0.62, words: 0 },
        { id: 'iv6', num: '2.3', label: 'Clinical performance', status: 'draft', conf: 0.66, words: 1120, blocker: true },
        { id: 'iv7', num: '2.4', label: 'Performance evaluation report (PER)', status: 'draft', conf: 0.50, words: 0 },
      ]},
      { vol: 'Conformity & companion Dx', items: [
        { id: 'iv8', num: '3.1', label: 'GSPR conformity (Annex I)', status: 'draft', conf: 0.58, words: 0 },
        { id: 'iv9', num: '3.2', label: 'Companion-diagnostic linkage', status: 'draft', conf: 0.55, words: 0 },
        { id: 'iv10', num: '3.3', label: 'Risk management (ISO 14971)', status: 'review', conf: 0.78, words: 900 },
      ]},
      { vol: 'Post-market (Annex III)', items: [
        { id: 'iv11', num: '4.1', label: 'PMS plan', status: 'draft', conf: 0.50, words: 0 },
        { id: 'iv12', num: '4.2', label: 'PMPF plan', status: 'draft', conf: 0.44, words: 0 },
      ]},
    ],
  },
  protocol: {
    id: 'protocol', kind: 'Clinical Protocol · ICH E6(R3)', program: 'Study BX-204-301 — Phase III Oncology', code: 'PROT-301', ta: 'onc',
    owner: 'S. Okafor', dueline: 'IRB submission · Jul 2026', readiness: 54, active: 'pr3',
    tree: [
      { vol: 'Front Matter', items: [
        { id: 'pr1', num: '1', label: 'Title page & protocol identifier', status: 'complete', conf: 0.98, words: 280 },
        { id: 'pr2', num: '2', label: 'Synopsis', status: 'review', conf: 0.82, words: 960 },
        { id: 'pr3', num: '3', label: 'Table of contents', status: 'complete', conf: 0.99, words: 120 },
      ]},
      { vol: 'Background & Rationale', items: [
        { id: 'pr4', num: '4', label: 'Background & scientific rationale', status: 'review', conf: 0.79, words: 1840 },
        { id: 'pr5', num: '5', label: 'Unmet medical need', status: 'draft', conf: 0.71, words: 640 },
      ]},
      { vol: 'Objectives & Endpoints', items: [
        { id: 'pr6', num: '6', label: 'Primary objective & endpoint', status: 'complete', conf: 0.94, words: 380 },
        { id: 'pr7', num: '7', label: 'Secondary objectives & endpoints', status: 'review', conf: 0.81, words: 520 },
        { id: 'pr8', num: '8', label: 'Exploratory endpoints', status: 'draft', conf: 0.68, words: 260 },
      ]},
      { vol: 'Study Design', items: [
        { id: 'pr9', num: '9', label: 'Overall study design', status: 'review', conf: 0.84, words: 720 },
        { id: 'pr10', num: '10', label: 'Randomisation & blinding', status: 'draft', conf: 0.72, words: 480 },
        { id: 'pr11', num: '11', label: 'Study duration & visits', status: 'draft', conf: 0.65, words: 340 },
      ]},
      { vol: 'Eligibility', items: [
        { id: 'pr12', num: '12', label: 'Inclusion criteria', status: 'complete', conf: 0.95, words: 560 },
        { id: 'pr13', num: '13', label: 'Exclusion criteria', status: 'complete', conf: 0.93, words: 490 },
        { id: 'pr14', num: '14', label: 'Withdrawal criteria', status: 'review', conf: 0.78, words: 310 },
      ]},
      { vol: 'Investigational Product', items: [
        { id: 'pr15', num: '15', label: 'Description & formulation', status: 'complete', conf: 0.97, words: 420 },
        { id: 'pr16', num: '16', label: 'Dosing, administration & dose modifications', status: 'review', conf: 0.83, words: 680 },
        { id: 'pr17', num: '17', label: 'Concomitant medications', status: 'draft', conf: 0.69, words: 290 },
      ]},
      { vol: 'Assessments', items: [
        { id: 'pr18', num: '18', label: 'Schedule of assessments', status: 'review', conf: 0.77, words: 820 },
        { id: 'pr19', num: '19', label: 'Efficacy assessments', status: 'draft', conf: 0.66, words: 540 },
        { id: 'pr20', num: '20', label: 'Safety assessments & AE reporting', status: 'review', conf: 0.80, words: 760 },
        { id: 'pr21', num: '21', label: 'Pharmacokinetics & biomarkers', status: 'draft', conf: 0.62, words: 380 },
      ]},
      { vol: 'Statistical Considerations', items: [
        { id: 'pr22', num: '22', label: 'Statistical analysis plan summary', status: 'draft', conf: 0.70, words: 920 },
        { id: 'pr23', num: '23', label: 'Sample size justification', status: 'review', conf: 0.85, words: 340 },
        { id: 'pr24', num: '24', label: 'Interim analyses & stopping rules', status: 'draft', conf: 0.64, words: 280 },
      ]},
      { vol: 'Ethics & Regulatory', items: [
        { id: 'pr25', num: '25', label: 'Ethics committee / IRB review', status: 'complete', conf: 0.96, words: 260 },
        { id: 'pr26', num: '26', label: 'Informed consent process', status: 'complete', conf: 0.94, words: 440 },
        { id: 'pr27', num: '27', label: 'Regulatory compliance (ICH E6, 21 CFR 312)', status: 'review', conf: 0.86, words: 320 },
        { id: 'pr28', num: '28', label: 'Data privacy & GDPR', status: 'draft', conf: 0.68, words: 210 },
      ]},
      { vol: 'References & Appendices', items: [
        { id: 'pr29', num: '29', label: 'References', status: 'draft', conf: 0.75, words: 1200 },
        { id: 'pr30', num: '30', label: 'Appendix A — Protocol amendments log', status: 'draft', conf: 0.60, words: 180 },
        { id: 'pr31', num: '31', label: 'Appendix B — Schedule of assessments (detailed)', status: 'draft', conf: 0.58, words: 420 },
      ]},
    ],
    content: {
      pr3: '<div class="eb" data-conf="hi">This protocol (PROT-301) for Study BX-204-301 follows the ICH E6(R3) guideline for Good Clinical Practice. All sections are cross-referenced to the current approved IND (IND 125847) and the Statistical Analysis Plan (SAP-301 v2.0).</div>',
      pr6: '<div class="eb" data-conf="hi"><b>Primary objective:</b> To evaluate the efficacy of BX-204 plus standard-of-care (SOC) versus placebo plus SOC in patients with relapsed/refractory AML as measured by complete remission (CR) rate at Week 24.</div><div class="eb" data-conf="hi"><b>Primary endpoint:</b> Complete remission (CR) rate defined per 2022 ELN response criteria at Week 24, assessed by independent central review.</div>',
      pr12: '<div class="eb" data-conf="hi">1. Age ≥18 years at the time of informed consent.<br>2. Confirmed diagnosis of AML per WHO 2022 classification.<br>3. Relapsed or refractory after ≥1 prior line of therapy.<br>4. ECOG performance status 0–2.<br>5. Adequate hepatic function: total bilirubin ≤1.5× ULN; AST/ALT ≤3× ULN.<br>6. Adequate renal function: eGFR ≥45 mL/min/1.73m².<br>7. Able to provide written informed consent.</div>',
      pr25: '<div class="eb" data-conf="hi">This protocol and all amendments will be submitted to the institutional review board (IRB) or independent ethics committee (IEC) for review and approval prior to initiation of any study procedures. All applicable local regulatory requirements will be followed. Study conduct will be in accordance with the Declaration of Helsinki, ICH E6(R3), and 21 CFR Parts 50, 56, and 312.</div>',
    },
  },
};

/* -- Surface to pathway routing ------------------------------------- */

export const REG_SURFACE_PATHWAY: Readonly<Record<SurfaceId, PathwayId>> = {
  'document-authoring': 'ctd',
  'protocol-dev': 'protocol',
  'device-submission': 'estar',
  'device-workstream': 'estar',
  'device-510k': 'estar',
  'device-cer': 'cer',
  'device-diagnostics': 'ivdr',
  'ectd-coauthor': 'ctd',
  'csr-workflow': 'csr',
};

/* -- Markets each pathway can be filed into (first = default) ------- */

export const REG_MARKETS: Readonly<Partial<Record<PathwayId, readonly Market[]>>> = {
  ctd: [
    { id: 'fda', agency: 'FDA', region: 'United States', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
    { id: 'ema', agency: 'EMA', region: 'European Union', lang: 'en' },
    { id: 'nmpa', agency: 'NMPA', region: 'China', lang: 'zh' },
  ],
  estar: [
    { id: 'fda', agency: 'FDA', region: 'United States', lang: 'en' },
    { id: 'hc', agency: 'Health Canada', region: 'Canada', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
  ],
  cer: [
    { id: 'ema', agency: 'EMA / Notified Body', region: 'European Union', lang: 'en' },
    { id: 'bfarm', agency: 'BfArM', region: 'Germany', lang: 'de' },
    { id: 'ansm', agency: 'ANSM', region: 'France', lang: 'fr' },
  ],
  csr: [
    { id: 'ich', agency: 'ICH (global)', region: 'Multi-region', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
    { id: 'nmpa', agency: 'NMPA', region: 'China', lang: 'zh' },
  ],
  pma: [
    { id: 'fda', agency: 'FDA / CDRH', region: 'United States', lang: 'en' },
    { id: 'pmda', agency: 'PMDA', region: 'Japan', lang: 'ja' },
  ],
};

/* -- Template library (per pathway) --------------------------------- */

export const REG_TEMPLATES: Readonly<Partial<Record<PathwayId, readonly TemplateGroup[]>>> = {
  ctd: [
    { group: 'Module 1 — Administrative', items: [
      { id: 't-356h', num: '1.1', label: 'FDA 356h application form' },
      { id: 't-1571', num: '1.1', label: 'FDA 1571 (IND) form' },
      { id: 't-cover', num: '1.2', label: 'Cover letter' },
      { id: 't-pi', num: '1.14.1', label: 'Prescribing information (PLR/PLLR)' },
      { id: 't-meet', num: '1.6', label: 'Meeting request / briefing package' },
    ]},
    { group: 'Module 2 — CTD summaries', items: [
      { id: 't-qos', num: '2.3', label: 'Quality overall summary' },
      { id: 't-nco', num: '2.4', label: 'Nonclinical overview' },
      { id: 't-clo', num: '2.5', label: 'Clinical overview' },
      { id: 't-273', num: '2.7.3', label: 'Summary of clinical efficacy' },
      { id: 't-274', num: '2.7.4', label: 'Summary of clinical safety' },
    ]},
    { group: 'Module 3 — Quality (CMC)', items: [
      { id: 't-32s2', num: '3.2.S.2', label: 'Drug substance — manufacture' },
      { id: 't-32s4', num: '3.2.S.4', label: 'Control of drug substance' },
      { id: 't-32p3', num: '3.2.P.3', label: 'Drug product — manufacture' },
      { id: 't-32p5', num: '3.2.P.5', label: 'Control of drug product' },
      { id: 't-32p8', num: '3.2.P.8', label: 'Stability — drug product' },
    ]},
    { group: 'Module 4 — Nonclinical', items: [
      { id: 't-421', num: '4.2.1', label: 'Pharmacology study report' },
      { id: 't-423', num: '4.2.3', label: 'Toxicology study report' },
    ]},
    { group: 'Module 5 — Clinical', items: [
      { id: 't-535', num: '5.3.5', label: 'Efficacy & safety CSR (ICH E3)' },
      { id: 't-533', num: '5.3.3', label: 'Human PK study report' },
    ]},
  ],
  estar: [
    { group: 'Administrative', items: [
      { id: 't-3881', num: '§05', label: 'Indications for use (FDA 3881)' },
      { id: 't-k510sum', num: '§06', label: '510(k) summary' },
    ]},
    { group: 'Device & performance', items: [
      { id: 't-se', num: '§07', label: 'Substantial equivalence discussion' },
      { id: 't-devdesc', num: '§08', label: 'Device description' },
      { id: 't-bench', num: '§14', label: 'Bench performance test report' },
      { id: 't-biocomp', num: '§11', label: 'Biocompatibility evaluation (ISO 10993)' },
      { id: 't-soft', num: '§12', label: 'Software documentation (IEC 62304)' },
      { id: 't-cyber', num: '§17', label: 'Cybersecurity documentation' },
    ]},
  ],
  pma: [
    { group: 'Clinical & summary', items: [
      { id: 't-ssed', num: '2.1', label: 'Summary of safety & effectiveness (SSED)' },
      { id: 't-clin', num: '5.1', label: 'Clinical investigation summary' },
      { id: 't-sap', num: '5.4', label: 'Statistical analysis plan' },
    ]},
    { group: 'Manufacturing & non-clinical', items: [
      { id: 't-qsr', num: '3.2', label: 'Quality system (QSR) summary' },
      { id: 't-risk', num: '2.2', label: 'Risk analysis (ISO 14971)' },
      { id: 't-pas', num: '6.1', label: 'Post-approval study plan' },
    ]},
  ],
  cer: [
    { group: 'Clinical evaluation', items: [
      { id: 't-sota', num: '4', label: 'State-of-the-art analysis' },
      { id: 't-litprot', num: 'A', label: 'Literature search protocol' },
      { id: 't-gspr', num: '7', label: 'GSPR conformity checklist' },
      { id: 't-pmcf', num: '10', label: 'PMCF plan (MDCG 2020-7)' },
    ]},
  ],
  csr: [
    { group: 'ICH E3 sections', items: [
      { id: 't-syn', num: '—', label: 'Synopsis' },
      { id: 't-eff', num: '7', label: 'Efficacy evaluation' },
      { id: 't-saf', num: '8', label: 'Safety evaluation' },
      { id: 't-disc', num: '9', label: 'Discussion & overall conclusions' },
    ]},
  ],
};
