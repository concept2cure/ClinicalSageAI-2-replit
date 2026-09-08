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
  /** Real numeric risk_items.id, carried for the :id write routes (PATCH /risk-
   *  items/:id, POST /risk-items/:id/controls — both require a numeric id).
   *  `id` above is the display ref_code; optional because a not-yet-persisted
   *  optimistic row (should not occur now that adds are awaited) has none. */
  dbId?: number;
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

export const SEV_LABELS = ['Negligible', 'Minor', 'Serious', 'Critical', 'Catastrophic'] as const;
export const PROB_LABELS = ['Improbable', 'Remote', 'Occasional', 'Probable', 'Frequent'] as const;
