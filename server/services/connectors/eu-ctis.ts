/**
 * @fileoverview EU CTIS Connector
 * @module server/services/connectors/eu-ctis
 *
 * Cross-connector federated-search adapter over the governed EU CTIS client
 * (`integrations/eu-ctis-client.ts`). EU analogue of the US ClinicalTrials.gov
 * connector under Regulation (EU) No 536/2014. Public EU trial registry — no
 * credentials required.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';
import { searchEuCtis, EU_CTIS_SOURCE } from '../integrations/eu-ctis-client.js';

export class EuCtisConnector implements DataConnector {
  id = 'eu_ctis';
  name = 'EU CTIS';
  type = 'api' as const;
  requiresCredentials = false;
  requiredTier = 'standard';

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    const result = await searchEuCtis({ query: 'cancer', pageSize: 1 });
    return {
      status: result.status === 'ok' ? 'healthy' : 'unavailable',
      latencyMs: Date.now() - start,
      lastChecked: new Date(),
      message: result.message,
    };
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const result = await searchEuCtis({
      query: query.keywords?.join(' '),
      condition: query.indication || query.therapeuticArea,
      sponsor: query.sponsor,
      phase: query.phase,
      pageSize: query.limit,
    });
    return result.trials.map((trial, i) => ({
      id: `eu_ctis:${trial.euTrialNumber || i}`,
      sourceConnector: this.id,
      title: trial.title || trial.euTrialNumber || 'Unknown Trial',
      summary: `EU trial: ${trial.euTrialNumber} | Sponsor: ${trial.sponsor} | Phase: ${trial.phase} | Status: ${trial.status} | Conditions: ${trial.conditions.join(', ')}`,
      relevanceScore: 1 - i * 0.04,
      metadata: { ...trial, source: EU_CTIS_SOURCE },
      url: trial.url,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const euTrialNumber = resourceId.replace('eu_ctis:', '');
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `EU CTIS trial ${euTrialNumber}`,
      type: 'eu_ctis_trial',
      content: JSON.stringify({ euTrialNumber, note: 'Full trial record is retrievable from the CTIS public portal.' }),
      metadata: { euTrialNumber },
      url: `https://euclinicaltrials.eu/ctis-public/view/${encodeURIComponent(euTrialNumber)}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}
