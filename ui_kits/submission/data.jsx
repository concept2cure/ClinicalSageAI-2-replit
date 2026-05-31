(() => {
/* Submission Gateway — kit data
 * ─────────────────────────────────────────────────────────────
 * Surfaces server-side `mdx-submission-gateway.ts` (FDA ESG, EMA CESP,
 * EUDAMED, PMDA). Lands at client/src/concept2cure/submission/data/*.ts.
 * The "press send to the agency" step — end of every workflow.
 */

const SG_USER = { name: 'Jordan Chen', initials: 'JC', role: 'Enterprise · Reg Affairs' };

/* Gateways the tenant can transmit through. */
const SG_GATEWAYS = [
  { id: 'fda-esg',   label: 'FDA ESG',          region: 'United States', proto: 'AS2 · WebTrader', status: 'connected', lastAck: '2026-05-27 14:02' },
  { id: 'ema-cesp',  label: 'EMA CESP',         region: 'European Union', proto: 'CESP portal',     status: 'connected', lastAck: '2026-05-26 09:41' },
  { id: 'eu-eudamed',label: 'EUDAMED',          region: 'European Union', proto: 'EUDAMED DTX',     status: 'connected', lastAck: '2026-05-20 11:18' },
  { id: 'pmda',      label: 'PMDA Gateway',     region: 'Japan',          proto: 'PMDA Gateway',    status: 'pending',   lastAck: '—' },
  { id: 'hc-cesg',   label: 'Health Canada CESG', region: 'Canada',       proto: 'CESG',            status: 'connected', lastAck: '2026-05-15 16:30' },
];

/* In-flight + recent transmissions. */
const SG_TRANSMISSIONS = [
  { id: 'tx-2041', program: 'BX-204', docType: 'NDA',     agency: 'fda-esg',  seq: '0001', stage: 'awaiting-ack', submitted: '2026-05-28 06:12', coreId: 'C2C-NDA-212345-0001', ack: { a1: 'received', a2: 'pending', a3: 'pending' }, tone: 'warn',  note: 'ACK1 received 06:14 · ACK2 expected within 24h' },
  { id: 'tx-2038', program: 'BX-204', docType: 'MAA',     agency: 'ema-cesp', seq: '0003', stage: 'in-review',    submitted: '2026-05-26 09:38', coreId: 'EMEA-H-C-006012-0003', ack: { a1: 'received', a2: 'received', a3: 'received' }, tone: 'ok',  note: 'Day 80 LoQ clock running · validation passed' },
  { id: 'tx-2035', program: 'BX-D2',  docType: '510(k)',  agency: 'fda-esg',  seq: '0001', stage: 'accepted',     submitted: '2026-05-22 10:05', coreId: 'C2C-K243829-0001',     ack: { a1: 'received', a2: 'received', a3: 'received' }, tone: 'ok',  note: 'Accepted for substantive review · K-number pending' },
  { id: 'tx-2030', program: 'BX-301', docType: 'BLA',     agency: 'fda-esg',  seq: '0002', stage: 'validating',   submitted: null,               coreId: '—',                   ack: { a1: 'pending', a2: 'pending', a3: 'pending' }, tone: 'info', note: 'Pre-flight validation — 2 findings to clear before transmit' },
  { id: 'tx-2024', program: 'BX-099', docType: 'PSUR',    agency: 'ema-cesp', seq: '0007', stage: 'rejected',     submitted: '2026-05-18 13:20', coreId: 'EMEA-H-C-005612-0007', ack: { a1: 'received', a2: 'failed',  a3: 'n/a' },    tone: 'err',  note: 'ACK2 technical-validation failure · regional XML schema · re-transmit needed' },
];

/* Pre-flight validation findings for the validating package. */
const SG_VALIDATION = {
  packageId: 'tx-2030',
  program: 'BX-301',
  findings: [
    { sev: 'err',  rule: 'eCTD 4.0 · STF', msg: 'Study tagging file missing for CSR-301 in Module 5.3.5.1', section: 'M5 §5.3.5.1' },
    { sev: 'warn', rule: 'FDA regional',   msg: 'us-regional.xml application-number checksum mismatch',      section: 'M1 §1.1' },
    { sev: 'ok',   rule: 'Hyperlinks',     msg: '1,284 cross-document links resolved',                       section: '—' },
    { sev: 'ok',   rule: 'PDF/A',          msg: 'All 412 documents PDF/A-1b compliant',                      section: '—' },
    { sev: 'ok',   rule: 'Checksums',      msg: 'MD5 manifest complete · 412/412',                           section: '—' },
  ],
};

/* AnA suggestions scoped to the submission surface. */
const SG_SUGGESTIONS = [
  'Clear the 2 validation findings on the BX-301 BLA before transmit',
  'Why did the BX-099 PSUR ACK2 fail, and how do I fix the schema?',
  'Status of every in-flight transmission across agencies',
  'Re-transmit the rejected BX-099 PSUR after the schema fix',
];

window.SG_USER         = SG_USER;
window.SG_GATEWAYS     = SG_GATEWAYS;
window.SG_TRANSMISSIONS= SG_TRANSMISSIONS;
window.SG_VALIDATION   = SG_VALIDATION;
window.SG_SUGGESTIONS  = SG_SUGGESTIONS;

})();
