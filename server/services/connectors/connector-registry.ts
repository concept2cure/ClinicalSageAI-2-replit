/**
 * @fileoverview Connector Registry
 * @module server/services/connectors/connector-registry
 *
 * Central registry for all data connectors. Manages connector instances,
 * credentials (encrypted per-org), and provides a unified search endpoint.
 */

import { pool } from '../../db.js';
import crypto from 'crypto';
import {
  DataConnector,
  ConnectorQuery,
  ConnectorResult,
  ConnectorCredentials,
  CONNECTOR_CATALOG,
  ConnectorCatalogEntry,
} from './connector-interface.js';
import { ClinicalTrialsGovConnector } from './clinical-trials-gov.js';
import { PubMedConnector } from './pubmed.js';
import { FDADrugsConnector } from './fda-drugs.js';
import { EMAEPARConnector } from './ema-epar.js';
import { PMDAConnector } from './pmda-reviews.js';
import { NMPACDEConnector } from './nmpa-cde.js';
import { VeevaVaultConnector } from './veeva-vault.js';
import { MedidataRaveConnector } from './medidata-rave.js';
import { SharePointConnector } from './sharepoint.js';
import { FHIRR4Connector } from './fhir-r4.js';
import { OneDriveConnector } from './onedrive.js';
import { GoogleDriveConnector } from './google-drive.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════════════

const ENCRYPTION_KEY = process.env.CONNECTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-dev-key-change-in-prod';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text: string): string {
  const [ivHex, authTagHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory connector instances (shared, not org-specific)
const connectors: Map<string, DataConnector> = new Map();

function initializeConnectors(): void {
  if (connectors.size > 0) return;

  connectors.set('clinical_trials_gov', new ClinicalTrialsGovConnector());
  connectors.set('pubmed', new PubMedConnector());
  connectors.set('fda_drugs', new FDADrugsConnector());
  connectors.set('ema_epar', new EMAEPARConnector());
  connectors.set('pmda_reviews', new PMDAConnector());
  connectors.set('nmpa_cde', new NMPACDEConnector());
  connectors.set('veeva_vault', new VeevaVaultConnector());
  connectors.set('medidata_rave', new MedidataRaveConnector());
  connectors.set('sharepoint', new SharePointConnector());
  connectors.set('fhir-r4', new FHIRR4Connector());
  connectors.set('onedrive', new OneDriveConnector());
  connectors.set('google_drive', new GoogleDriveConnector());
}

/**
 * Get the connector catalog with per-org availability.
 */
export async function getConnectorCatalog(
  organizationId: number
): Promise<(ConnectorCatalogEntry & { configured: boolean; healthy: boolean })[]> {
  initializeConnectors();

  // Check which connectors have stored credentials for this org
  const credResult = await pool.query(
    `SELECT connector_id, is_valid FROM connector_credentials WHERE organization_id = $1`,
    [organizationId]
  );
  const credMap = new Map(credResult.rows.map((r: any) => [r.connector_id, r.is_valid]));

  return CONNECTOR_CATALOG.map(entry => ({
    ...entry,
    configured: !entry.requiresCredentials || credMap.has(entry.id),
    healthy: credMap.get(entry.id) !== false,
  }));
}

/**
 * Store encrypted credentials for a connector.
 */
export async function storeCredentials(
  organizationId: number,
  connectorId: string,
  credentials: ConnectorCredentials
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(credentials));

  await pool.query(
    `INSERT INTO connector_credentials (organization_id, connector_id, credentials, is_valid, last_validated_at, created_at)
     VALUES ($1, $2, $3, true, NOW(), NOW())
     ON CONFLICT (organization_id, connector_id)
     DO UPDATE SET credentials = $3, is_valid = true, last_validated_at = NOW()`,
    [organizationId, connectorId, encrypted]
  );
}

/**
 * Load and authenticate a connector with org-specific credentials.
 */
async function getAuthenticatedConnector(
  organizationId: number,
  connectorId: string
): Promise<DataConnector | null> {
  initializeConnectors();
  const connector = connectors.get(connectorId);
  if (!connector) return null;

  // Load credentials if needed
  if (connector.requiresCredentials) {
    const credResult = await pool.query(
      `SELECT credentials FROM connector_credentials
       WHERE organization_id = $1 AND connector_id = $2 AND is_valid = true`,
      [organizationId, connectorId]
    );

    if (credResult.rows.length === 0) return null;

    const creds: ConnectorCredentials = JSON.parse(decrypt(credResult.rows[0].credentials));
    await connector.authenticate(creds);
  }

  return connector;
}

/**
 * Search across multiple connectors in parallel.
 */
export async function searchConnectors(
  organizationId: number,
  connectorIds: string[],
  query: ConnectorQuery
): Promise<{ connectorId: string; results: ConnectorResult[]; error?: string }[]> {
  initializeConnectors();

  const searchPromises = connectorIds.map(async (connectorId) => {
    try {
      const connector = await getAuthenticatedConnector(organizationId, connectorId);
      if (!connector) {
        return { connectorId, results: [], error: 'Connector not available or not configured' };
      }
      const results = await connector.search(query);
      return { connectorId, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { connectorId, results: [], error: message };
    }
  });

  return Promise.all(searchPromises);
}

export default {
  getConnectorCatalog,
  storeCredentials,
  searchConnectors,
};
