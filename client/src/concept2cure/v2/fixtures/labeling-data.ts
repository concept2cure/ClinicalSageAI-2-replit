/* Labeling fixture data — ported from kit specialist-data.jsx (window globals).
   Types match the mdx-labeling.ts backend shape described in the kit comments. */

export interface LabelSection {
  s: string;
  status: string;
  blocker?: boolean;
}

export interface LabelCheck {
  k: string;
  v: string;
  tone: string;
}

export interface LabelSymbol {
  ref: string;
  name: string;
  status: string;
  blocker?: boolean;
}

export interface LabelUdi {
  di: string;
  issuing: string;
  carrier: string;
  pi: string[];
  placements: { loc: string; done: boolean }[];
}

export interface LabelWarning {
  w: string;
  hz: string;
  src: string;
  placed: boolean;
  blocker?: boolean;
}

export interface LabelDoc {
  device: string;
  kind: string;
  version: string;
  status: string;
  region: string;
  udiDi: string;
  effectiveDate: string;
}

export interface LabelEnums {
  kind: [string, string][];
  docStatus: [string, string][];
  method: [string, string][];
  transStatus: [string, string][];
}

export interface LabelTranslation {
  id: string;
  language: string;
  name: string;
  method: string;
  btv: boolean;
  status: string;
  _new?: boolean;
}

export const LABEL_SECTIONS: LabelSection[] = [
  { s: 'Intended use / indications', status: 'approved' },
  { s: 'Warnings and precautions', status: 'review' },
  { s: 'Instructions for use (IFU)', status: 'draft' },
  { s: 'MRI-conditional statement', status: 'draft', blocker: true },
  { s: 'Symbols glossary (ISO 15223-1)', status: 'approved' },
  { s: 'UDI placement', status: 'approved' },
];

export const LABEL_CHECKS: LabelCheck[] = [
  { k: 'Reading level <= grade 8', v: 'Grade 7.4', tone: 'ok' },
  { k: '24 EU languages', v: '21 / 24 complete', tone: 'warn' },
  { k: 'Symbol legends match ISO 15223-1', v: 'Conforms', tone: 'ok' },
  { k: 'eIFU URL resolves', v: '200 OK', tone: 'ok' },
];

export const LABEL_SYMBOLS: LabelSymbol[] = [
  { ref: '5.1.1', name: 'Manufacturer', status: 'placed' },
  { ref: '5.1.3', name: 'Date of manufacture', status: 'placed' },
  { ref: '5.1.4', name: 'Use-by date', status: 'placed' },
  { ref: '5.1.5', name: 'Batch code', status: 'placed' },
  { ref: '5.1.6', name: 'Catalogue number', status: 'placed' },
  { ref: '5.3.7', name: 'Temperature limit', status: 'placed' },
  { ref: '5.4.3', name: 'Consult IFU', status: 'placed' },
  { ref: '5.4.4', name: 'Caution', status: 'placed' },
  { ref: '5.2.8', name: 'Do not use if package damaged', status: 'needed' },
  { ref: '5.4.5', name: 'MR Conditional (ASTM F2503)', status: 'needed', blocker: true },
  { ref: 'UDI', name: 'Unique Device Identifier', status: 'placed' },
  { ref: 'MD', name: 'Medical device', status: 'placed' },
  { ref: 'CE', name: 'CE mark / NB 0123', status: 'review' },
  { ref: 'Rx', name: 'Prescription use only (US)', status: 'placed' },
];

export const LABEL_UDI: LabelUdi = {
  di: '00860001234567',
  issuing: 'GS1',
  carrier: 'Linear (GS1-128) + 2D (GS1 DataMatrix)',
  pi: ['(11) Manufacture date', '(17) Expiry', '(10) Lot/batch'],
  placements: [
    { loc: 'Primary label', done: true },
    { loc: 'Shelf carton', done: true },
    { loc: 'GUDID record (eIFU)', done: true },
    { loc: 'Direct mark on reusable applicator', done: false },
  ],
};

export const LABEL_WARNINGS: LabelWarning[] = [
  { w: 'Do not make therapy decisions on a single reading when symptoms do not match.', hz: 'HZ-01', src: 'Inaccurate reading — insulin mis-dosing', placed: true },
  { w: 'Confirm sensor adhesion daily; replace if the edge lifts.', hz: 'HZ-02', src: 'Adhesive failure — loss of monitoring', placed: true },
  { w: 'MR Unsafe — remove the sensor before entering the MRI suite.', hz: 'HZ-04', src: 'MR interaction / biocompat/heating eval open', placed: false, blocker: true },
  { w: 'Not for use as the sole basis of care in critically ill patients.', hz: 'HZ-03', src: 'Off-label population', placed: true },
];

export const LABEL_DOC: LabelDoc = {
  device: 'Aurora CGM',
  kind: 'ifu',
  version: '3.2',
  status: 'review',
  region: 'global',
  udiDi: '00860001234567',
  effectiveDate: '2027-01-15',
};

export const LABEL_ENUMS: LabelEnums = {
  kind: [
    ['ifu', 'Instructions for use'],
    ['package_insert', 'Package insert'],
    ['patient_label', 'Patient label'],
    ['operator_manual', 'Operator manual'],
    ['service_manual', 'Service manual'],
    ['quick_ref', 'Quick reference'],
    ['box_label', 'Box label'],
  ],
  docStatus: [
    ['draft', 'Draft'],
    ['review', 'In review'],
    ['approved', 'Approved'],
    ['effective', 'Effective'],
    ['superseded', 'Superseded'],
  ],
  method: [
    ['human', 'Human'],
    ['mt_postedited', 'MT + post-edit'],
    ['machine', 'Machine'],
  ],
  transStatus: [
    ['pending', 'Pending'],
    ['in_progress', 'In progress'],
    ['review', 'In review'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ],
};

export const LABEL_TRANSLATIONS: LabelTranslation[] = [
  { id: 'TR-en', language: 'en', name: 'English (source)', method: 'human', btv: true, status: 'approved' },
  { id: 'TR-de', language: 'de', name: 'German', method: 'human', btv: true, status: 'approved' },
  { id: 'TR-fr', language: 'fr', name: 'French', method: 'human', btv: true, status: 'approved' },
  { id: 'TR-es', language: 'es', name: 'Spanish', method: 'mt_postedited', btv: true, status: 'approved' },
  { id: 'TR-it', language: 'it', name: 'Italian', method: 'mt_postedited', btv: true, status: 'approved' },
  { id: 'TR-nl', language: 'nl', name: 'Dutch', method: 'mt_postedited', btv: false, status: 'review' },
  { id: 'TR-pl', language: 'pl', name: 'Polish', method: 'machine', btv: false, status: 'in_progress' },
  { id: 'TR-el', language: 'el', name: 'Greek', method: 'machine', btv: false, status: 'pending' },
];

/** Status string to chip tone (shared across specialist surfaces). */
export const STATUS_TONE: Record<string, string> = {
  approved: 'ok', review: 'warn', draft: 'idle', sealed: 'ok',
  pending: 'idle', complete: 'ok', running: 'ai', queued: 'idle', submitted: 'ok',
};
