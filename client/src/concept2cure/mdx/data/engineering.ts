/**
 * Engineering surface data — DHF (Design History File), Design Controls
 * Traceability (21 CFR 820.30), and ISO 14971 risk records.
 *
 * Per-program. Real wiring shape Claude Code mirrors: see contract notes in
 * HANDOFF.md > Phase 4 · Device engineering.
 */

/* DHF section completeness — the 9 deliverables FDA expects every device
   to be able to produce on demand. Source: 21 CFR 820.30 + GHTF SG3
   guidance. Status vocabulary aligns with the kit's section status pill:
   draft · review · ready · blocked. */
export const ENG_DHF = [
  { id: 'plan',   num: '01', label: 'Design and development plan', ver: 'v2.1',  owner: 'JC', updated: '4d ago',  status: 'ready',   meta: '12 milestones · 8 met' },
  { id: 'input',  num: '02', label: 'Design inputs',               ver: 'v1.7',  owner: 'AK', updated: '2d ago',  status: 'ready',   meta: '142 requirements · 12 user needs' },
  { id: 'output', num: '03', label: 'Design outputs',              ver: 'v1.4',  owner: 'AK', updated: '1d ago',  status: 'review',  meta: '218 outputs · 11 unresolved comments' },
  { id: 'review', num: '04', label: 'Design reviews',              ver: 'v1.2',  owner: 'JC', updated: '6d ago',  status: 'ready',   meta: '5 of 5 phase gates signed' },
  { id: 'verif',  num: '05', label: 'Design verification',         ver: 'v1.9',  owner: 'LT', updated: '12h ago', status: 'review',  meta: '94 protocols · 87 executed · 3 deviations' },
  { id: 'valid',  num: '06', label: 'Design validation',           ver: 'v0.8',  owner: 'JC', updated: '4d ago',  status: 'draft',   meta: 'Human-factors summative pending' },
  { id: 'trans',  num: '07', label: 'Design transfer',             ver: 'v0.4',  owner: 'SM', updated: '11d ago', status: 'draft',   meta: 'Awaiting MFG site readiness' },
  { id: 'change', num: '08', label: 'Design changes',              ver: 'v1.1',  owner: 'AK', updated: '8h ago',  status: 'ready',   meta: '34 ECRs · 27 closed · 7 open' },
  { id: 'trace',  num: '09', label: 'Design history file index',   ver: 'v1.0',  owner: 'JC', updated: 'today',   status: 'ready',   meta: 'Auto-compiled from above' },
];

/* Design controls traceability — every user need traces to a design input
   to a design output to a verification to a validation. This is the spine
   of every device submission and FDA inspectors trace it line-by-line. */
export const ENG_TRACE = [
  { id: 'UN-001', need: 'Clinician can attach sensor in <60s',                 input: 'DI-018  Adhesive seal-time spec',          output: 'DO-022  Adhesive Rev D',         verif: 'VER-014 Bench peel',     valid: 'VAL-003 HF summative', risk: 'R-018', state: 'verified' },
  { id: 'UN-002', need: 'Glucose reading within ±10 mg/dL of YSI reference',   input: 'DI-041  Accuracy MARD ≤9%',                output: 'DO-052  Algorithm v3.2',         verif: 'VER-027 In-vitro',       valid: 'VAL-009 Pivotal',       risk: 'R-024', state: 'verified' },
  { id: 'UN-003', need: 'Battery lasts 14 days continuous use',                input: 'DI-052  Power budget 28 mAh/day',          output: 'DO-061  PCBA Rev F',             verif: 'VER-038 Shelf life',     valid: 'VAL-012 14-day wear',   risk: 'R-031', state: 'verified' },
  { id: 'UN-004', need: 'Device survives 1.2 m drop on hard surface',          input: 'DI-067  IEC 60068-2-32 §1.2 m',            output: 'DO-074  Enclosure Rev C',        verif: 'VER-045 Drop',           valid: '—',                     risk: 'R-052', state: 'verified' },
  { id: 'UN-005', need: 'Cybersec — no PHI exposed over BLE',                  input: 'DI-088  AES-128-GCM, ECDHE handshake',     output: 'DO-091  Firmware 4.1.2',         verif: 'VER-061 Pen test',       valid: '—',                     risk: 'R-061', state: 'in-progress' },
  { id: 'UN-006', need: 'False-low alarm rate <1 per week',                    input: 'DI-094  Alarm threshold logic',            output: 'DO-103  Algorithm v3.2',         verif: 'VER-066 Sim corpus',     valid: 'VAL-009 Pivotal',       risk: 'R-071', state: 'open' },
  { id: 'UN-007', need: 'Sensor compatible with ISO 10993 (skin contact)',     input: 'DI-101  Biocompatibility plan',            output: 'DO-118  Adhesive Rev D',         verif: 'VER-074 ISO 10993-10',   valid: '—',                     risk: 'R-082', state: 'in-progress' },
  { id: 'UN-008', need: 'Display readable at 6 m in sunlight',                 input: 'DI-116  Luminance ≥ 400 nit',              output: 'DO-129  OLED panel',             verif: 'VER-082 Photometry',     valid: 'VAL-015 HF formative',  risk: 'R-094', state: 'open' },
];

/* ISO 14971 risk records — hazard × hazardous situation × harm with P1 × P2
   probabilities and severity. The matrix is the heart of the surface.
   Severity is the FDA standard 5-level scale; P1/P2 are 5-level. */
export const ENG_RISK_SEVERITY = [
  { id: 'S1', label: 'Negligible' },
  { id: 'S2', label: 'Minor' },
  { id: 'S3', label: 'Serious' },
  { id: 'S4', label: 'Critical' },
  { id: 'S5', label: 'Catastrophic' },
];
export const ENG_RISK_PROB = [
  { id: 'P1', label: 'Improbable'  },
  { id: 'P2', label: 'Remote'      },
  { id: 'P3', label: 'Occasional'  },
  { id: 'P4', label: 'Probable'    },
  { id: 'P5', label: 'Frequent'    },
];
/* Acceptability lookup keyed by `${sev}${prob}` — encodes the org's risk
   policy. Three bands: acceptable (green) · ALARP (amber, requires
   benefit-risk justification) · unacceptable (red, blocks release). */
export const ENG_RISK_ACCEPT = {
  'S1P1':'ok','S1P2':'ok','S1P3':'ok','S1P4':'ok','S1P5':'alarp',
  'S2P1':'ok','S2P2':'ok','S2P3':'alarp','S2P4':'alarp','S2P5':'unacceptable',
  'S3P1':'ok','S3P2':'alarp','S3P3':'alarp','S3P4':'unacceptable','S3P5':'unacceptable',
  'S4P1':'alarp','S4P2':'alarp','S4P3':'unacceptable','S4P4':'unacceptable','S4P5':'unacceptable',
  'S5P1':'alarp','S5P2':'unacceptable','S5P3':'unacceptable','S5P4':'unacceptable','S5P5':'unacceptable',
};
export const ENG_RISKS = [
  { id: 'R-018', hazard: 'Adhesive failure', situation: 'Sensor lifts during exercise; missed glucose reading at critical moment', harm: 'Hypo-/hyperglycemia event undetected', severity: 'S3', probBefore: 'P3', controlClass: 'design', control: 'Adhesive Rev D — 14-day wear validated', verif: 'VER-014 + VAL-003', probAfter: 'P2', residual: 'S3P2', state: 'verified', owner: 'AK' },
  { id: 'R-024', hazard: 'Algorithm bias',  situation: 'Reading underestimates true glucose during rapid drop', harm: 'Failure to treat hypoglycemia', severity: 'S4', probBefore: 'P3', controlClass: 'design', control: 'Algorithm v3.2 rate-of-change compensation', verif: 'VER-027 + VAL-009', probAfter: 'P1', residual: 'S4P1', state: 'verified', owner: 'JC' },
  { id: 'R-031', hazard: 'Battery depletion', situation: 'Device fails before scheduled replacement; user unaware', harm: 'Loss of continuous monitoring', severity: 'S3', probBefore: 'P3', controlClass: 'information', control: 'Low-battery alert + IFU warning', verif: 'VER-038', probAfter: 'P2', residual: 'S3P2', state: 'verified', owner: 'LT' },
  { id: 'R-052', hazard: 'Enclosure crack', situation: 'Drop causes shard exposure', harm: 'Skin laceration', severity: 'S2', probBefore: 'P2', controlClass: 'design', control: 'Polycarbonate enclosure, validated to 1.2 m drop', verif: 'VER-045', probAfter: 'P1', residual: 'S2P1', state: 'verified', owner: 'AK' },
  { id: 'R-061', hazard: 'BLE PHI exposure', situation: 'Adversary intercepts unencrypted transmission', harm: 'Patient privacy breach', severity: 'S4', probBefore: 'P3', controlClass: 'design', control: 'AES-128-GCM, ECDHE handshake', verif: 'VER-061 pen test', probAfter: 'P1', residual: 'S4P1', state: 'in-progress', owner: 'PS' },
  { id: 'R-071', hazard: 'False-low alarm storm', situation: 'Algorithm noise triggers repeated alarms; user disables', harm: 'Real hypoglycemia missed', severity: 'S4', probBefore: 'P4', controlClass: 'design', control: 'Hysteresis + dwell-time gating', verif: 'VER-066', probAfter: 'P2', residual: 'S4P2', state: 'open', owner: 'JC' },
  { id: 'R-082', hazard: 'Skin sensitization', situation: 'Adhesive triggers Type IV hypersensitivity', harm: 'Contact dermatitis', severity: 'S2', probBefore: 'P3', controlClass: 'design', control: 'ISO 10993-10 sensitization passed', verif: 'VER-074', probAfter: 'P2', residual: 'S2P2', state: 'in-progress', owner: 'LT' },
  { id: 'R-094', hazard: 'Sunlight readability', situation: 'User cannot read display at distance', harm: 'Missed alert', severity: 'S2', probBefore: 'P3', controlClass: 'design', control: '400-nit OLED + auto-brightness', verif: 'VER-082', probAfter: 'P2', residual: 'S2P2', state: 'open', owner: 'AK' },
];

/* Engineering change requests — disposition + traceability into the DHF. */
export const ENG_ECRS = [
  { id: 'ECR-1071', title: 'Reduce adhesive curing time to 8 hr',           impact: 'mfg',     opened: '12d ago', state: 'open',     owner: 'SM', riskChange: 'R-018 P3→P2', linked: 'DO-022' },
  { id: 'ECR-1070', title: 'Add OTA firmware update channel',                impact: 'sw',      opened: '8d ago',  state: 'review',   owner: 'PS', riskChange: 'R-061 added',  linked: 'DO-091' },
  { id: 'ECR-1067', title: 'Tighten algorithm hysteresis on rapid drop',     impact: 'sw',      opened: '15d ago', state: 'approved', owner: 'JC', riskChange: 'R-071 P4→P2', linked: 'DO-052' },
  { id: 'ECR-1063', title: 'Switch enclosure supplier (Plant 2 → Plant 5)',  impact: 'supply', opened: '22d ago', state: 'approved', owner: 'AK', riskChange: 'R-052 unchanged', linked: 'DO-074' },
  { id: 'ECR-1058', title: 'BLE handshake key rotation policy',              impact: 'sec',     opened: '31d ago', state: 'closed',   owner: 'PS', riskChange: 'R-061 P3→P1', linked: 'DO-091' },
];

/* Non-conformance / open issues — engineering's "things not OK" log. */
export const ENG_ISSUES = [
  { id: 'NC-0421', title: 'VER-066 false-low alarm rate exceeds spec',  severity: 'high',   age: '6d',  owner: 'JC', state: 'investigating', linked: 'R-071' },
  { id: 'NC-0419', title: 'Adhesive lot 24B-117 — peel below 2.3 N',    severity: 'medium', age: '11d', owner: 'LT', state: 'capa-opened',   linked: 'R-018' },
  { id: 'NC-0418', title: 'VER-074 sensitization — guinea pig anomaly', severity: 'low',    age: '14d', owner: 'LT', state: 'investigating', linked: 'R-082' },
];


// Window globals (kit harness only — codebase uses ESM imports)
