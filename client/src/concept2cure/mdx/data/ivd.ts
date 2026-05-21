/**
 * Phase 6 · IVD pathway (in-vitro diagnostic) data.
 *
 * In-vitro diagnostics have unique analytical + clinical performance
 * requirements distinct from medtech 510(k). Plus CLIA complexity
 * categorization (waived / moderate / high) determines which labs can run
 * the test in the US.
 *
 * Wire shape: GET /api/mdx/ivd/:programId
 */

export const IVD_ANALYTES = [
  { code: 'GLU',  name: 'Glucose',          range: '40–500 mg/dL', units: 'mg/dL' },
  { code: 'HBA1C',name: 'Hemoglobin A1c',   range: '4–14 %',       units: '%' },
  { code: 'TROP-I',name:'Troponin I',       range: '0.01–50 ng/mL',units: 'ng/mL' },
  { code: 'CRP',  name: 'C-reactive prot.', range: '0.5–500 mg/L', units: 'mg/L' },
];

export const IVD_KPIS = [
  { label: 'Analytes in panel',  metric: '14', meta: '4 primary · 10 reflex' },
  { label: 'Studies complete',   metric: '8',  unit: '/11', meta: 'Bias · imprecision · LoD · linearity · cleared', tone: 'warn' },
  { label: 'Reference materials',metric: '6',  meta: 'ISO 17511 traceable · 2 conditional' },
  { label: 'CLIA categorization',metric: 'Moderate', meta: 'Pending waiver application',                       tone: 'warn' },
];

/* Analytical performance studies — CLSI guidelines */
export const IVD_ANALYTICAL = [
  { id: 'AP-001', study: 'Accuracy / bias',           clsi: 'EP09-A3',  state: 'complete',   owner: 'PS', n: 240, target: 'bias < 10%',     result: '6.8%',     pass: true },
  { id: 'AP-002', study: 'Imprecision',               clsi: 'EP05-A3',  state: 'complete',   owner: 'PS', n: 80,  target: 'CV < 5%',         result: '3.4%',     pass: true },
  { id: 'AP-003', study: 'Detection limit (LoB/LoD/LoQ)', clsi: 'EP17-A2', state: 'complete', owner: 'LT', n: 60,  target: 'LoD < 5 mg/dL',   result: '3.1 mg/dL',pass: true },
  { id: 'AP-004', study: 'Linearity',                 clsi: 'EP06-A',   state: 'complete',   owner: 'LT', n: 50,  target: 'r² > 0.98',       result: '0.997',    pass: true },
  { id: 'AP-005', study: 'Interference',              clsi: 'EP07-A2',  state: 'review',     owner: 'PS', n: 18,  target: 'bias < 10%',     result: 'pending',  pass: null },
  { id: 'AP-006', study: 'Method comparison',         clsi: 'EP09-A3',  state: 'in-progress',owner: 'LT', n: 120, target: 'Passing-Bablok slope 0.95-1.05', result: '0.92 / target 0.95-1.05', pass: false },
  { id: 'AP-007', study: 'Matrix comparison',         clsi: 'EP14-A3',  state: 'in-progress',owner: 'PS', n: 30,  target: 'bias < 10% across matrices', result: 'serum ok · plasma pending', pass: null },
  { id: 'AP-008', study: 'Specificity / cross-react', clsi: '—',        state: 'complete',   owner: 'PS', n: 22,  target: 'no XR > 5%',     result: 'max 2.1%', pass: true },
];

/* Clinical performance studies */
export const IVD_CLINICAL = [
  { id: 'CP-001', study: 'Sensitivity / specificity', n: 412, target: 'sens > 92%', result: '94.6% / 96.1%', state: 'complete',    pass: true,  population: 'symptomatic + asymptomatic adults' },
  { id: 'CP-002', study: 'PPV / NPV',                 n: 412, target: 'PPV > 85%',  result: '88.4% / 98.1%', state: 'complete',    pass: true,  population: 'derived from CP-001' },
  { id: 'CP-003', study: 'ROC analysis',              n: 412, target: 'AUC > 0.95', result: '0.971',          state: 'complete',    pass: true,  population: 'derived from CP-001' },
  { id: 'CP-004', study: 'Intended-population study', n: 280, target: 'n ≥ 280 across 3 demographics', result: '94/93/93 split', state: 'in-progress', pass: null, population: '4-site prospective cohort' },
];

/* Reference material + calibrator hierarchy — ISO 17511 traceability */
export const IVD_REFMATS = [
  { id: 'RM-GLU-001', analyte: 'GLU',    level: 'Primary (international SI)',  source: 'NIST SRM 965b',    state: 'qualified',   expiry: '2028-12' },
  { id: 'RM-GLU-002', analyte: 'GLU',    level: 'Manufacturer master cal.',     source: 'In-house · MFG-2024-04', state:'qualified', expiry: '2027-04' },
  { id: 'RM-GLU-003', analyte: 'GLU',    level: 'Manufacturer working cal.',    source: 'In-house · MFG-2025-09', state:'qualified', expiry: '2026-09' },
  { id: 'RM-A1C-001', analyte: 'HBA1C',  level: 'Primary',                       source: 'IFCC SRM',          state: 'qualified',  expiry: '2029-03' },
  { id: 'RM-TRP-001', analyte: 'TROP-I', level: 'Primary',                       source: 'IRMM ERM-DA474',    state: 'conditional', expiry: '2027-08' },
  { id: 'RM-CRP-001', analyte: 'CRP',    level: 'Primary',                       source: 'WHO 85/506',        state: 'qualified',  expiry: '2030-12' },
];

/* IVD docs — analytical reports, clinical reports, CLIA waiver, performance summary */
export const IVD_DOC_FRAMEWORKS = [
  { id: 'analytical', label: 'Analytical',    desc: 'CLSI EP guidelines' },
  { id: 'clinical',   label: 'Clinical',      desc: 'Sens/spec, PPV, ROC' },
  { id: 'traceability',label:'Traceability',  desc: 'ISO 17511 ref materials' },
  { id: 'clia',       label: 'CLIA waiver',   desc: 'CMS categorization' },
];

export const IVD_DOCUMENTS = [
  { id: 'doc-ivd-perf-pkg', framework: 'analytical', type: 'Analytical performance package', title: 'Analytical performance studies — DX-102 IVD cartridge', ver: 'v1.4', status: 'review', completion: 78, blocker: false, owner: 'PS', reviewers: ['LT', 'JC'], lastEdit: '2d ago', esigRequired: true, esigState: 'pending', sections: 8, sectionsComplete: 6, openComments: 4, editor: 'engineering' },
  { id: 'doc-ivd-method-comp', framework: 'analytical', type: 'Method comparison report', title: 'Method comparison — DX-102 vs predicate reference assay', ver: 'v0.8', status: 'draft', completion: 54, blocker: true, owner: 'LT', reviewers: [], lastEdit: '4h ago', esigRequired: true, esigState: 'na', sections: 6, sectionsComplete: 3, blockerNote: 'Slope 0.92 outside Passing-Bablok target 0.95–1.05 · root cause investigation open', editor: 'engineering' },
  { id: 'doc-ivd-loblod', framework: 'analytical', type: 'Detection-limit report', title: 'LoB / LoD / LoQ determination — DX-102 (EP17-A2)', ver: 'v1.2', status: 'ready', completion: 100, blocker: false, owner: 'LT', reviewers: ['PS'], lastEdit: '11d ago', esigRequired: true, esigState: 'signed', signedBy: 'LT · 2026-04-30', sections: 4, sectionsComplete: 4, editor: 'engineering' },
  { id: 'doc-ivd-clinical-pkg', framework: 'clinical', type: 'Clinical performance package', title: 'Clinical performance studies — DX-102 sensitivity, specificity, PPV, NPV, ROC', ver: 'v1.1', status: 'review', completion: 88, blocker: false, owner: 'PS', reviewers: ['JC'], lastEdit: '1d ago', esigRequired: true, esigState: 'pending', sections: 6, sectionsComplete: 5, openComments: 3, editor: 'engineering' },
  { id: 'doc-ivd-pop', framework: 'clinical', type: 'Intended-population study', title: 'DX-102 intended-population prospective cohort study', ver: 'v0.6', status: 'draft', completion: 48, blocker: false, owner: 'PS', reviewers: [], lastEdit: '6h ago', esigRequired: true, esigState: 'na', sections: 8, sectionsComplete: 4, editor: 'engineering' },
  { id: 'doc-ivd-trace', framework: 'traceability', type: 'Calibrator hierarchy', title: 'Reference-material + calibrator hierarchy — ISO 17511 traceability', ver: 'v2.0', status: 'ready', completion: 100, blocker: false, owner: 'LT', reviewers: ['PS', 'JC'], lastEdit: '18d ago', esigRequired: true, esigState: 'signed', signedBy: 'LT · 2026-04-21', sections: 14, sectionsComplete: 14, editor: 'engineering' },
  { id: 'doc-ivd-stability', framework: 'traceability', type: 'Reagent stability report', title: 'DX-102 reagent stability — open-vial, shipping, real-time', ver: 'v1.6', status: 'review', completion: 92, blocker: false, owner: 'PS', reviewers: ['LT'], lastEdit: '8h ago', esigRequired: true, esigState: 'pending', sections: 4, sectionsComplete: 4, editor: 'engineering' },
  { id: 'doc-ivd-clia-app', framework: 'clia', type: 'CLIA waiver application', title: 'CLIA categorization — waiver application for DX-102 POC', ver: 'v0.4', status: 'draft', completion: 32, blocker: true, owner: 'PS', reviewers: [], lastEdit: '12h ago', esigRequired: true, esigState: 'na', sections: 16, sectionsComplete: 5, blockerNote: 'Awaiting flex study results · 7 untrained-user sites pending', editor: 'engineering' },
];

