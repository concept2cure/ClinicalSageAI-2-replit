/**
 * @fileoverview Microsoft SharePoint Connector via Graph API
 * Connects to customer's SharePoint Online for document search, retrieval,
 * and site/drive listing. Uses OAuth2 client credentials flow with
 * Microsoft Graph API v1.0.
 * Requires org-specific credentials (tenantId, clientId, clientSecret).
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SharePointTokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface GraphDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; siteId?: string };
}

interface GraphSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
  description?: string;
}

interface GraphDrive {
  id: string;
  name: string;
  webUrl?: string;
  driveType?: string;
  description?: string;
  owner?: { user?: { displayName?: string } };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export class SharePointConnector implements DataConnector {
  id = 'sharepoint';
  name = 'Microsoft SharePoint';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'professional';

  private static readonly GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  private static readonly TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

  private tenantId = '';
  private clientId = '';
  private clientSecret = '';
  private tokenCache: SharePointTokenCache | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // DataConnector interface
  // ─────────────────────────────────────────────────────────────────────────

  async status(): Promise<ConnectorHealth> {
    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      return { status: 'unavailable', lastChecked: new Date(), message: 'Not configured — provide SharePoint credentials (tenantId, clientId, clientSecret)' };
    }
    try {
      const start = Date.now();
      const token = await this.getAccessToken();
      const res = await fetch(`${SharePointConnector.GRAPH_BASE}/organization`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return {
        status: res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
        message: res.ok ? undefined : `Graph API responded with ${res.status}`,
      };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    if (!this.tenantId || !this.clientId || !this.clientSecret) return [];

    const searchTerms: string[] = [];
    if (query.indication) searchTerms.push(query.indication);
    if (query.therapeuticArea) searchTerms.push(query.therapeuticArea);
    if (query.sponsor) searchTerms.push(query.sponsor);
    if (query.intervention) searchTerms.push(query.intervention);
    if (query.keywords?.length) searchTerms.push(...query.keywords);

    const queryString = searchTerms.join(' ') || '*';
    const limit = query.limit || 20;

    try {
      const token = await this.getAccessToken();
      const body = {
        requests: [
          {
            entityTypes: ['driveItem'],
            query: { queryString },
            from: 0,
            size: limit,
          },
        ],
      };

      const res = await fetch(`${SharePointConnector.GRAPH_BASE}/search/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`SharePoint search failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const hits = data.value?.[0]?.hitsContainers?.[0]?.hits || [];

      return hits.map((hit: any, i: number) => {
        const resource: GraphDriveItem = hit.resource || {};
        const author = resource.lastModifiedBy?.user?.displayName || resource.createdBy?.user?.displayName || 'Unknown';
        return {
          id: `sharepoint:${resource.id}`,
          sourceConnector: this.id,
          title: resource.name || 'Untitled',
          summary: `${resource.file?.mimeType || 'folder'} | Modified: ${resource.lastModifiedDateTime || 'unknown'} | Author: ${author}`,
          relevanceScore: hit.rank ? 1 / hit.rank : 1 - i * 0.03,
          metadata: {
            author,
            modified: resource.lastModifiedDateTime,
            created: resource.createdDateTime,
            size: resource.size,
            mimeType: resource.file?.mimeType,
            driveId: resource.parentReference?.driveId,
            siteId: resource.parentReference?.siteId,
          },
          url: resource.webUrl,
        } satisfies ConnectorResult;
      });
    } catch (err) {
      throw new Error(`SharePoint search error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const itemId = resourceId.replace('sharepoint:', '');

    try {
      const token = await this.getAccessToken();

      // First, get item metadata — search across all drives
      const metaRes = await fetch(`${SharePointConnector.GRAPH_BASE}/drives/${this.extractDriveId(itemId)}/items/${this.extractItemId(itemId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!metaRes.ok) {
        // Fallback: try searching for the item by ID across the tenant
        return await this.fetchBySearch(token, itemId);
      }

      const meta: GraphDriveItem = await metaRes.json();

      // Download content if it's a file
      let content = '';
      if (meta.file) {
        const contentRes = await fetch(`${SharePointConnector.GRAPH_BASE}/drives/${meta.parentReference?.driveId}/items/${meta.id}/content`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'follow',
        });
        if (contentRes.ok) {
          content = await contentRes.text();
        }
      } else {
        content = JSON.stringify(meta, null, 2);
      }

      return {
        id: resourceId,
        sourceConnector: this.id,
        title: meta.name || itemId,
        type: meta.file?.mimeType || 'folder',
        content,
        metadata: {
          author: meta.lastModifiedBy?.user?.displayName || meta.createdBy?.user?.displayName,
          modified: meta.lastModifiedDateTime,
          created: meta.createdDateTime,
          size: meta.size,
          mimeType: meta.file?.mimeType,
        },
        url: meta.webUrl,
        retrievedAt: new Date(),
      };
    } catch (err) {
      throw new Error(`SharePoint fetch error for ${resourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    const tenantId = (credentials as any).tenantId || credentials.customHeaders?.['X-Tenant-Id'];
    if (!tenantId) throw new Error('SharePoint requires tenantId (pass in customHeaders["X-Tenant-Id"] or as tenantId)');
    if (!credentials.clientId) throw new Error('SharePoint requires clientId');
    if (!credentials.clientSecret) throw new Error('SharePoint requires clientSecret');

    this.tenantId = tenantId;
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.tokenCache = null; // clear cached token on re-auth

    // Validate credentials by acquiring a token immediately
    await this.getAccessToken();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SharePoint-specific operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List available SharePoint sites in the tenant.
   */
  async listSites(query?: string): Promise<GraphSite[]> {
    const token = await this.getAccessToken();
    const url = query
      ? `${SharePointConnector.GRAPH_BASE}/sites?search=${encodeURIComponent(query)}`
      : `${SharePointConnector.GRAPH_BASE}/sites?search=*`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`SharePoint listSites failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return (data.value || []) as GraphSite[];
  }

  /**
   * List document libraries (drives) in a SharePoint site.
   */
  async listDrives(siteId: string): Promise<GraphDrive[]> {
    if (!siteId) throw new Error('siteId is required for listDrives');

    const token = await this.getAccessToken();
    const res = await fetch(`${SharePointConnector.GRAPH_BASE}/sites/${siteId}/drives`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`SharePoint listDrives failed for site ${siteId}: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return (data.value || []) as GraphDrive[];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth2 token management
  // ─────────────────────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - SharePointConnector.TOKEN_BUFFER_MS) {
      return this.tokenCache.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      this.tokenCache = null;
      throw new Error(`SharePoint OAuth2 token request failed: ${res.status} ${errorBody}`);
    }

    const data = await res.json();
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };

    return this.tokenCache.accessToken;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract driveId from a composite ID (driveId:itemId format) or return as-is.
   */
  private extractDriveId(compositeId: string): string {
    if (compositeId.includes(':')) {
      return compositeId.split(':')[0];
    }
    return compositeId;
  }

  /**
   * Extract itemId from a composite ID (driveId:itemId format) or return as-is.
   */
  private extractItemId(compositeId: string): string {
    if (compositeId.includes(':')) {
      return compositeId.split(':').slice(1).join(':');
    }
    return compositeId;
  }

  /**
   * Fallback: fetch document by searching for its ID.
   */
  private async fetchBySearch(token: string, itemId: string): Promise<ConnectorDocument> {
    const res = await fetch(`${SharePointConnector.GRAPH_BASE}/search/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          entityTypes: ['driveItem'],
          query: { queryString: `id:${itemId}` },
          from: 0,
          size: 1,
        }],
      }),
    });

    if (!res.ok) {
      throw new Error(`SharePoint item ${itemId} not found`);
    }

    const data = await res.json();
    const hit = data.value?.[0]?.hitsContainers?.[0]?.hits?.[0];
    if (!hit) {
      throw new Error(`SharePoint item ${itemId} not found in search results`);
    }

    const resource: GraphDriveItem = hit.resource || {};
    return {
      id: `sharepoint:${itemId}`,
      sourceConnector: this.id,
      title: resource.name || itemId,
      type: resource.file?.mimeType || 'unknown',
      content: JSON.stringify(resource, null, 2),
      metadata: {
        author: resource.lastModifiedBy?.user?.displayName || resource.createdBy?.user?.displayName,
        modified: resource.lastModifiedDateTime,
        created: resource.createdDateTime,
        size: resource.size,
      },
      url: resource.webUrl,
      retrievedAt: new Date(),
    };
  }
}
