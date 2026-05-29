// Risk nav — ISO 14971 risk-management workstream. Copy + scales sourced from
// ui_kits/risk (RM_SEVERITY, RM_PROBABILITY, RM_SUGGESTIONS, rmBand). Three
// live surfaces, each backed by server/routes/mdx-risk-management.ts.

export interface RiskNavItem {
  id: string;
  label: string;
  icon: string;
}

export const RISK_NAV: RiskNavItem[] = [
  { id: 'overview', label: 'Risk overview',  icon: 'shield' },
  { id: 'register', label: 'Risk register',  icon: 'list' },
  { id: 'matrix',   label: 'Risk matrix',    icon: 'grid' },
  { id: 'controls', label: 'Risk controls',  icon: 'sliders' },
];

export const HERE_LABEL_RISK: Record<string, string> = {
  overview: 'Risk overview',
  register: 'Risk register',
  matrix:   'Risk matrix',
  controls: 'Risk controls',
};

// ISO 14971 severity (1–5). Higher score = greater harm. Always paired with the
// numeric id in the UI so meaning never depends on color or position alone.
export interface RiskScaleLevel {
  id: number;
  label: string;
  desc?: string;
}

export const RISK_SEVERITY: RiskScaleLevel[] = [
  { id: 5, label: 'Catastrophic', desc: 'Death' },
  { id: 4, label: 'Critical',     desc: 'Permanent impairment or life-threatening' },
  { id: 3, label: 'Serious',      desc: 'Injury requiring intervention' },
  { id: 2, label: 'Minor',        desc: 'Temporary injury, no intervention' },
  { id: 1, label: 'Negligible',   desc: 'Inconvenience' },
];

// ISO 14971 probability of harm (1–5). Higher score = more likely.
export const RISK_PROBABILITY: RiskScaleLevel[] = [
  { id: 1, label: 'Improbable' },
  { id: 2, label: 'Remote' },
  { id: 3, label: 'Occasional' },
  { id: 4, label: 'Probable' },
  { id: 5, label: 'Frequent' },
];

export type RiskBand = 'acceptable' | 'alarp' | 'unacceptable';

// Acceptability band per (severity × probability) score. ALARP = as low as
// reasonably practicable. Org risk policy thresholds.
export function riskBand(severity: number, probability: number): RiskBand {
  const score = severity * probability;
  if (score >= 15) return 'unacceptable';
  if (score >= 8) return 'alarp';
  return 'acceptable';
}

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  acceptable: 'Acceptable',
  alarp: 'ALARP',
  unacceptable: 'Unacceptable',
};

// Human-readable item-status labels.
export const RISK_STATUS_LABEL: Record<string, string> = {
  open:       'Open',
  mitigating: 'Mitigating',
  verified:   'Verified',
  accepted:   'Accepted',
  closed:     'Closed',
};

// Human-readable control-type labels — ISO 14971 §7 hierarchy.
export const RISK_CONTROL_TYPE_LABEL: Record<string, string> = {
  inherent_safety:    'Inherent safety',
  protective_measure: 'Protective measure',
  information_safety: 'Information for safety',
};

// Human-readable control-status labels.
export const RISK_CONTROL_STATUS_LABEL: Record<string, string> = {
  proposed:    'Proposed',
  implemented: 'Implemented',
  verified:    'Verified',
  effective:   'Effective',
};

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const RISK_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Which risks are still unacceptable or ALARP after their controls',
    'Show every risk control still pending verification',
    'Draft the ISO 14971 risk-benefit conclusion from the current risk file',
  ],
  register: [
    'List every open hazard and its residual risk score',
    'Re-score every risk after the pending controls verify',
    'Which hazards have no documented control yet',
  ],
  matrix: [
    'Show the risks sitting in the unacceptable band after controls',
    'Compare the initial and residual risk distribution',
    'Which cells still need risk reduction to reach acceptable',
  ],
  controls: [
    'List every control still pending verification with its evidence',
    'Which controls introduce a new risk that needs its own item',
    'Map each control to the ISO 14971 §7 hierarchy level',
  ],
};
