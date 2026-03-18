/**
 * @fileoverview Medidata Rave Web Services (RWS) Connector
 * Connects to customer's Medidata Rave for EDC data and study management.
 * Uses HMAC authentication.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class MedidataRaveConnector implements DataConnector {
  id = 'medidata_rave';
  name = 'Medidata Rave';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'professional';

  private baseUrl = '';
  private username = '';
  private password = '';

  async status(): Promise<ConnectorHealth> {
    if (!this.baseUrl) {
      return { status: 'unavailable', lastChecked: new Date(), message: 'Not configured — provide Medidata credentials' };
    }
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/RaveWebServices/version`, {
        headers: this.getAuthHeaders(),
      });
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    if (!this.baseUrl) return [];

    // Get list of studies
    const res = await fetch(`${this.baseUrl}/RaveWebServices/studies`, {
      headers: { ...this.getAuthHeaders(), Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`Medidata RWS error: ${res.status}`);
    const data = await res.json();
    const studies = data.Studies || data.studies || [];

    return studies
      .filter((study: any) => {
        if (!query.indication && !query.keywords?.length) return true;
        const name = (study.StudyName || study.OID || '').toLowerCase();
        if (query.indication && name.includes(query.indication.toLowerCase())) return true;
        if (query.keywords?.some(k => name.includes(k.toLowerCase()))) return true;
        return false;
      })
      .slice(0, query.limit || 20)
      .map((study: any, i: number) => ({
        id: `medidata:${study.OID || study.StudyOID}`,
        sourceConnector: this.id,
        title: study.StudyName || study.OID || 'Untitled Study',
        summary: `Medidata Study: ${study.StudyName || study.OID} | Environment: ${study.Environment || 'Production'}`,
        relevanceScore: 1 - i * 0.05,
        metadata: study,
      }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const studyOid = resourceId.replace('medidata:', '');

    const res = await fetch(`${this.baseUrl}/RaveWebServices/studies/${studyOid}/datasets/regular`, {
      headers: { ...this.getAuthHeaders(), Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`Medidata study ${studyOid} not found: ${res.status}`);
    const data = await res.json();

    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `Medidata Study ${studyOid}`,
      type: 'edc_study',
      content: JSON.stringify(data, null, 2),
      metadata: data,
      retrievedAt: new Date(),
    };
  }

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    if (!credentials.baseUrl) throw new Error('Medidata Rave base URL required');
    this.baseUrl = credentials.baseUrl.replace(/\/$/, '');
    this.username = credentials.username || '';
    this.password = credentials.password || '';
  }

  private getAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
}
