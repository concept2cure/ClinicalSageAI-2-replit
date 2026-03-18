/**
 * @fileoverview EMA European Public Assessment Reports Connector
 * Uses EMA's public medicines API.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class EMAEPARConnector implements DataConnector {
  id = 'ema_epar';
  name = 'EMA EPAR';
  type = 'scraper' as const;
  requiresCredentials = false;
  requiredTier = 'standard';

  private baseUrl = 'https://medicines.health.europa.eu/api';

  async status(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/human-medicines?pageSize=1`);
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch {
      return { status: 'unavailable', lastChecked: new Date() };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const params = new URLSearchParams();
    if (query.indication || query.keywords?.length) {
      params.set('searchTerm', query.indication || query.keywords?.join(' ') || '');
    }
    params.set('pageSize', String(query.limit || 20));
    params.set('page', '1');

    const res = await fetch(`${this.baseUrl}/human-medicines?${params}`);
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`EMA API error: ${res.status}`);
    }

    const data = await res.json();
    const medicines = data.content || data.results || [];

    return medicines.map((med: any, i: number) => ({
      id: `ema:${med.productNumber || med.id || i}`,
      sourceConnector: this.id,
      title: med.medicineName || med.name || 'Unknown Medicine',
      summary: `${med.medicineName || ''} | Active: ${med.activeSubstance || ''} | Status: ${med.authorisationStatus || ''} | Therapeutic Area: ${med.therapeuticArea || ''}`,
      relevanceScore: 1 - i * 0.04,
      metadata: med,
      url: med.url || `https://www.ema.europa.eu/en/medicines/human/EPAR/${(med.medicineName || '').toLowerCase().replace(/\s+/g, '-')}`,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const id = resourceId.replace('ema:', '');
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `EMA EPAR ${id}`,
      type: 'epar',
      content: JSON.stringify({ id, note: 'Full EPAR document retrieval requires PDF download from EMA website' }),
      metadata: { productNumber: id },
      url: `https://www.ema.europa.eu/en/medicines/human/EPAR/`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}
