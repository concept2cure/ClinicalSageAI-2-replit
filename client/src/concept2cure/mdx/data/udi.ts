/**
 * UDI and labeling surface data — GUDID registry, label artifacts,
 * symbol glossary (ISO 15223-1), MRI conditional matrix.
 *
 * UDI = Unique Device Identifier. UDI-DI = device identifier (the static
 * part). UDI-PI = production identifier (lot / serial / mfg-date). GUDID
 * is the FDA's Global UDI Database. EUDAMED is the EU equivalent.
 */

export const UDI_AGENCIES = [
  { id: 'gs1',    label: 'GS1',     country: 'global',    fmt: '(01)' },
  { id: 'hibcc',  label: 'HIBCC',   country: 'global',    fmt: '+H' },
  { id: 'iccbba', label: 'ICCBBA',  country: 'global',    fmt: '=' },
];

/* Each device record holds the UDI-DI per region plus GUDID/EUDAMED status. */
export const UDI_DEVICES = [
  {
    id: 'bx204-01',
    code: 'BX-204',
    name: 'Continuous Glucose Monitor — sensor + transmitter',
    class: 'Class II',
    fda: { di: '00860001234567', gmdn: '47155',  agency: 'gs1',  status: 'published',    submitted: '2025-12-04', acked: '2025-12-06' },
    eu:  { di: '00860001234567', risk: 'IIa',     agency: 'gs1',  status: 'published',    submitted: '2025-12-08', acked: '2025-12-11' },
    mri: 'conditional',
    rx:  'rx-only',
    sterile: false,
    singleUse: false,
    labels: 4,
    translations: 12,
    open: 0,
  },
  {
    id: 'bx204-02',
    code: 'BX-204',
    name: 'Continuous Glucose Monitor — receiver',
    class: 'Class II',
    fda: { di: '00860001234574', gmdn: '47155',  agency: 'gs1',  status: 'published',    submitted: '2025-12-04', acked: '2025-12-06' },
    eu:  { di: '00860001234574', risk: 'IIa',     agency: 'gs1',  status: 'draft',        submitted: '—',          acked: '—'           },
    mri: 'unsafe',
    rx:  'rx-only',
    sterile: false,
    singleUse: false,
    labels: 3,
    translations: 12,
    open: 1,
  },
  {
    id: 'or801-01',
    code: 'OR-801',
    name: 'Bone screw, cortical 3.5 mm × 24 mm',
    class: 'Class II',
    fda: { di: '00860004567812', gmdn: '60571',  agency: 'gs1',  status: 'in-review',    submitted: '2026-04-22', acked: '—'           },
    eu:  { di: '00860004567812', risk: 'IIb',     agency: 'gs1',  status: 'not-started',  submitted: '—',          acked: '—'           },
    mri: 'conditional',
    rx:  'rx-only',
    sterile: true,
    singleUse: true,
    labels: 6,
    translations: 18,
    open: 2,
  },
  {
    id: 'cv330-01',
    code: 'CV-330',
    name: 'Implantable cardiac monitor',
    class: 'Class III',
    fda: { di: '00860007890123', gmdn: '35379',  agency: 'gs1',  status: 'pending',      submitted: '—',          acked: '—'           },
    eu:  { di: '00860007890123', risk: 'III',     agency: 'gs1',  status: 'not-started',  submitted: '—',          acked: '—'           },
    mri: 'conditional',
    rx:  'rx-only',
    sterile: true,
    singleUse: true,
    labels: 7,
    translations: 23,
    open: 4,
  },
  {
    id: 'pm660-01',
    code: 'PM-660',
    name: 'Patient monitor — software accessory',
    class: 'Class II',
    fda: { di: '00860009990125', gmdn: '63858',  agency: 'gs1',  status: 'published',    submitted: '2025-09-18', acked: '2025-09-21' },
    eu:  { di: '00860009990125', risk: 'IIa',     agency: 'gs1',  status: 'published',    submitted: '2025-10-02', acked: '2025-10-05' },
    mri: 'na',
    rx:  'rx-only',
    sterile: false,
    singleUse: false,
    labels: 2,
    translations: 24,
    open: 0,
  },
];

/* Label artifacts — every printed or on-device piece of text/imagery. */
export const UDI_LABELS = [
  { id: 'L-bx204-pkg-en', device: 'BX-204', kind: 'package',  region: 'US',  lang: 'en', ver: 'v3.2',  size: '105×148',  status: 'approved', updated: '6d ago' },
  { id: 'L-bx204-ifu-en', device: 'BX-204', kind: 'IFU',      region: 'US',  lang: 'en', ver: 'v2.7',  size: '8.5×11',   status: 'approved', updated: '6d ago' },
  { id: 'L-bx204-dev-en', device: 'BX-204', kind: 'device',   region: 'US',  lang: 'en', ver: 'v1.0',  size: '32×22',    status: 'approved', updated: '6d ago' },
  { id: 'L-bx204-pkg-de', device: 'BX-204', kind: 'package',  region: 'EU',  lang: 'de', ver: 'v3.2',  size: '105×148',  status: 'in-review',updated: '2d ago' },
  { id: 'L-bx204-ifu-de', device: 'BX-204', kind: 'IFU',      region: 'EU',  lang: 'de', ver: 'v2.7',  size: 'A4',       status: 'in-review',updated: '2d ago' },
  { id: 'L-bx204-pkg-fr', device: 'BX-204', kind: 'package',  region: 'EU',  lang: 'fr', ver: 'v3.2',  size: '105×148',  status: 'draft',    updated: '14h ago' },
  { id: 'L-or801-pkg-en', device: 'OR-801', kind: 'package',  region: 'US',  lang: 'en', ver: 'v1.1',  size: '70×50',    status: 'in-review',updated: '1d ago' },
  { id: 'L-or801-ifu-en', device: 'OR-801', kind: 'IFU',      region: 'US',  lang: 'en', ver: 'v1.1',  size: '8.5×11',   status: 'draft',    updated: '4h ago' },
];

/* ISO 15223-1 symbols — checked against each label automatically. */
export const UDI_SYMBOLS = [
  { iso: '5.1.1',  name: 'Manufacturer',                glyph: 'factory',  required: 'always',     present: true },
  { iso: '5.1.6',  name: 'Catalog number',              glyph: 'ref',      required: 'always',     present: true },
  { iso: '5.1.7',  name: 'Lot number',                  glyph: 'lot',      required: 'always',     present: true },
  { iso: '5.1.5',  name: 'Date of manufacture',         glyph: 'mfg-date', required: 'always',     present: true },
  { iso: '5.1.4',  name: 'Use-by date',                 glyph: 'expiry',   required: 'sterile',    present: true },
  { iso: '5.2.6',  name: 'Sterilized using ethylene oxide', glyph: 'eo',   required: 'sterile-eo', present: true },
  { iso: '5.4.2',  name: 'Do not re-use',               glyph: 'no-reuse', required: 'single-use', present: true },
  { iso: '5.4.3',  name: 'Caution',                     glyph: 'caution',  required: 'always',     present: true },
  { iso: '5.4.4',  name: 'Consult IFU',                 glyph: 'ifu',      required: 'always',     present: false },
  { iso: '5.7.7',  name: 'MR conditional',              glyph: 'mr-cond',  required: 'mr-cond',    present: true },
  { iso: '5.7.8',  name: 'MR unsafe',                   glyph: 'mr-unsafe',required: 'mr-unsafe',  present: false },
];

/* Open labeling issues — symbol failures, translation mismatches, MRI
   statement gaps. */
export const UDI_ISSUES = [
  { id: 'LBL-0312', label: 'L-bx204-pkg-de', kind: 'symbol',      severity: 'err',  msg: 'ISO 15223-1 §5.4.4 (Consult IFU) — symbol missing from package label v3.2',                  since: '2d ago' },
  { id: 'LBL-0309', label: 'L-or801-ifu-en', kind: 'translation', severity: 'warn', msg: 'IFU v1.1 contains "consult instructions" in English only — needs DE/FR/ES/IT for EU release', since: '4h ago' },
  { id: 'LBL-0303', label: 'L-cv330-pkg-en', kind: 'mri',         severity: 'err',  msg: 'MRI-conditional statement does not include 3 T field-strength clause',                       since: '6d ago' },
  { id: 'LBL-0298', label: 'L-bx204-dev-en', kind: 'udi',         severity: 'warn', msg: 'Device label UDI-DI checksum digit mismatch (calculated 7, printed 4)',                     since: '11d ago' },
];

/* MRI conditional matrix — per-device field-strength / SAR / gradient limits. */
export const UDI_MRI = [
  { device: 'BX-204', mode: 'conditional', field: '1.5 T, 3 T', sar: '≤ 2 W/kg', gradient: '≤ 200 T/m/s', tested: true,  notes: 'Whole-body coil only' },
  { device: 'OR-801', mode: 'conditional', field: '1.5 T, 3 T', sar: '≤ 4 W/kg', gradient: '≤ 720 T/m/s', tested: true,  notes: 'Static after osseointegration' },
  { device: 'CV-330', mode: 'conditional', field: '1.5 T',      sar: '≤ 2 W/kg', gradient: '≤ 200 T/m/s', tested: true,  notes: 'Per ASTM F2503' },
  { device: 'PM-660', mode: 'na',          field: '—',          sar: '—',         gradient: '—',          tested: false, notes: 'Software accessory, no MRI exposure' },
];


// Window globals (kit harness only — codebase uses ESM imports)
