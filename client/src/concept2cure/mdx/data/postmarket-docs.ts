/**
 * Documents the Post-market vigilance surface produces.
 *
 * Every signal eventually rolls up to a regulatory submission: an MDR
 * (FDA 21 CFR 803 Form 3500A), a 15-day report (EU MDR Art. 87), an FSCA
 * record, an FSN (field-safety notice) for clinicians, a CAPA record
 * (root cause → action → verification), and the periodic safety update
 * reports (PSUR for EU MDR, PMSR for non-EU).
 *
 * Wire shape: GET /api/mdx/postmarket/documents
 */

export const PV_DOC_FRAMEWORKS = [
  { id: 'mdr-fda',  label: '21 CFR 803',    desc: 'FDA Medical Device Reporting' },
  { id: 'mdr-eu',   label: 'EU MDR Art. 87',desc: 'Serious incident reporting' },
  { id: 'capa',     label: '820.100 · ISO 13485 §8.5.2/8.5.3', desc: 'CAPA / corrective and preventive action' },
  { id: 'fsca',     label: 'FSCA / FSN',    desc: 'Field safety corrective action' },
  { id: 'psur',     label: 'EU MDR PSUR',   desc: 'Periodic safety update' },
];

/*
 * `PV_DOCUMENTS` — removed.
 *
 * These were example regulatory documents, and several asserted
 * `esigState: 'signed'` with a named signer and a date: an electronic
 * signature that never happened. PostmarketSurface no longer has a document
 * panel fed from here — it renders an honest empty state until the
 * live endpoint returns rows.
 *
 * The frameworks above stay: they are the real published taxonomy,
 * not an assessment of anything.
 */
