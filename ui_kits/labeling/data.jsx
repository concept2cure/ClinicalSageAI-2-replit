(() => {
/* Labeling / IFU — kit data. Surfaces server/routes/mdx-labeling.ts.
 * doc kinds: ifu, package_insert, patient_label, operator_manual, service_manual, quick_ref, box_label
 * tables: labeling_documents, labeling_translations, labeling_symbols.
 * coverage endpoint: /labeling/:id/coverage. */

const LB_DOC_KIND = {
  ifu: 'IFU', package_insert: 'Package insert', patient_label: 'Patient label',
  operator_manual: 'Operator manual', service_manual: 'Service manual', quick_ref: 'Quick reference', box_label: 'Box label',
};

const LB_DOCS = [
  { id: 'd1', kind: 'ifu',            title: 'BX-D2 Instructions for Use', status: 'review',    version: 'v3.1', langs: 14, langsApproved: 9,  symbols: 12, updated: '2h ago' },
  { id: 'd2', kind: 'patient_label',  title: 'BX-D2 patient label',        status: 'approved',  version: 'v2.0', langs: 14, langsApproved: 14, symbols: 6,  updated: '3d ago' },
  { id: 'd3', kind: 'box_label',      title: 'BX-D2 carton / box label',   status: 'effective', version: 'v2.0', langs: 14, langsApproved: 14, symbols: 9,  updated: '1w ago' },
  { id: 'd4', kind: 'operator_manual',title: 'BX-D2 clinician manual',     status: 'draft',     version: 'v0.4', langs: 3,  langsApproved: 0,  symbols: 12, updated: '5h ago' },
];

/* Active doc (IFU) detail — translations + ISO 15223-1 symbols. */
const LB_TRANSLATIONS = [
  { language: 'German (DE)',     status: 'approved', method: 'human',        btv: true },
  { language: 'French (FR)',     status: 'approved', method: 'human',        btv: true },
  { language: 'Japanese (JA)',   status: 'review',   method: 'mt_postedited',btv: false },
  { language: 'Spanish (ES)',    status: 'approved', method: 'human',        btv: true },
  { language: 'Italian (IT)',    status: 'pending',  method: 'machine',      btv: false },
  { language: 'Mandarin (ZH)',   status: 'review',   method: 'mt_postedited',btv: false },
];

const LB_SYMBOLS = [
  { code: '5.1.1',  name: 'Manufacturer',                 required: 'ISO 15223-1' },
  { code: '5.1.3',  name: 'Date of manufacture',          required: 'ISO 15223-1' },
  { code: '5.2.8',  name: 'Do not use if package damaged', required: 'ISO 15223-1' },
  { code: '5.4.3',  name: 'Consult instructions for use', required: 'ISO 15223-1' },
  { code: '5.4.4',  name: 'Caution',                      required: 'ISO 15223-1' },
  { code: 'MR',     name: 'MR Conditional',               required: 'ASTM F2503' },
];

const LB_SUGGESTIONS = [
  'Which IFU translations are blocking the EU launch?',
  'Check the symbol set against ISO 15223-1 for the box label',
  'Draft the MRI-conditional statement for the patient label',
  'Reconcile the IFU against the cleared indications for use',
];

Object.assign(window, { LB_DOC_KIND, LB_DOCS, LB_TRANSLATIONS, LB_SYMBOLS, LB_SUGGESTIONS });
})();
