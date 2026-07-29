(() => {
/* ISO 14971 Risk Management — kit data
 * ─────────────────────────────────────────────────────────────
 * Surfaces server-side `mdx-risk-management.ts` (risk-items, controls,
 * risk-summary/:program sev×prob matrix). Core MDR / 510(k) deliverable.
 * Lands at client/src/concept2cure/mdx/data/risk.ts. */

/* ISO 14971 severity (1–5) and probability (1–5) scales. */
const RM_SEVERITY = [
  { id: 5, label: 'Catastrophic', desc: 'Death' },
  { id: 4, label: 'Critical',     desc: 'Permanent impairment / life-threatening' },
  { id: 3, label: 'Serious',      desc: 'Injury requiring intervention' },
  { id: 2, label: 'Minor',        desc: 'Temporary injury, no intervention' },
  { id: 1, label: 'Negligible',   desc: 'Inconvenience' },
];
const RM_PROBABILITY = [
  { id: 1, label: 'Improbable' },
  { id: 2, label: 'Remote' },
  { id: 3, label: 'Occasional' },
  { id: 4, label: 'Probable' },
  { id: 5, label: 'Frequent' },
];

/* Acceptability bands per (sev×prob) score. Org policy — lives in c2c_risk_policy. */
function rmBand(sev, prob) {
  const s = sev * prob;
  if (s >= 15) return 'unacceptable';
  if (s >= 8)  return 'alarp';        // as low as reasonably practicable
  return 'acceptable';
}

/* Risk items — hazard → hazardous situation → harm, with pre/post control. */
const RM_ITEMS = [
  { id: 'RK-001', hazard: 'Lead dislodgement', situation: 'Sensing lead detaches during ambulatory use', harm: 'Missed arrhythmia detection', preS: 4, preP: 3, postS: 4, postP: 2, status: 'controlled', owner: 'MW', controls: 2 },
  { id: 'RK-002', hazard: 'Li-ion thermal event', situation: 'Battery overheats during charging', harm: 'Burn injury', preS: 4, preP: 2, postS: 4, postP: 1, status: 'controlled', owner: 'RN', controls: 3 },
  { id: 'RK-003', hazard: 'Algorithm false-negative', situation: 'On-device detection misses AF episode', harm: 'Delayed clinical intervention', preS: 5, preP: 3, postS: 5, postP: 2, status: 'open', owner: 'AM', controls: 1 },
  { id: 'RK-004', hazard: 'Skin sensitization', situation: 'Adhesive contact dermatitis', harm: 'Local skin reaction', preS: 2, preP: 4, postS: 2, postP: 2, status: 'controlled', owner: 'SM', controls: 2 },
  { id: 'RK-005', hazard: 'Cybersecurity breach', situation: 'Unauthorized firmware access via BLE', harm: 'Data integrity / patient privacy', preS: 3, preP: 3, postS: 3, postP: 1, status: 'controlled', owner: 'AM', controls: 4 },
  { id: 'RK-006', hazard: 'MRI exposure', situation: 'Device worn into MR environment', harm: 'Device heating / image artifact', preS: 3, preP: 2, postS: 3, postP: 1, status: 'controlled', owner: 'MW', controls: 1 },
  { id: 'RK-007', hazard: 'Data transmission loss', situation: 'Cloud sync fails silently', harm: 'Missed remote review', preS: 3, preP: 4, postS: 3, postP: 3, status: 'open', owner: 'RN', controls: 1 },
];

/* Risk controls — ISO 14971 §7 hierarchy: inherent safety > protective > information. */
const RM_CONTROLS = [
  { id: 'RC-001', item: 'RK-001', type: 'Protective measure', desc: 'Lead-off detection with audible + app alert', verified: true,  evidence: 'Bench BP-D2-014' },
  { id: 'RC-002', item: 'RK-001', type: 'Information',         desc: 'IFU instructs daily electrode check', verified: true,  evidence: 'IFU §4.2' },
  { id: 'RC-003', item: 'RK-003', type: 'Inherent safety',    desc: 'Dual-algorithm consensus before suppressing alert', verified: false, evidence: 'Pending V&V VT-211' },
  { id: 'RC-004', item: 'RK-007', type: 'Protective measure', desc: 'Sync-failure watchdog escalates after 2 missed cycles', verified: false, evidence: 'Pending SW test ST-088' },
];

const RM_SUGGESTIONS = [
  'Re-score every risk after the dual-algorithm control verifies',
  'Which risks are still unacceptable or ALARP after controls?',
  'Draft the risk-benefit conclusion for the BX-D2 CER',
  'Show every control still pending verification',
];

window.RM_SEVERITY    = RM_SEVERITY;
window.RM_PROBABILITY = RM_PROBABILITY;
window.RM_ITEMS       = RM_ITEMS;
window.RM_CONTROLS    = RM_CONTROLS;
window.RM_SUGGESTIONS = RM_SUGGESTIONS;
window.rmBand         = rmBand;

})();
