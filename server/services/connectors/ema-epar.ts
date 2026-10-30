/**
 * @fileoverview EMA European Public Assessment Reports Connector
 *
 * Cross-connector federated-search adapter over the governed EMA EPAR client
 * (`integrations/ema-epar-client.ts`), as the EUDAMED and EU CTIS connectors
 * are. 2026-10-15: it fetched the EMA medicines API itself and answered a 404
 * or a body without a results array with [] — "no matches" for a failed read.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';
import { searchEmaEpar, EMA_EPAR_SOURCE } from '../integrations/ema-epar-client.js';

export class EMAEPARConnector implements DataConnector {
  id = 'ema_epar';
  name = 'EMA EPAR';
  type = 'scraper' as const;
  requiresCredentials = false;
  requiredTier = 'standard';

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    const result = await searchEmaEpar({ pageSize: 1 });
    return {
      status: result.status === 'ok' ? 'healthy' : 'unavailable',
      latencyMs: Date.now() - start,
      lastChecked: new Date(),
      message: result.message,
    };
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const result = await searchEmaEpar({
      query: query.indication || query.keywords?.join(' '),
      pageSize: query.limit || 20,
    });
    if (result.status !== 'ok') throw new Error(result.message ?? 'EMA EPAR search failed');
    return result.medicines.map((med, i) => ({
      id: `ema:${med.productNumber || i}`,
      sourceConnector: this.id,
      title: med.medicineName || 'Unknown Medicine',
      summary: `${med.medicineName} | Active: ${med.activeSubstance} | Status: ${med.authorisationStatus} | Therapeutic Area: ${med.therapeuticArea}`,
      sourceRank: i + 1,
      metadata: { ...med, source: EMA_EPAR_SOURCE },
      url: med.url,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const id = resourceId.replace('ema:', '');
    const result = await searchEmaEpar({ query: id, pageSize: 1 });
    if (result.status !== 'ok') throw new Error(result.message ?? 'EMA EPAR search failed');
    const medicine = result.medicines.find(m => m.productNumber === id);
    if (!medicine) throw new Error(`EMA product ${id} not found`);
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: medicine.medicineName,
      type: 'epar_metadata',
      content: JSON.stringify(medicine),
      metadata: { ...medicine, source: EMA_EPAR_SOURCE, acquisitionStatus: 'listed_only' },
      url: medicine.url,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}
