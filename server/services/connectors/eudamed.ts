/**
 * @fileoverview EUDAMED Connector
 * @module server/services/connectors/eudamed
 *
 * Cross-connector federated-search adapter over the governed EUDAMED client
 * (`integrations/eudamed-client.ts`). EU analogue of the US openFDA device
 * connectors. Public EU device database — no credentials required.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';
import { searchEudamed, EUDAMED_SOURCE } from '../integrations/eudamed-client.js';

export class EudamedConnector implements DataConnector {
  id = 'eudamed';
  name = 'EUDAMED';
  type = 'api' as const;
  requiresCredentials = false;
  requiredTier = 'standard';

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    const result = await searchEudamed({ query: 'device', pageSize: 1 });
    return {
      status: result.status === 'ok' ? 'healthy' : 'unavailable',
      latencyMs: Date.now() - start,
      lastChecked: new Date(),
      message: result.message,
    };
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const result = await searchEudamed({
      query: query.indication || query.keywords?.join(' ') || query.intervention,
      manufacturer: query.sponsor,
      pageSize: query.limit,
    });
    return result.devices.map((device, i) => ({
      id: `eudamed:${device.basicUdiDi || i}`,
      sourceConnector: this.id,
      title: device.deviceName || device.basicUdiDi || 'Unknown Device',
      summary: `Basic UDI-DI: ${device.basicUdiDi} | Manufacturer: ${device.manufacturer} | Risk class: ${device.riskClass} | Status: ${device.status}`,
      relevanceScore: 1 - i * 0.04,
      metadata: { ...device, source: EUDAMED_SOURCE },
      url: device.url,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const basicUdiDi = resourceId.replace('eudamed:', '');
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `EUDAMED device ${basicUdiDi}`,
      type: 'eudamed_device',
      content: JSON.stringify({ basicUdiDi, note: 'Full device record is retrievable from the EUDAMED public search portal.' }),
      metadata: { basicUdiDi },
      url: `https://ec.europa.eu/tools/eudamed/#/screen/search-device?basicUdiData.code=${encodeURIComponent(basicUdiDi)}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}
