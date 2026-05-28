// CMC · Module 3 nav — copy sourced from ui_kits/cmc/data.jsx (CMC_NAV,
// CMC_SUGGESTIONS). Eight live surfaces, each backed by a server/api/cmc route.

export interface CmcNavItem {
  id: string;
  label: string;
  icon: string;
}

export const CMC_NAV: CmcNavItem[] = [
  { id: 'overview',  label: 'Module 3 overview',   icon: 'beaker' },
  { id: 'specs',     label: 'Specifications',      icon: 'list' },
  { id: 'stability', label: 'Stability program',   icon: 'thermometer' },
  { id: 'batch',     label: 'Batch records',       icon: 'box' },
  { id: 'change',    label: 'Change simulator',    icon: 'shuffle' },
  { id: 'blueprint', label: 'Blueprint generator', icon: 'layout' },
  { id: 'global',    label: 'Global compliance',   icon: 'globe' },
  { id: 'copilot',   label: 'CMC copilot',         icon: 'sparkles' },
];

export const HERE_LABEL_CMC: Record<string, string> = {
  overview:  'Module 3 overview',
  specs:     'Specifications',
  stability: 'Stability program',
  batch:     'Batch records',
  change:    'Change simulator',
  blueprint: 'Blueprint generator',
  global:    'Global compliance',
  copilot:   'CMC copilot',
};

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const CMC_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Generate the drug-substance control strategy from current quality data',
    'Run the ICH compliance check and show every gap',
    'What is blocking my shelf-life claim?',
  ],
  specs: [
    'Justify the release and shelf-life limits for aggregation',
    'Flag any specification without a validated method',
    'Compare release versus shelf-life limits across drug substance and drug product',
  ],
  stability: [
    'Project shelf life from the long-term data with an ICH Q1E fit',
    'Show every study where the trend is rising toward a limit',
    'Draft the stability summary for section 3.2.S.7',
  ],
  batch: [
    'Summarize deviations across the last 10 batches',
    'Show batches still pending release',
    'Trend yield across drug-product batches',
  ],
  change: [
    'Simulate an API supplier change and tell me the filing path',
    'Classify a 2,000 to 5,000 litre scale-up under SUPAC',
    'Which markets need a prior-approval supplement for this change',
  ],
  blueprint: [
    'Compose the description of manufacturing process from batch records',
    'Show which section 3.2 sections are ready to generate',
    'Generate the specification section from the current spec table',
  ],
  global: [
    'Compare FDA, EMA and PMDA readiness for this dossier',
    'Show the regional gaps blocking each market',
    'Transform the module 3 content for EMA submission',
  ],
  copilot: [
    'Explain the ICH Q6B expectations for charge-variant specifications',
    'Draft a method-validation justification for the sub-visible particles test',
    'What evidence supports a 24-month shelf-life claim',
  ],
};
