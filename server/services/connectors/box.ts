/**
 * Box.com Connector
 *
 * Connects to Box via Box API v2.
 * Uses OAuth2 client credentials (Client ID + Client Secret + Enterprise ID) for authentication.
 *
 * @module server/services/connectors/box
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

const log = createScopedLogger('connector:box');

const BOX_API = 'https://api.box.com/2.0';
const BOX_UPLOAD_API = 'https://upload.box.com/api/2.0';
const BOX_TOKEN_URL = 'https://api.box.com/oauth2/token';

export class BoxConnector implements DataConnector {
  readonly id = 'box';
  readonly name = 'Box';
  readonly type = 'api' as const;
  readonly requiresCredentials = true;
  readonly requiredTier = 'professional';

  private clientId = '';
  private clientSecret = '';
  private enterpriseId = '';
  private accessToken = '';
  private tokenExpiresAt = 0;

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    this.clientId = credentials.clientId || '';
    this.clientSecret = credentials.clientSecret || '';
    this.enterpriseId = credentials.baseUrl || ''; // Enterprise ID stored in baseUrl field

    if (!this.clientId || !this.clientSecret || !this.enterpriseId) {
      throw new Error('Box connector requires Client ID, Client Secret, and Enterprise ID');
    }

    await this.refreshToken();
    log.info('Box connector authenticated');
  }

  private async refreshToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return;

    const res = await fetch(BOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        box_subject_type: 'enterprise',
        box_subject_id: this.enterpriseId,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Box token refresh failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private async boxGet(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    await this.refreshToken();
    const qs = new URLSearchParams(params).toString();
    const url = `${BOX_API}${path}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Box API error: ${res.status} ${err.slice(0, 200)}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.boxGet('/users/me');
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

    const limit = Math.min(query.limit || 25, 100);

    const data = await this.boxGet('/search', {
      query: searchText,
      limit: String(limit),
      fields: 'id,name,description,size,modified_at,created_by,shared_link,type',
      content_types: 'name,description,file_content',
    });

    const entries = (data.entries as Array<Record<string, unknown>>) || [];
    return entries.map((entry, idx) => {
      const createdBy = (entry.created_by as Record<string, unknown>) || {};
      const ownerName = String(createdBy.name || createdBy.login || 'unknown');
      const size = Number(entry.size || 0);

      return {
        id: String(entry.id),
        sourceConnector: this.id,
        title: String(entry.name || ''),
        summary: `${String(entry.type || 'file')} — ${formatBytes(size)} — by ${ownerName} — ${String(entry.modified_at || '')}`,
        relevanceScore: 1 - idx * 0.01,
        metadata: {
          type: entry.type,
          size,
          modifiedAt: entry.modified_at,
          owner: ownerName,
          description: entry.description || '',
        },
        url: entry.shared_link
          ? String((entry.shared_link as Record<string, unknown>).url || '')
          : `https://app.box.com/file/${entry.id}`,
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    // Get file metadata
    const meta = await this.boxGet(`/files/${resourceId}`, {
      fields: 'id,name,description,size,modified_at,created_by,shared_link,extension',
    });

    // Download file content
    await this.refreshToken();
    const downloadRes = await fetch(`${BOX_API}/files/${resourceId}/content`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      redirect: 'follow',
    });

    let content = '';
    const ext = String(meta.extension || '').toLowerCase();
    const textExtensions = ['txt', 'md', 'csv', 'xml', 'json', 'html', 'htm', 'rtf'];

    if (downloadRes.ok && textExtensions.includes(ext)) {
      content = await downloadRes.text();
    } else if (downloadRes.ok) {
      content = `[Binary file — download via Box API /files/${resourceId}/content]`;
    } else {
      content = `[Failed to download: ${downloadRes.status}]`;
    }

    return {
      id: String(meta.id),
      sourceConnector: this.id,
      title: String(meta.name || ''),
      type: ext || 'unknown',
      content,
      metadata: {
        extension: meta.extension,
        size: meta.size,
        modifiedAt: meta.modified_at,
        description: meta.description || '',
      },
      url: `https://app.box.com/file/${meta.id}`,
      retrievedAt: new Date(),
    };
  }

  /**
   * Upload a document to Box.
   * Uses the Box Upload API (multipart form).
   */
  async uploadDocument(options: {
    name: string;
    buffer: Buffer;
    mimeType: string;
    folderId?: string;
  }): Promise<{ id: string; url: string }> {
    await this.refreshToken();

    const folderId = options.folderId || '0'; // '0' = root folder

    // Box uses multipart upload: attributes JSON + file binary
    const attributes = JSON.stringify({
      name: options.name,
      parent: { id: folderId },
    });

    const boundary = `----BoxUpload${Date.now()}`;
    const parts: Buffer[] = [];

    // Attributes part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="attributes"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${attributes}\r\n`
    ));

    // File part
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${options.name}"\r\n` +
      `Content-Type: ${options.mimeType}\r\n\r\n`
    ));
    parts.push(options.buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const res = await fetch(`${BOX_UPLOAD_API}/files/content`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Box upload failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const data = await res.json() as { entries?: Array<{ id: string }> };
    const fileId = data.entries?.[0]?.id || '';

    return {
      id: fileId,
      url: `https://app.box.com/file/${fileId}`,
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
