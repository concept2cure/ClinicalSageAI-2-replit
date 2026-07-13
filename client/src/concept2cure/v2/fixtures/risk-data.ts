/* Risk management fixture data — ported from kit specialist-data.jsx (window globals).
   Types match the mdx-risk-management.ts backend shape described in the kit comments. */

export interface RiskControl {
  id: string;
  desc: string;
  type: string;
  status: string;
}

export interface RiskRow {
  id: string;
  hazard: string;
  situation: string;
  harm: string;
  seq: string;
  sev: string;
  prob: string;
  probR: string;
  det: number;
  strategy: string;
  source: string;
  status: string;
  ctrl: string;
  ver: string;
  res: string;
  open?: boolean;
  controls: RiskControl[];
  _new?: boolean;
}

export interface RiskEnums {
  strategy: [string, string][];
  status: [string, string][];
  ctrlType: [string, string][];
  ctrlStatus: [string, string][];
  source: [string, string][];
}

export const RISK_ENUMS: RiskEnums = {
  strategy: [
    ['design_eliminate', 'Inherently safe design'],
    ['design_reduce', 'Design to reduce'],
    ['protective', 'Protective measure'],
    ['information', 'Information for safety'],
  ],
  status: [
    ['open', 'Open'],
    ['mitigating', 'Mitigating'],
    ['verified', 'Verified'],
    ['accepted', 'Accepted'],
    ['closed', 'Closed'],
  ],
  ctrlType: [
    ['inherent_safety', 'Inherent safety'],
    ['protective_measure', 'Protective measure'],
    ['information_safety', 'Information for safety'],
  ],
  ctrlStatus: [
    ['proposed', 'Proposed'],
    ['implemented', 'Implemented'],
    ['verified', 'Verified'],
    ['effective', 'Effective'],
  ],
  source: [
    ['fmea', 'FMEA'],
    ['pha', 'PHA'],
    ['fault_tree', 'Fault tree'],
    ['literature', 'Literature'],
    ['complaint', 'Complaint'],
    ['capa', 'CAPA'],
    ['other', 'Other'],
  ],
};

export const RISK_ROWS: RiskRow[] = [
  {
    id: 'HZ-01', hazard: 'Inaccurate glucose reading',
    situation: 'Sensor drift during 14-day wear reports a low value while the user is hyperglycemic',
    harm: 'Mis-dosing of insulin',
    seq: 'Sensor drift — false low — user boluses — hypoglycemia',
    sev: 'Critical', prob: 'Occasional', probR: 'Remote', det: 2,
    strategy: 'design_reduce', source: 'fmea', status: 'verified',
    ctrl: 'MARD <=8.2%, dual-sensor cross-check',
    ver: 'V&V-114 accuracy report / MARD 8.2%', res: 'Acceptable',
    controls: [
      { id: 'RC-01a', desc: 'Dual-sensor cross-check rejects a reading when sensors disagree >15 mg/dL', type: 'inherent_safety', status: 'verified' },
      { id: 'RC-01b', desc: 'MARD <=8.2% validated across the glycemic range', type: 'protective_measure', status: 'effective' },
    ],
  },
  {
    id: 'HZ-02', hazard: 'Adhesive failure',
    situation: 'Adhesive lifts before day 14 and the sensor detaches during activity',
    harm: 'Loss of monitoring',
    seq: 'Perspiration — adhesive lift — sensor detachment — gap in data',
    sev: 'Minor', prob: 'Probable', probR: 'Remote', det: 3,
    strategy: 'design_reduce', source: 'complaint', status: 'mitigating',
    ctrl: '14-day adhesive validation',
    ver: 'V&V-121 wear study / 14-day', res: 'Acceptable',
    controls: [
      { id: 'RC-02a', desc: 'Acrylic adhesive validated to 14-day wear under ISO 10993 conditions', type: 'protective_measure', status: 'implemented' },
    ],
  },
  {
    id: 'HZ-03', hazard: 'Cybersecurity breach (BLE)',
    situation: 'Unpaired attacker intercepts the BLE link and reads glucose telemetry',
    harm: 'Unauthorized data access',
    seq: 'Weak pairing — MITM — telemetry disclosure',
    sev: 'Serious', prob: 'Remote', probR: 'Improbable', det: 2,
    strategy: 'protective', source: 'fault_tree', status: 'verified',
    ctrl: 'AES-128, pairing auth, SBOM',
    ver: 'Pen-test PT-09 / threat model TM-03', res: 'Acceptable',
    controls: [
      { id: 'RC-03a', desc: 'AES-128 link encryption with authenticated pairing', type: 'protective_measure', status: 'verified' },
      { id: 'RC-03b', desc: 'SBOM + coordinated disclosure per FDA premarket cyber guidance', type: 'information_safety', status: 'effective' },
    ],
  },
  {
    id: 'HZ-04', hazard: 'Biocompatibility (14-day wear)',
    situation: 'Prolonged skin contact provokes a sensitization response in susceptible users',
    harm: 'Skin sensitization',
    seq: 'Prolonged contact — cumulative irritation — sensitization',
    sev: 'Serious', prob: 'Occasional', probR: 'Occasional', det: 3,
    strategy: 'design_reduce', source: 'literature', status: 'open',
    ctrl: 'ISO 10993-10/-11 testing',
    ver: 'ISO 10993-11 report pending', res: 'Investigation', open: true,
    controls: [
      { id: 'RC-04a', desc: 'ISO 10993-10 irritation and sensitization testing', type: 'protective_measure', status: 'proposed' },
    ],
  },
];

export const SEV_LABELS = ['Negligible', 'Minor', 'Serious', 'Critical', 'Catastrophic'] as const;
export const PROB_LABELS = ['Improbable', 'Remote', 'Occasional', 'Probable', 'Frequent'] as const;
