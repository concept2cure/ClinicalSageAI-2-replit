export interface AnaRuleCatalogEntry {
  ruleId: string;
  ruleVersion: string;
  domain: 'governance' | 'security' | 'observability';
  title: string;
  description: string;
  regulatoryReferences: string[];
}

export const ANA_RULE_CATALOG: AnaRuleCatalogEntry[] = [
  {
    ruleId: 'gov-immutability-append-only',
    ruleVersion: '1.0.0',
    domain: 'governance',
    title: 'Append-only audit immutability',
    description: 'Blocks destructive operations against immutable audit resources.',
    regulatoryReferences: ['21 CFR Part 11.10(e)', 'EU Annex 11 §9'],
  },
  {
    ruleId: 'gov-bias-screen-v1',
    ruleVersion: '1.1.0',
    domain: 'governance',
    title: 'Bias signal screen',
    description: 'Screens prompts for protected-attribute signals that require human review.',
    regulatoryReferences: ['ICH Q9(R1)'],
  },
  {
    ruleId: 'gov-scientific-integrity-v1',
    ruleVersion: '1.0.0',
    domain: 'governance',
    title: 'Scientific integrity safeguard',
    description: 'Blocks content indicating fabrication/falsification intent for submission writing.',
    regulatoryReferences: ['21 CFR Part 11', 'GCP E6(R2)', 'FDA data integrity guidance'],
  },
  {
    ruleId: 'sec-identity-required',
    ruleVersion: '1.1.0',
    domain: 'security',
    title: 'Authenticated actor requirement',
    description: 'Requires actor identity for non-exempt API operations.',
    regulatoryReferences: ['21 CFR Part 11.10(d)', 'SOC2 CC6'],
  },
  {
    ruleId: 'obs-causal-trace-v1',
    ruleVersion: '1.1.0',
    domain: 'observability',
    title: 'Causal trace capture',
    description: 'Captures request-level decision traces for audit and explainability.',
    regulatoryReferences: ['21 CFR Part 11.10(e)', 'ISO 14971 traceability'],
  },
];
