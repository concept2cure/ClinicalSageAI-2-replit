/**
 * Templates browser — Phase 5 · medtech corpus
 *
 * Org-approved section skeletons + boilerplate for every regulatory artifact
 * Phase 4 introduces. The codebase already has TemplatesSurface (generic);
 * this replaces it with a medtech-specific corpus organized by artifact
 * family (510(k), PMA, CER, Engineering, UDI, MDR/CAPA, QMS).
 *
 * Wire shape: GET /api/mdx/templates
 */

(() => {

const TPL_FRAMEWORKS = [
  { id: 'k510',   label: '510(k)',        desc: '21 CFR 807 — eSTAR sections' },
  { id: 'pma',    label: 'PMA',           desc: '21 CFR 814 — modules' },
  { id: 'cer',    label: 'CER',           desc: 'EU MDR Annex XIV' },
  { id: 'eng',    label: 'Engineering',   desc: 'DHF · risk · software' },
  { id: 'udi',    label: 'Labeling',      desc: 'IFU · package · symbols' },
  { id: 'pv',     label: 'Vigilance',     desc: 'MDR · CAPA · FSCA · PSUR' },
  { id: 'qms',    label: 'QMS',           desc: '21 CFR 820 · ISO 13485' },
];

/* Templates as documents — same shape as DocumentsPanel reads.
   `editor` field maps to the editor that uses this template as a seed. */
const TEMPLATES = [
  // 510(k)
  { id: 't-k510-estar',     framework: 'k510', type: 'eSTAR — full skeleton',          title: 'eSTAR § 1-20 medtech baseline (Class II)',           ver: 'v4.1',  status: 'ready', completion: 100, owner: 'JC', reviewers: ['SM'], lastEdit: '14d ago',  sections: 20, sectionsComplete: 20, uses: 38, editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-k510-se',        framework: 'k510', type: 'SE narrative — boilerplate',      title: '§11 substantial-equivalence narrative skeleton',     ver: 'v2.3',  status: 'ready', completion: 100, owner: 'JC', reviewers: ['MW'], lastEdit: '21d ago',  sections: 6,  sectionsComplete: 6,  uses: 41, editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-k510-perf',      framework: 'k510', type: 'Performance testing protocol',    title: 'Performance bench testing protocol (CGM family)',    ver: 'v1.8',  status: 'ready', completion: 100, owner: 'AK', reviewers: ['JC'], lastEdit: '34d ago',  sections: 12, sectionsComplete: 12, uses: 18, editor: 'engineering', esigRequired: false, esigState: 'na' },
  // PMA
  { id: 't-pma-module1',    framework: 'pma',  type: 'PMA Module 1 — administrative',   title: 'PMA Module 1 administrative information',            ver: 'v1.2',  status: 'ready', completion: 100, owner: 'MW', reviewers: ['JC'], lastEdit: '62d ago',  sections: 8,  sectionsComplete: 8,  uses: 6,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-pma-clinical',   framework: 'pma',  type: 'Clinical module — DSMB charter',  title: 'Pivotal trial DSMB charter (Class III implantable)', ver: 'v2.0',  status: 'ready', completion: 100, owner: 'MW', reviewers: ['JC'], lastEdit: '8d ago',   sections: 11, sectionsComplete: 11, uses: 4,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  // CER
  { id: 't-cer-art61',      framework: 'cer',  type: 'CER — Article 61 outline',        title: 'EU MDR Art. 61 clinical evaluation report skeleton', ver: 'v3.1',  status: 'ready', completion: 100, owner: 'AM', reviewers: ['JC'], lastEdit: '11d ago',  sections: 14, sectionsComplete: 14, uses: 9,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  // Engineering
  { id: 't-eng-rmf',        framework: 'eng',  type: 'Risk Management File',            title: 'ISO 14971 RMF skeleton — plan/analysis/report',      ver: 'v2.2',  status: 'ready', completion: 100, owner: 'AK', reviewers: ['JC'], lastEdit: '18d ago',  sections: 10, sectionsComplete: 10, uses: 14, editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-eng-srs',        framework: 'eng',  type: 'SRS — software',                  title: 'IEC 62304 SRS skeleton (Class C)',                   ver: 'v1.4',  status: 'ready', completion: 100, owner: 'PS', reviewers: ['AK'], lastEdit: '24d ago',  sections: 48, sectionsComplete: 48, uses: 5,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-eng-threat',     framework: 'eng',  type: 'Threat model',                    title: 'STRIDE × multi-patient-harm threat model template',  ver: 'v1.7',  status: 'ready', completion: 100, owner: 'PS', reviewers: ['AK'], lastEdit: '5d ago',   sections: 5,  sectionsComplete: 5,  uses: 7,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-eng-sbom',       framework: 'eng',  type: 'SBOM — CycloneDX',                title: 'CycloneDX 1.5 SBOM template for medtech',            ver: 'v1.2',  status: 'ready', completion: 100, owner: 'PS', reviewers: [],     lastEdit: '7d ago',   sections: 1,  sectionsComplete: 1,  uses: 11, editor: 'engineering', esigRequired: false, esigState: 'na' },
  // Labeling
  { id: 't-udi-ifu',        framework: 'udi',  type: 'IFU skeleton',                    title: 'Class II IFU template — 21 CFR 801',                 ver: 'v3.4',  status: 'ready', completion: 100, owner: 'JC', reviewers: ['SM'], lastEdit: '12d ago',  sections: 8,  sectionsComplete: 8,  uses: 22, editor: 'label',       esigRequired: false, esigState: 'na' },
  { id: 't-udi-mri',        framework: 'udi',  type: 'MRI conditional statement',       title: 'MRI conditional statement — 1.5T/3T template',       ver: 'v1.6',  status: 'ready', completion: 100, owner: 'AK', reviewers: ['JC'], lastEdit: '28d ago',  sections: 1,  sectionsComplete: 1,  uses: 18, editor: 'label',       esigRequired: false, esigState: 'na' },
  { id: 't-udi-eu-trans',   framework: 'udi',  type: 'IFU translation baseline',        title: 'EU MDR IFU — DE/FR/ES/IT/JA translation baseline',    ver: 'v2.1',  status: 'ready', completion: 100, owner: 'AM', reviewers: ['JC'], lastEdit: '34d ago',  sections: 8,  sectionsComplete: 8,  uses: 8,  editor: 'label',       esigRequired: false, esigState: 'na' },
  // Vigilance
  { id: 't-pv-mdr-3500a',   framework: 'pv',   type: 'MDR — Form 3500A',                title: 'FDA Form 3500A — 5-day / 30-day MDR template',       ver: 'v1.9',  status: 'ready', completion: 100, owner: 'JC', reviewers: ['MW'], lastEdit: '4d ago',   sections: 18, sectionsComplete: 18, uses: 12, editor: 'mdr-3500a',   esigRequired: false, esigState: 'na' },
  { id: 't-pv-eu-15d',      framework: 'pv',   type: '15-day report',                   title: 'EU MDR Art. 87 15-day serious-incident template',    ver: 'v1.4',  status: 'ready', completion: 100, owner: 'AM', reviewers: ['JC'], lastEdit: '11d ago',  sections: 22, sectionsComplete: 22, uses: 5,  editor: 'mdr-3500a',   esigRequired: false, esigState: 'na' },
  { id: 't-pv-capa',        framework: 'pv',   type: 'CAPA — 6-stage',                  title: 'CAPA workflow — open/investigate/action/verify/close',ver:'v2.0', status: 'ready', completion: 100, owner: 'JC', reviewers: [],     lastEdit: '21d ago',  sections: 6,  sectionsComplete: 6,  uses: 14, editor: 'capa',        esigRequired: false, esigState: 'na' },
  { id: 't-pv-fsca',        framework: 'pv',   type: 'FSCA / FSN',                      title: 'FSCA + Field Safety Notice paired template',         ver: 'v1.2',  status: 'ready', completion: 100, owner: 'SM', reviewers: ['JC'], lastEdit: '18d ago',  sections: 8,  sectionsComplete: 8,  uses: 3,  editor: 'fsca',        esigRequired: false, esigState: 'na' },
  { id: 't-pv-psur',        framework: 'pv',   type: 'PSUR — annual',                   title: 'EU MDR PSUR annual template — 14 sections',          ver: 'v2.4',  status: 'ready', completion: 100, owner: 'AM', reviewers: ['JC'], lastEdit: '4d ago',   sections: 14, sectionsComplete: 14, uses: 6,  editor: 'psur',        esigRequired: false, esigState: 'na' },
  // QMS
  { id: 't-qms-mr',         framework: 'qms',  type: 'Management review',               title: 'Annual management review template (ISO 13485 §5.6)',  ver: 'v1.6',  status: 'ready', completion: 100, owner: 'JC', reviewers: [],     lastEdit: '38d ago',  sections: 12, sectionsComplete: 12, uses: 4,  editor: 'engineering', esigRequired: false, esigState: 'na' },
  { id: 't-qms-supplier',   framework: 'qms',  type: 'Supplier quality agreement',      title: 'Supplier quality agreement — 21 CFR 820.50 baseline', ver: 'v1.3',  status: 'ready', completion: 100, owner: 'SM', reviewers: ['JC'], lastEdit: '18d ago',  sections: 9,  sectionsComplete: 9,  uses: 14, editor: 'engineering', esigRequired: false, esigState: 'na' },
];

window.TPL_FRAMEWORKS = TPL_FRAMEWORKS;
window.TEMPLATES = TEMPLATES;

})();
