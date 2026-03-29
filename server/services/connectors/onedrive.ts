/**
 * OneDrive Connector
 *
 * Connects to Microsoft OneDrive (personal and business) via Microsoft Graph API.
 * Shares the same OAuth2 client-credentials flow as SharePoint but targets
 * the /me/drive or /users/{id}/drive endpoints.
 *
 * @module server/services/connectors/onedrive
 */

import { createScopedLogger } from '../../utils/logger.js';
import type {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

const log = createScopedLogger('connector:onedrive');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';

export class OneDriveConnector implements DataConnector {
  readonly id = 'onedrive';
  readonly name = 'Microsoft OneDrive';
  readonly type = 'api' as const;
  readonly requiresCredentials = true;
  readonly requiredTier = 'professional';

  private tenantId = '';
  private clientId = '';
  private clientSecret = '';
  private accessToken = '';
  private tokenExpiresAt = 0;
  private targetUserId = ''; // Empty = app-level, or specific user ID

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    this.tenantId = credentials.customHeaders?.tenantId || '';
    this.clientId = credentials.clientId || '';
    this.clientSecret = credentials.clientSecret || '';
    this.targetUserId = credentials.username || '';

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error('OneDrive connector requires tenantId, clientId, and clientSecret');
    }

    await this.refreshToken();
    log.info('OneDrive connector authenticated');
  }

  private async refreshToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return;

    const url = TOKEN_URL.replace('{tenantId}', this.tenantId);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OneDrive token refresh failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private async graphGet(path: string): Promise<Record<string, unknown>> {
    await this.refreshToken();
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph API error: ${res.status} ${err.slice(0, 200)}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  private get drivePath(): string {
    return this.targetUserId
      ? `/users/${this.targetUserId}/drive`
      : '/me/drive';
  }

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.graphGet(this.drivePath);
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (err) {
      return {
        status: this.accessToken ? 'degraded' : 'unavailable',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const searchText = query.keywords?.join(' ') || query.indication || '';
    if (!searchText) return [];

    const limit = Math.min(query.limit || 25, 50);
    const data = await this.graphGet(
      `${this.drivePath}/root/search(q='${encodeURIComponent(searchText)}')?$top=${limit}&$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,file`,
    );

    const items = (data.value as Array<Record<string, unknown>>) || [];
    return items.map((item, idx) => {
      const lastMod = item.lastModifiedBy as Record<string, unknown> | undefined;
      const user = lastMod?.user as Record<string, unknown> | undefined;
      return {
        id: String(item.id),
        sourceConnector: this.id,
        title: String(item.name || ''),
        summary: `OneDrive document — ${formatBytes(Number(item.size || 0))} — modified ${String(item.lastModifiedDateTime || 'unknown')}`,
        relevanceScore: 1 - idx * 0.02,
        metadata: {
          size: item.size,
          webUrl: item.webUrl,
          lastModified: item.lastModifiedDateTime,
          modifiedBy: user?.displayName || 'unknown',
          mimeType: (item.file as Record<string, unknown>)?.mimeType || 'unknown',
        },
        url: String(item.webUrl || ''),
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    // Get metadata
    const meta = await this.graphGet(`${this.drivePath}/items/${resourceId}?$select=id,name,size,webUrl,lastModifiedDateTime,file`);

    // Get content (download URL)
    await this.refreshToken();
    const downloadRes = await fetch(`${GRAPH_BASE}${this.drivePath}/items/${resourceId}/content`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      redirect: 'manual',
    });

    // Graph API returns a 302 redirect to the actual download URL
    const downloadUrl = downloadRes.headers.get('location') || '';

    return {
      id: String(meta.id),
      sourceConnector: this.id,
      title: String(meta.name || ''),
      type: String((meta.file as Record<string, unknown>)?.mimeType || 'application/octet-stream'),
      content: downloadUrl ? `[Download URL]: ${downloadUrl}` : '[Content requires direct download]',
      metadata: {
        size: meta.size,
        webUrl: meta.webUrl,
        lastModified: meta.lastModifiedDateTime,
      },
      url: String(meta.webUrl || ''),
      retrievedAt: new Date(),
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
