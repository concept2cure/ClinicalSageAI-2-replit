// RBM / RBQM nav — ICH E6(R3) + E8(R1) conduct-layer monitoring workstream.
// Seven live surfaces, each backed by server/routes/mdx-rbm.ts.

export interface RbmNavItem {
  id: string;
  label: string;
}

export const RBM_NAV: RbmNavItem[] = [
  { id: 'overview',  label: 'Overview' },
  { id: 'ract',      label: 'Risk assessment (RACT)' },
  { id: 'kris',      label: 'Key risk indicators' },
  { id: 'qtls',      label: 'Quality tolerance limits' },
  { id: 'signals',   label: 'Central monitoring' },
  { id: 'sites',     label: 'Site risk' },
  { id: 'plan',      label: 'Monitoring plan' },
];

export const HERE_LABEL_RBM: Record<string, string> = Object.fromEntries(
  RBM_NAV.map((n) => [n.id, n.label]),
);

export const RBM_CATEGORY_LABEL: Record<string, string> = {
  safety: 'Safety',
  efficacy: 'Efficacy',
  data_integrity: 'Data integrity',
  compliance: 'Compliance',
  operational: 'Operational',
};

export const RBM_ITEM_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  mitigating: 'Mitigating',
  accepted: 'Accepted',
  closed: 'Closed',
};

export const RBM_TIER_LABEL: Record<string, string> = {
  reduced: 'Reduced',
  standard: 'Standard',
  enhanced: 'Enhanced',
};

export const RBM_KRI_STATUS_LABEL: Record<string, string> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
};

export const RBM_QTL_STATUS_LABEL: Record<string, string> = {
  within: 'Within',
  approaching: 'Approaching',
  breached: 'Breached',
};

export const RBM_SEVERITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// Risk band from a likelihood × impact score (RACT convention).
export function rbmBand(score: number | null | undefined): 'low' | 'medium' | 'high' {
  const s = score ?? 0;
  if (s >= 15) return 'high';
  if (s >= 8) return 'medium';
  return 'low';
}

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const RBM_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Summarize the risk-based monitoring posture for this study',
    'Which critical-to-quality factors are still open',
    'What needs my attention across KRIs, QTLs and signals',
  ],
  ract: [
    'Seed a default ICH E6(R3) risk assessment for this study',
    'List the critical-to-quality factors ranked by risk score',
    'Which risks have no mitigation documented',
  ],
  kris: [
    'Which key risk indicators are amber or red right now',
    'Seed the standard KRI library for this study',
    'Explain what each red KRI means for study conduct',
  ],
  qtls: [
    'Which quality tolerance limits are approaching or breached',
    'Propose quality tolerance limits for this study',
    'What action does a breached QTL require',
  ],
  signals: [
    'Prioritize the open central-monitoring signals by urgency',
    'Which sites have the most high-severity signals',
    'Draft an action for the most critical signal',
  ],
  sites: [
    'Recompute site risk and show the enhanced-tier sites',
    'Which sites should move to enhanced monitoring and why',
    'Explain the drivers behind the highest-risk site',
  ],
  plan: [
    'Generate a risk-based monitoring plan from the assessment',
    'Recommend a monitoring strategy for this risk level',
    'Turn the critical risks into monitoring actions',
  ],
};
