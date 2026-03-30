/**
 * Google Drive Connector
 *
 * Connects to Google Drive via Google Drive API v3.
 * Uses OAuth2 service account (JWT) or client-credentials for authentication.
 *
 * @module server/services/connectors/google-drive
 */

import { createScopedLogger } from '../../utils/logger.js';
import crypto from 'node:crypto';
import type {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

const log = createScopedLogger('connector:google-drive');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleDriveConnector implements DataConnector {
  readonly id = 'google_drive';
  readonly name = 'Google Drive';
  readonly type = 'api' as const;
  readonly requiresCredentials = true;
  readonly requiredTier = 'professional';

  private clientEmail = '';
  private privateKey = '';
  private accessToken = '';
  private tokenExpiresAt = 0;
  private impersonateUser = ''; // For domain-wide delegation

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    // Service account credentials: clientId = client_email, clientSecret = private_key
    this.clientEmail = credentials.clientId || '';
    this.privateKey = (credentials.clientSecret || '').replace(/\\n/g, '\n');
    this.impersonateUser = credentials.username || '';

    if (!this.clientEmail || !this.privateKey) {
      throw new Error('Google Drive connector requires service account client_email and private_key');
    }

    await this.refreshToken();
    log.info('Google Drive connector authenticated');
  }

  private async refreshToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return;

    // Build JWT assertion for service account auth
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload: Record<string, unknown> = {
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };

    if (this.impersonateUser) {
      payload.sub = this.impersonateUser;
    }

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = base64url(sign.sign(this.privateKey));

    const jwt = `${signingInput}.${signature}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive token refresh failed: ${res.status} ${err.slice(0, 200)}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private async driveGet(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    await this.refreshToken();
    const qs = new URLSearchParams(params).toString();
    const url = `${DRIVE_API}${path}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive API error: ${res.status} ${err.slice(0, 200)}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async status(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.driveGet('/about', { fields: 'user' });
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

    // Build Google Drive search query
    // fullText contains 'keyword' AND trashed = false
    const q = `fullText contains '${searchText.replace(/'/g, "\\'")}' and trashed = false`;

    const data = await this.driveGet('/files', {
      q,
      pageSize: String(limit),
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,owners,description)',
      orderBy: 'modifiedTime desc',
    });

    const files = (data.files as Array<Record<string, unknown>>) || [];
    return files.map((file, idx) => {
      const owners = (file.owners as Array<Record<string, unknown>>) || [];
      const ownerName = owners.length > 0 ? String(owners[0].displayName || '') : 'unknown';
      const size = Number(file.size || 0);

      return {
        id: String(file.id),
        sourceConnector: this.id,
        title: String(file.name || ''),
        summary: `${String(file.mimeType || '')} — ${formatBytes(size)} — by ${ownerName} — ${String(file.modifiedTime || '')}`,
        relevanceScore: 1 - idx * 0.01,
        metadata: {
          mimeType: file.mimeType,
          size,
          modifiedTime: file.modifiedTime,
          owner: ownerName,
          description: file.description || '',
        },
        url: String(file.webViewLink || ''),
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const meta = await this.driveGet(`/files/${resourceId}`, {
      fields: 'id,name,mimeType,size,modifiedTime,webViewLink,owners,description',
    });

    // For Google Docs/Sheets/Slides, export as PDF or text
    const mimeType = String(meta.mimeType || '');
    let content = '';
    let docType = mimeType;

    if (mimeType.startsWith('application/vnd.google-apps.')) {
      // Google Workspace files — export as plain text
      const exportMime = 'text/plain';
      await this.refreshToken();
      const exportRes = await fetch(
        `${DRIVE_API}/files/${resourceId}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );
      if (exportRes.ok) {
        content = await exportRes.text();
        docType = exportMime;
      }
    } else {
      // Binary files — provide download link
      content = `[Binary file — download via Google Drive API /files/${resourceId}?alt=media]`;
    }

    return {
      id: String(meta.id),
      sourceConnector: this.id,
      title: String(meta.name || ''),
      type: docType,
      content,
      metadata: {
        mimeType: meta.mimeType,
        size: meta.size,
        modifiedTime: meta.modifiedTime,
        webViewLink: meta.webViewLink,
        description: meta.description || '',
      },
      url: String(meta.webViewLink || ''),
      retrievedAt: new Date(),
    };
  }
  async upload(file: Buffer, fileName: string, mimeType: string, folderPath?: string): Promise<{ id: string; url?: string }> {
    await this.refreshToken();

    // Google Drive uses multipart upload: metadata + content
    const boundary = `----c2c-upload-${Date.now()}`;
    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType,
    };

    // If folderPath provided, treat it as a parent folder ID
    if (folderPath) {
      metadata.parents = [folderPath];
    }

    const metaJson = JSON.stringify(metadata);
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Google Drive upload failed: ${res.status} ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as Record<string, unknown>;
    return { id: String(data.id), url: String(data.webViewLink || '') };
  }
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
