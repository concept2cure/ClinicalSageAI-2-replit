/**
 * Documents the UDI / labeling surface produces.
 *
 * Labels are *the* document type here — IFU, package insert, on-device,
 * patient labeling — one per device × region × language. Plus the GUDID
 * submission file, EUDAMED submission file, UDI Master Record, MRI
 * conditional statement, and labeling change records.
 *
 * Wire shape: GET /api/mdx/udi/documents
 */

export const UDI_DOC_FRAMEWORKS = [
  { id: 'fda',    label: '21 CFR 801', desc: 'FDA labeling rules' },
  { id: 'iso',    label: 'ISO 15223-1',desc: 'Medical-device symbols' },
  { id: 'eu',     label: 'EU MDR',     desc: 'Annex I — labels + IFU' },
  { id: 'mri',    label: 'ASTM F2503', desc: 'MRI safety labeling' },
];

/*
 * `UDI_DOCUMENTS` — removed.
 *
 * These were example regulatory documents, and several asserted
 * `esigState: 'signed'` with a named signer and a date: an electronic
 * signature that never happened. UdiSurface no longer has a document
 * panel fed from here — it renders an honest empty state until the
 * live endpoint returns rows.
 *
 * The frameworks above stay: they are the real published taxonomy,
 * not an assessment of anything.
 */
