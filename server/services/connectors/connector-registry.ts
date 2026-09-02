/**
 * @fileoverview Connector Registry
 * @module server/services/connectors/connector-registry
 *
 * Central registry for all data connectors. Manages connector instances,
 * credentials (encrypted per-org), and provides a unified search endpoint.
 */

import { pool } from '../../db.js';
import crypto from 'crypto';
import { isSafePublicUrl } from '../../utils/ssrfGuard.js';
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
import { EudamedConnector } from './eudamed.js';
import { EuCtisConnector } from './eu-ctis.js';
import { PMDAConnector } from './pmda-reviews.js';
import { NMPACDEConnector } from './nmpa-cde.js';
import { VeevaVaultConnector } from './veeva-vault.js';
import { MedidataRaveConnector } from './medidata-rave.js';
import { SharePointConnector } from './sharepoint.js';
import { FHIRR4Connector } from './fhir-r4.js';
import { OneDriveConnector } from './onedrive.js';
import { GoogleDriveConnector } from './google-drive.js';
import { BoxConnector } from './box.js';
import { GrantsGovConnector } from './grants-gov.js';
import { SamExclusionsConnector } from './sam-exclusions.js';
import { EllucianBannerConnector } from './ellucian-banner.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════════════

// Dedicated key only. Reusing JWT_SECRET as the AES key couples two unrelated
// trust domains: a JWT-signing leak would also expose stored connector
// credentials and vice versa. Require CONNECTOR_ENCRYPTION_KEY and refuse to
// silently fall back to JWT_SECRET or a hardcoded value.
const ENCRYPTION_KEY_FROM_ENV = process.env.CONNECTOR_ENCRYPTION_KEY;

// Production must supply a real, dedicated key. Refuse to load with a hardcoded
// fallback so encrypted connector credentials cannot be trivially decrypted by
// anyone with code access.
if (!ENCRYPTION_KEY_FROM_ENV && process.env.NODE_ENV === 'production') {
  throw new Error(
    'Connector credential encryption requires a dedicated CONNECTOR_ENCRYPTION_KEY ' +
      'in production. Refusing to start without one (JWT_SECRET reuse and hardcoded ' +
      'fallbacks are not permitted).'
  );
}

const ENCRYPTION_KEY = ENCRYPTION_KEY_FROM_ENV || 'default-dev-key-change-in-prod';

// Derive the AES key once per process. scryptSync is an intentionally expensive
// KDF; recomputing it on every encrypt/decrypt was pure overhead since the
// secret and salt are fixed. Cache keyed by the secret so a config change (or
// test that mutates the secret) still derives correctly. Salt/derivation are
// unchanged, so existing ciphertext remains decryptable.
const derivedKeyCache = new Map<string, Buffer>();

function getDerivedKey(secret: string): Buffer {
  let key = derivedKeyCache.get(secret);
  if (!key) {
    key = crypto.scryptSync(secret, 'salt', 32);
    derivedKeyCache.set(secret, key);
  }
  return key;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getDerivedKey(ENCRYPTION_KEY);
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
  const key = getDerivedKey(ENCRYPTION_KEY);
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
  // Live EU/global data connectors (close the geographic data gap).
  connectors.set('eudamed', new EudamedConnector());
  connectors.set('eu_ctis', new EuCtisConnector());
  connectors.set('pmda_reviews', new PMDAConnector());
  connectors.set('nmpa_cde', new NMPACDEConnector());
  connectors.set('veeva_vault', new VeevaVaultConnector());
  connectors.set('medidata_rave', new MedidataRaveConnector());
  connectors.set('sharepoint', new SharePointConnector());
  connectors.set('fhir-r4', new FHIRR4Connector());
  connectors.set('onedrive', new OneDriveConnector());
  connectors.set('google_drive', new GoogleDriveConnector());
  connectors.set('box', new BoxConnector());
  // Sponsored programs / research administration.
  connectors.set('grants_gov', new GrantsGovConnector());
  connectors.set('sam_exclusions', new SamExclusionsConnector());
  connectors.set('ellucian_banner', new EllucianBannerConnector());
}

/**
 * Get the connector catalog with per-org availability.
 */
export async function getConnectorCatalog(
  organizationId: number
): Promise<(ConnectorCatalogEntry & { configured: boolean; healthy: boolean })[]> {
  initializeConnectors();

  // Which connectors have stored credentials for this org. A missing table
  // (42P01) is a legitimately-unprovisioned org → an empty credMap, a real
  // "nothing configured yet." Any OTHER error is a read failure and MUST
  // propagate: the deep-research board route needs to tell an unprovisioned
  // empty (→ catalog with everything unconfigured) from a failed read (→ 500 →
  // the surface's honest "connector inventory unknown due to a failure").
  // Swallowing a real failure to an empty credMap here served the full catalog
  // as though it were the org's real, all-configured inventory.
  let credRows: Array<{ connector_id: string; is_valid: boolean }> = [];
  try {
    const credResult = await pool.query(
      `SELECT connector_id, is_valid FROM connector_credentials WHERE organization_id = $1`,
      [organizationId]
    );
    credRows = credResult.rows as typeof credRows;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42P01') throw e;
    // else: table not provisioned — no credentials stored, empty credMap.
  }
  const credMap = new Map(credRows.map((r) => [r.connector_id, r.is_valid]));

  return CONNECTOR_CATALOG.map(entry => ({
    ...entry,
    configured: !entry.requiresCredentials || credMap.has(entry.id),
    healthy: credMap.get(entry.id) !== false,
  }));
}

/**
 * Reject a connector credential URL that points anywhere private/internal.
 *
 * SECURITY (SSRF, first of two defenses): tenant-supplied `baseUrl` /
 * `tokenEndpoint` are later fetched server-side. Block them at storage time so a
 * literal private/metadata destination (e.g. 169.254.169.254) can never be
 * persisted. The connector-level check (in each connector's authenticate/fetch)
 * is the second defense against DNS rebinding.
 *
 * Some connectors use `baseUrl` as a bare domain / tenant identifier rather than
 * a full URL (SharePoint host, Box enterprise id, Azure tenant id). Only values
 * that parse as an http(s) URL are validated; an http(s) URL that resolves to an
 * unsafe host (or any non-https scheme) is rejected.
 */
function assertSafeCredentialUrl(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) return;
  if (!/^https?:\/\//i.test(value)) return; // bare domain / tenant id — not a fetched URL here
  if (!isSafePublicUrl(value)) {
    throw new Error(
      `Connector ${label} must be a public https URL; private/loopback/link-local/metadata hosts and non-https are not allowed`
    );
  }
}

/**
 * Store encrypted credentials for a connector.
 *
 * @throws Error (surface as HTTP 400) if baseUrl / tokenEndpoint is unsafe.
 */
export async function storeCredentials(
  organizationId: number,
  connectorId: string,
  credentials: ConnectorCredentials
): Promise<void> {
  // SSRF guard at storage time (see assertSafeCredentialUrl).
  assertSafeCredentialUrl(credentials.baseUrl, 'baseUrl');
  assertSafeCredentialUrl(credentials.customHeaders?.['tokenEndpoint'], 'customHeaders.tokenEndpoint');

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
