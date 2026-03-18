/**
 * @fileoverview Veeva Vault REST API Connector
 * Connects to customer's Veeva Vault instance for document management,
 * study data, and regulatory information management.
 * Requires org-specific credentials (OAuth2 client credentials flow).
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class VeevaVaultConnector implements DataConnector {
  id = 'veeva_vault';
  name = 'Veeva Vault';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'professional';

  private baseUrl = '';
  private sessionId = '';

  async status(): Promise<ConnectorHealth> {
    if (!this.baseUrl || !this.sessionId) {
      return { status: 'unavailable', lastChecked: new Date(), message: 'Not configured — provide Vault credentials' };
    }
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/api/v24.0/metadata/objects`, {
        headers: { Authorization: this.sessionId },
      });
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    if (!this.baseUrl || !this.sessionId) return [];

    // Veeva VQL query for documents
    const conditions: string[] = [];
    if (query.indication) conditions.push(`product__v CONTAINS '${query.indication}'`);
    if (query.therapeuticArea) conditions.push(`therapeutic_area__c CONTAINS '${query.therapeuticArea}'`);
    if (query.keywords?.length) {
      conditions.push(`(name__v CONTAINS '${query.keywords.join("' OR name__v CONTAINS '")}')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const vql = `SELECT id, name__v, type__v, subtype__v, status__v, product__v, version_created_date__v FROM documents ${where} ORDER BY version_created_date__v DESC LIMIT ${query.limit || 20}`;

    const res = await fetch(`${this.baseUrl}/api/v24.0/query?q=${encodeURIComponent(vql)}`, {
      headers: { Authorization: this.sessionId },
    });

    if (!res.ok) throw new Error(`Veeva Vault query error: ${res.status}`);
    const data = await res.json();

    return (data.data || []).map((doc: any, i: number) => ({
      id: `veeva:${doc.id}`,
      sourceConnector: this.id,
      title: doc.name__v || 'Untitled',
      summary: `${doc.type__v || ''} / ${doc.subtype__v || ''} | Status: ${doc.status__v || ''} | Product: ${doc.product__v || ''}`,
      relevanceScore: 1 - i * 0.05,
      metadata: doc,
      url: `${this.baseUrl}/ui/#doc/${doc.id}`,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const vaultId = resourceId.replace('veeva:', '');

    const res = await fetch(`${this.baseUrl}/api/v24.0/objects/documents/${vaultId}`, {
      headers: { Authorization: this.sessionId },
    });
    if (!res.ok) throw new Error(`Veeva Vault document ${vaultId} not found`);

    const data = await res.json();
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: data.name__v || vaultId,
      type: data.type__v || 'document',
      content: JSON.stringify(data, null, 2),
      metadata: data,
      url: `${this.baseUrl}/ui/#doc/${vaultId}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    if (!credentials.baseUrl) throw new Error('Veeva Vault base URL required');
    this.baseUrl = credentials.baseUrl.replace(/\/$/, '');

    if (credentials.username && credentials.password) {
      // Username/password auth
      const res = await fetch(`${this.baseUrl}/api/v24.0/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`,
      });

      if (!res.ok) throw new Error(`Veeva Vault auth failed: ${res.status}`);
      const data = await res.json();
      this.sessionId = data.sessionId;
    } else if (credentials.apiKey) {
      this.sessionId = credentials.apiKey;
    } else {
      throw new Error('Veeva Vault requires username/password or session ID');
    }
  }
}
