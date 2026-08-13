import { sourceSelectionDecision } from './sourceSelectionPolicy';
import { searchPubmed } from '../integrations/pubmed-client';
import { runExternalEvidenceSearch } from './runExternalEvidenceSearch';
import { runDeviceDiagnosticsEvidence } from './runDeviceDiagnosticsEvidence';
import { runCommercialClaimSubstantiation } from './runCommercialClaimSubstantiation';

/**
 * Literature-first evidence route over the CANONICAL PubMed client
 * (server/services/integrations/pubmed-client.ts — the same client the AnA
 * search_literature tool and /api/cerv2/literature/search use). Replaces the
 * deleted ad-hoc runLiteratureSearch E-utilities implementation (D11e) so one
 * PubMed implementation remains, and keeps that route's exact result contract
 * ({ provider, summary, results: [{ pmid, title, pubdate, source }] }) for
 * the two consumers (routes/external-evidence.ts, routes/ana-ri/chat.ts).
 *
 * Honest degradation: a PubMed failure reports itself in `summary` with zero
 * results — never fabricated hits.
 */
async function runPubmedLiteratureSearch(message: string): Promise<{
  provider: 'PubMed';
  summary: string;
  results: Array<{ pmid: string; title: string; pubdate: string; source: string }>;
}> {
  try {
    const result = await searchPubmed({ query: message.slice(0, 200), maxResults: 5 });
    const results = result.articles.map(a => ({
      pmid: a.pmid,
      title: a.title,
      pubdate: a.pubDate,
      source: a.journal,
    }));
    return {
      provider: 'PubMed',
      summary:
        results.length > 0
          ? `Literature-first route returned ${results.length} PubMed results.`
          : 'No PubMed hits found for this query.',
      results,
    };
  } catch (err) {
    return {
      provider: 'PubMed',
      summary: `PubMed lookup failed — ${err instanceof Error ? err.message : 'network error'}.`,
      results: [],
    };
  }
}

export async function routeEvidenceRequest(message: string, useFirecrawl = false) {
  const decision = sourceSelectionDecision(message);
  const route = decision.route;
  if (route === 'literature_first')
    return { route, decision, data: await runPubmedLiteratureSearch(message) };
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
