export type EvidenceRoute =
  | 'literature_first'
  | 'device_diagnostics'
  | 'commercial_claims'
  | 'no_external_needed';

export interface EvidenceDecision {
  route: EvidenceRoute;
  reason: string;
  confidence: number;
}

export function sourceSelectionDecision(message: string): EvidenceDecision {
  const text = message.toLowerCase();
  if (/pubmed|biomarker|safety|clinical|trial|pmc|drug/.test(text)) {
    return {
      route: 'literature_first',
      reason: 'Clinical/literature intent detected; structured biomedical sources should be primary.',
      confidence: 0.88,
    };
  }
  if (/510\(k\)|pma|ifu|diagnostic|device|predicate/.test(text)) {
    return {
      route: 'device_diagnostics',
      reason: 'Device/regulatory intent detected; use official/public device evidence path first.',
      confidence: 0.86,
    };
  }
  if (/claim|competitor|brochure|marketing|conference/.test(text)) {
    return {
      route: 'commercial_claims',
      reason: 'Commercial claim substantiation intent detected.',
      confidence: 0.82,
    };
  }
  return {
    route: 'no_external_needed',
    reason: 'Prompt can be addressed without materially improving quality via external retrieval.',
    confidence: 0.74,
  };
}

export function sourceSelectionPolicy(message: string): EvidenceRoute {
  return sourceSelectionDecision(message).route;
}
