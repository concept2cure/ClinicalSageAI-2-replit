import { sourceSelectionDecision } from './sourceSelectionPolicy';
import { runLiteratureSearch } from './runLiteratureSearch';
import { runExternalEvidenceSearch } from './runExternalEvidenceSearch';
import { runDeviceDiagnosticsEvidence } from './runDeviceDiagnosticsEvidence';
import { runCommercialClaimSubstantiation } from './runCommercialClaimSubstantiation';

export async function routeEvidenceRequest(message: string, useFirecrawl = false) {
  const decision = sourceSelectionDecision(message);
  const route = decision.route;
  if (route === 'literature_first')
    return { route, decision, data: await runLiteratureSearch(message) };
  if (route === 'device_diagnostics')
    return { route, decision, data: await runDeviceDiagnosticsEvidence(message) };
  if (route === 'commercial_claims')
    return { route, decision, data: await runCommercialClaimSubstantiation(message) };
  if (useFirecrawl)
    return { route: 'fallback_firecrawl', decision, data: await runExternalEvidenceSearch(message) };
  return {
    route: 'no_external_needed',
    decision,
    data: {
      provider: 'none',
      reason: 'not_materially_improved',
      explanation: 'Request can be answered from existing context without external web retrieval.',
    },
  };
}
