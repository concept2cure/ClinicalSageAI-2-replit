/**
 * @fileoverview Connector Registry
 * @module server/services/connectors/connector-registry
 *
 * Central registry for all data connectors. Manages connector instances,
 * credentials (encrypted per-org), and provides a unified search endpoint.
 */

import { pool } from '../../db.js';
import { createHash, createPrivateKey, randomUUID } from 'node:crypto';
import { isSafePublicUrl } from '../../utils/ssrfGuard.js';
import { encryptCredential, decryptCredential } from '../security/credential-cipher.js';
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

// Encryption lives in ../security/credential-cipher.ts (shared with the agency
// gateway accounts since 2026-10-01); it still refuses to load in production
// without CONNECTOR_ENCRYPTION_KEY.
const encrypt = encryptCredential;
const decrypt = decryptCredential;
export const decryptConnectorCredentials = decrypt;

type CredentialDb = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, any>> }> };
export type TenantModelProvider = 'anthropic' | 'openai' | 'moonshot';
export type CredentialPurpose = 'model_inference' | 'embedding' | 'connector_search' | 'connector_fetch' | 'connector_upload' | 'account_reference';
const EXISTING_CREDENTIAL_CARD_IDS = ['medidata_rave', 'fhir-r4', 'sam_exclusions', 'ellucian_banner', 'google_drive', 'box', 'onedrive', 'sharepoint'] as const;
type ExistingCredentialCardId = typeof EXISTING_CREDENTIAL_CARD_IDS[number];
type CredentialCardId = 'veeva_vault' | 'llm_anthropic' | 'llm_openai' | 'llm_moonshot' | 'clinical_trials_prs' | 'fda_portal' | ExistingCredentialCardId;
interface CredentialField { name: string; label: string; secret: boolean; required: boolean; multiline?: boolean }
interface CredentialCardSpec {
  id: CredentialCardId; name: string; kind: 'connector' | 'llm'; purpose: string;
  fields: CredentialField[]; scopes: CredentialPurpose[]; storageOnly?: boolean;
}
export const CREDENTIAL_CARD_SPECS: readonly CredentialCardSpec[] = [
  { id: 'veeva_vault', name: 'Veeva Vault', kind: 'connector', purpose: 'Access your organization’s own Veeva Vault.',
    fields: [{ name: 'baseUrl', label: 'Vault URL', secret: false, required: true },
      { name: 'username', label: 'Username', secret: false, required: false },
      { name: 'password', label: 'Password', secret: true, required: false },
      { name: 'apiKey', label: 'Session ID (alternative to username and password)', secret: true, required: false }],
    scopes: ['connector_search', 'connector_fetch', 'connector_upload'] },
  ...(['anthropic', 'openai', 'moonshot'] as const).map(provider => ({
    id: `llm_${provider}` as CredentialCardId, name: provider === 'anthropic' ? 'Claude / Anthropic' : provider === 'openai' ? 'OpenAI' : 'Kimi / Moonshot',
    kind: 'llm' as const, purpose: 'Run approved models under your organization’s own provider account.',
    fields: [{ name: 'apiKey', label: 'API key', secret: true, required: true }], scopes: provider === 'openai' ? ['model_inference' as const, 'embedding' as const] : ['model_inference' as const],
  })),
  ...(['clinical_trials_prs', 'fda_portal'] as const).map(id => ({ id,
    name: id === 'clinical_trials_prs' ? 'ClinicalTrials.gov PRS' : 'FDA portal', kind: 'connector' as const,
    purpose: 'Store your organization’s own portal login. Portal actions are not connected.', storageOnly: true,
    fields: [{ name: 'username', label: 'Username', secret: false, required: true }, { name: 'password', label: 'Password', secret: true, required: true }],
    scopes: ['account_reference' as const],
  })),
  // Reuse the existing operational catalog's schemas; administration moves to
  // this governed capture path without creating a second connector registry.
  ...CONNECTOR_CATALOG.filter(entry => EXISTING_CREDENTIAL_CARD_IDS.includes(entry.id as ExistingCredentialCardId)).map((entry): CredentialCardSpec => ({
    id: entry.id as ExistingCredentialCardId, name: entry.name, kind: 'connector',
    purpose: `Access your organization’s own ${entry.name} account.`,
    fields: (entry.setupGuide?.credentialFields ?? []).map(field => ({ name: field.field, label: field.label, secret: field.secret,
      required: field.required ?? !/optional/i.test(field.label), ...(field.multiline ? { multiline: true } : {}) })),
    scopes: ['google_drive', 'box', 'onedrive', 'sharepoint'].includes(entry.id)
      ? ['connector_search', 'connector_fetch', 'connector_upload'] : ['connector_search', 'connector_fetch'],
  })),
];
interface CredentialGrant {
  id: string; revision: string; organizationId: number; connectorId: string; scopes: CredentialPurpose[];
  expiresAt: string | null; revokedAt: string | null; grantedBy: number; accountOwner: 'client'; changedAt: string;
}
interface CredentialEnvelope { schema: 'client-credential-card-v1'; credentials: ConnectorCredentials; grant: CredentialGrant }
export interface CredentialCardView extends CredentialCardSpec {
  status: 'missing' | 'stored_unvalidated' | 'stored_not_connected' | 'expired' | 'revoked' | 'unavailable';
  grantedScopes: CredentialPurpose[]; expiresAt: string | null; lastChangedAt: string | null;
  secretFieldsHeld: string[]; canManage: boolean;
}
export class CredentialCardRefusal extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 403 | 409 | 503 = 409) {
    super(message); this.name = 'CredentialCardRefusal';
  }
}
const unavailableCredential = () => new CredentialCardRefusal('TENANT_CREDENTIAL_UNAVAILABLE', 'The organization’s credential grant is unavailable, expired, revoked or does not allow this purpose. Nothing was sent.');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
/** Shape only; current membership is checked independently before credential use. */
export const isCredentialActorId = positiveId;
const credentialDigest = (row: Record<string, unknown>) => createHash('sha256').update(JSON.stringify([row.credentials, row.is_valid])).digest('hex');
function cardSpec(id: string): CredentialCardSpec {
  const spec = CREDENTIAL_CARD_SPECS.find(item => item.id === id);
  if (!spec) throw new CredentialCardRefusal('CREDENTIAL_CARD_UNSUPPORTED', 'That credential card is not supported.', 400);
  return spec;
}
const validTimestamp = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validOptionalTimestamp = (value: unknown): boolean => value === null || validTimestamp(value);
const validGrantId = (value: unknown): boolean => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
function validateStoredGrant(grant: Record<string, unknown>, organizationId: number, connectorId: string): void {
  if (grant.organizationId !== organizationId || grant.connectorId !== connectorId || grant.accountOwner !== 'client'
    || !positiveId(grant.grantedBy) || !validGrantId(grant.id) || !validGrantId(grant.revision)) throw unavailableCredential();
  if (!validTimestamp(grant.changedAt) || !validOptionalTimestamp(grant.expiresAt) || !validOptionalTimestamp(grant.revokedAt)) throw unavailableCredential();
  const spec = CREDENTIAL_CARD_SPECS.find(card => card.id === connectorId);
  if (!spec || !Array.isArray(grant.scopes) || grant.scopes.some(scope => !(spec.scopes as unknown[]).includes(scope))) throw unavailableCredential();
}
function decodeCredentials(ciphertext: unknown, organizationId: number, connectorId: string): CredentialEnvelope | ConnectorCredentials {
  if (typeof ciphertext !== 'string') throw unavailableCredential();
  let value: unknown;
  try { value = JSON.parse(decrypt(ciphertext)); } catch { throw unavailableCredential(); }
  if (!record(value)) throw unavailableCredential();
  if (value.schema === undefined) return value as ConnectorCredentials;
  if (value.schema !== 'client-credential-card-v1' || !record(value.credentials) || !record(value.grant)) throw unavailableCredential();
  validateStoredGrant(value.grant, organizationId, connectorId);
  return value as unknown as CredentialEnvelope;
}
const isEnvelope = (value: CredentialEnvelope | ConnectorCredentials): value is CredentialEnvelope => 'schema' in value;
function usableGrant(envelope: CredentialEnvelope, purpose: CredentialPurpose): boolean {
  return envelope.grant.revokedAt === null && envelope.grant.scopes.includes(purpose)
    && (envelope.grant.expiresAt === null || Date.parse(envelope.grant.expiresAt) > Date.now());
}
function credentialCardView(spec: CredentialCardSpec, row: Record<string, unknown> | undefined, organizationId: number, canManage: boolean): CredentialCardView {
  const view: CredentialCardView = { ...spec, fields: spec.fields.map(field => ({ ...field })), scopes: [...spec.scopes],
    status: 'missing', grantedScopes: [], expiresAt: null, lastChangedAt: null, secretFieldsHeld: [], canManage };
  if (!row) return view;
  try {
    const value = decodeCredentials(row.credentials, organizationId, spec.id);
    const credentials = isEnvelope(value) ? value.credentials : value;
    view.secretFieldsHeld = spec.fields.filter(field => field.secret && typeof credentials[field.name as keyof ConnectorCredentials] === 'string'
      && Boolean(credentials[field.name as keyof ConnectorCredentials])).map(field => field.name);
    if (isEnvelope(value)) {
      view.grantedScopes = [...value.grant.scopes]; view.expiresAt = value.grant.expiresAt; view.lastChangedAt = value.grant.changedAt;
      view.status = value.grant.revokedAt !== null ? 'revoked' : value.grant.expiresAt !== null && Date.parse(value.grant.expiresAt) <= Date.now() ? 'expired'
        : row.is_valid === false ? 'unavailable' : spec.storageOnly ? 'stored_not_connected' : 'stored_unvalidated';
    } else {
      view.status = row.is_valid === false ? 'unavailable' : 'stored_unvalidated';
      view.lastChangedAt = row.created_at instanceof Date ? row.created_at.toISOString() : null;
    }
  } catch { view.status = 'unavailable'; }
  return view;
}
/** Metadata only. Decrypted values, ciphertext and fingerprints never leave this module. */
export async function listCredentialCards(organizationId: number, canManage: boolean, db: CredentialDb = pool): Promise<CredentialCardView[]> {
  if (!positiveId(organizationId)) throw unavailableCredential();
  const { rows } = await db.query('SELECT connector_id, credentials, is_valid, created_at FROM connector_credentials WHERE organization_id = $1', [organizationId]);
  return CREDENTIAL_CARD_SPECS.map(spec => credentialCardView(spec, rows.find(row => row.connector_id === spec.id), organizationId, canManage));
}
/** Current tenant standing, not a submitted role or platform-staff privilege. */
export async function currentCredentialCardRole(db: CredentialDb, organizationId: number, userId: number): Promise<string | null> {
  if (!positiveId(organizationId) || !positiveId(userId)) return null;
  const { rows } = await db.query(`SELECT ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id
    JOIN organizations o ON o.id = ou.organization_id
    WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active' AND o.status = 'active'`, [organizationId, userId]);
  return rows.length === 1 && typeof rows[0].role === 'string' && rows[0].role ? rows[0].role : null;
}
export async function mayManageCredentialCards(db: CredentialDb, organizationId: number, userId: number): Promise<boolean> {
  const role = await currentCredentialCardRole(db, organizationId, userId);
  return role !== null && ['admin', 'owner'].includes(role);
}
export interface CredentialCardChange {
  connectorId: string; action: 'capture' | 'rotate' | 'revoke'; credentials?: Record<string, unknown>;
  scopes?: string[]; expiresAt?: string | null; reason: string;
}
function cardChangeGrant(spec: CredentialCardSpec, change: CredentialCardChange) {
  if (!['capture', 'rotate', 'revoke'].includes(change.action) || typeof change.reason !== 'string' || change.reason.trim().length < 10) {
    throw new CredentialCardRefusal('CREDENTIAL_CHANGE_INVALID', 'Choose an action and provide a reason of at least 10 characters.', 400);
  }
  const scopes = [...new Set(change.scopes ?? spec.scopes)];
  if (change.action !== 'revoke' && (!scopes.length || scopes.some(scope => !(spec.scopes as string[]).includes(scope)))) {
    throw new CredentialCardRefusal('CREDENTIAL_SCOPE_INVALID', 'Choose only the listed purposes for this credential.', 400);
  }
  const expiresAt = change.action === 'revoke' || change.expiresAt == null || change.expiresAt === '' ? null : change.expiresAt;
  if (expiresAt !== null && (!validTimestamp(expiresAt) || Date.parse(expiresAt) <= Date.now())) {
    throw new CredentialCardRefusal('CREDENTIAL_EXPIRY_INVALID', 'The credential expiry must be a valid future date.', 400);
  }
  return { scopes: scopes as CredentialPurpose[], expiresAt };
}
function requiredCardFields(spec: CredentialCardSpec, credentials: Record<string, string>): void {
  const missing = spec.fields.some(field => field.required && !credentials[field.name])
    || (spec.kind === 'llm' && credentials.apiKey.length < 8)
    || (spec.id === 'veeva_vault' && !credentials.apiKey && !(credentials.username && credentials.password))
    || (spec.id === 'fhir-r4' && !credentials.apiKey && !(credentials.clientId && credentials.clientSecret));
  if (missing) throw new CredentialCardRefusal('CREDENTIAL_FIELDS_REQUIRED', 'Complete the required credential fields for this card.', 400);
  validateCardConfiguration(spec, credentials);
}
function validateCardConfiguration(spec: CredentialCardSpec, credentials: Record<string, string>): void {
  if (['veeva_vault', 'medidata_rave', 'fhir-r4', 'ellucian_banner'].includes(spec.id)) {
    let invalidUrl = !isSafePublicUrl(credentials.baseUrl);
    try { const url = new URL(credentials.baseUrl); invalidUrl ||= Boolean(url.username || url.password); } catch { invalidUrl = true; }
    if (invalidUrl) throw new CredentialCardRefusal('CREDENTIAL_URL_INVALID', 'Use a public HTTPS service URL without credentials in the address.', 400);
  }
  if (['sharepoint', 'onedrive'].includes(spec.id) && !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(credentials.tenantId)) {
    throw new CredentialCardRefusal('CREDENTIAL_FIELDS_INVALID', 'Use a valid Azure tenant identifier without URL or path characters.', 400);
  }
  if (spec.id === 'box' && !/^\d+$/.test(credentials.baseUrl)) {
    throw new CredentialCardRefusal('CREDENTIAL_FIELDS_INVALID', 'Use the numeric Box enterprise identifier.', 400);
  }
  if (spec.id === 'google_drive') {
    try {
      if (createPrivateKey(credentials.clientSecret.replace(/\\n/g, '\n')).asymmetricKeyType !== 'rsa') throw new Error('Invalid key type');
    } catch { throw new CredentialCardRefusal('CREDENTIAL_FIELDS_INVALID', 'Paste the complete RSA PEM private key from the Google service account key file.', 400); }
  }
}
function cardChangeCredentials(spec: CredentialCardSpec, change: CredentialCardChange): ConnectorCredentials {
  const credentials: Record<string, string> = {};
  if (change.action === 'revoke') return credentials;
  if (!record(change.credentials) || Object.keys(change.credentials).some(key => !spec.fields.some(field => field.name === key))) {
    throw new CredentialCardRefusal('CREDENTIAL_FIELDS_INVALID', 'Use only the fields listed for this credential card.', 400);
  }
  for (const [key, value] of Object.entries(change.credentials)) {
    if (typeof value !== 'string' || value.length > 16_384) throw new CredentialCardRefusal('CREDENTIAL_FIELDS_INVALID', 'Credential fields must be bounded text values.', 400);
    if (value.trim()) credentials[key] = value;
  }
  requiredCardFields(spec, credentials);
  if (spec.id === 'sharepoint' || spec.id === 'onedrive') {
    const { tenantId, ...fields } = credentials;
    return { ...fields, customHeaders: { [spec.id === 'sharepoint' ? 'X-Tenant-Id' : 'tenantId']: tenantId } };
  }
  return credentials;
}
function credentialFieldValues(credentials: ConnectorCredentials): string[] {
  return Object.values(credentials).flatMap(value => record(value) ? Object.values(value) : [value])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}
function credentialAuditVariants(value: string): string[] {
  // A PEM ends in a newline, while the person's reason may be trimmed or
  // pasted with different line endings. Redaction must cover each equivalent
  // representation without changing the credential bytes held for the SDK.
  const normalized = value.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
  return [value, value.trim(), normalized, normalized.trim(), normalized.replace(/\n/g, '\\n'), normalized.trim().replace(/\n/g, '\\n')].filter(Boolean);
}
function readablePriorCredentialFields(credentials: ConnectorCredentials): boolean {
  return Object.entries(credentials).every(([name, value]) => typeof value === 'string'
    || (name === 'customHeaders' && record(value) && Object.values(value).every(field => typeof field === 'string')));
}
function priorCardState(row: Record<string, any> | undefined, spec: CredentialCardSpec, organizationId: number) {
  if (!row) return { grant: undefined, values: [] as string[], unreadable: false };
  try {
    const value = decodeCredentials(row.credentials, organizationId, spec.id);
    const credentials = isEnvelope(value) ? value.credentials : value;
    const readable = readablePriorCredentialFields(credentials);
    return { grant: isEnvelope(value) ? value.grant : undefined,
      values: readable ? credentialFieldValues(credentials) : [], unreadable: !readable };
  } catch { return { grant: undefined, values: [] as string[], unreadable: true }; }
}
/** The caller owns BEGIN/COMMIT: the credential and its chained audit commit together. */
export async function writeCredentialCard(db: CredentialDb, organizationId: number, userId: number, change: CredentialCardChange): Promise<CredentialCardView> {
  if (!positiveId(organizationId) || !positiveId(userId)) throw unavailableCredential();
  if (!await mayManageCredentialCards(db, organizationId, userId)) throw new CredentialCardRefusal('CREDENTIAL_ADMIN_REQUIRED', 'Only this organization’s administrator can change its credential grants.', 403);
  const spec = cardSpec(change.connectorId);
  const { scopes, expiresAt } = cardChangeGrant(spec, change);
  const credentials = cardChangeCredentials(spec, change);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`client-credential:${organizationId}:${spec.id}`]);
  const before = await db.query('SELECT credentials, is_valid FROM connector_credentials WHERE organization_id = $1 AND connector_id = $2 FOR UPDATE', [organizationId, spec.id]);
  const prior = priorCardState(before.rows[0], spec, organizationId);
  const now = new Date().toISOString();
  const envelope: CredentialEnvelope = { schema: 'client-credential-card-v1', credentials,
    grant: { id: prior.grant?.id ?? randomUUID(), revision: randomUUID(), organizationId, connectorId: spec.id, scopes: change.action === 'revoke' ? [] : scopes as CredentialPurpose[],
      expiresAt: change.action === 'revoke' ? null : expiresAt, revokedAt: change.action === 'revoke' ? now : null,
      grantedBy: userId, accountOwner: 'client', changedAt: now } };
  const ciphertext = encrypt(JSON.stringify(envelope));
  await db.query(`INSERT INTO connector_credentials (organization_id, connector_id, credentials, is_valid, last_validated_at, created_at)
    VALUES ($1,$2,$3,$4,NULL,NOW()) ON CONFLICT (organization_id,connector_id)
    DO UPDATE SET credentials = EXCLUDED.credentials, is_valid = EXCLUDED.is_valid, last_validated_at = NULL`,
  [organizationId, spec.id, ciphertext, change.action === 'revoke' ? false : null]);
  let reason = change.reason.trim();
  const heldValues = [...new Set([...prior.values, ...credentialFieldValues(credentials)].flatMap(credentialAuditVariants))].sort((a, b) => b.length - a.length);
  for (const value of heldValues) reason = reason.split(value).join('[redacted]');
  // Unknown prior values cannot be safely removed from arbitrary free text.
  if (prior.unreadable) reason = 'Credential changed; reason withheld because prior credentials could not be read.';
  const { writeChainedAuditRow } = await import('../auditService.js');
  await writeChainedAuditRow(db, { tenantId: organizationId, userId, action: `credential.${change.action}`,
    resourceType: 'connector_credential_grant', resourceId: spec.id, reason,
    details: { credentialId: spec.id, grantId: envelope.grant.id, revision: envelope.grant.revision,
      scopes: envelope.grant.scopes, expiresAt: envelope.grant.expiresAt, revokedAt: envelope.grant.revokedAt,
      accountOwner: 'client', reauthenticated: true, secretFieldsChanged: spec.fields.filter(field => field.secret && field.name in credentials).map(field => field.name) } });
  return credentialCardView(spec, { credentials: ciphertext, is_valid: change.action === 'revoke' ? false : null }, organizationId, true);
}

/** Internal deterministic use only; a serializable object cannot reproduce its authority. */
export interface CapturedCredentialUse { credentials: ConnectorCredentials }
const credentialUses = new WeakMap<CapturedCredentialUse, { organizationId: number; connectorId: string; purpose: CredentialPurpose; digest: string; grant?: CredentialGrant }>();
export async function captureCredentialForUse(organizationId: number, connectorId: string, purpose: CredentialPurpose, db: CredentialDb = pool): Promise<CapturedCredentialUse | null> {
  if (!positiveId(organizationId)) throw unavailableCredential();
  if (CREDENTIAL_CARD_SPECS.some(spec => spec.id === connectorId && spec.storageOnly)) throw unavailableCredential();
  let row: Record<string, any> | undefined;
  try { row = (await db.query('SELECT credentials, is_valid FROM connector_credentials WHERE organization_id = $1 AND connector_id = $2', [organizationId, connectorId])).rows[0]; }
  catch { throw unavailableCredential(); }
  if (!row) return null;
  const value = decodeCredentials(row.credentials, organizationId, connectorId);
  if (row.is_valid === false || (isEnvelope(value) && !usableGrant(value, purpose))) throw unavailableCredential();
  if (connectorId.startsWith('llm_') && !isEnvelope(value)) throw unavailableCredential();
  const captured = Object.freeze({ credentials: Object.freeze({ ...(isEnvelope(value) ? value.credentials : value) }) });
  credentialUses.set(captured, { organizationId, connectorId, purpose, digest: credentialDigest(row), ...(isEnvelope(value) ? { grant: value.grant } : {}) });
  return captured;
}
/** Fresh grant/revision check, audited before the deterministic external use. */
export async function assertCredentialUseCurrent(captured: CapturedCredentialUse, userId?: number, auditUse = true, db: CredentialDb = pool): Promise<void> {
  const authority = credentialUses.get(captured);
  if (!authority) throw unavailableCredential();
  const current = async () => {
    if (userId !== undefined) {
      if (!await currentCredentialCardRole(db, authority.organizationId, userId)) throw unavailableCredential();
    } else {
      const standing = await db.query("SELECT id FROM organizations WHERE id = $1 AND status = 'active'", [authority.organizationId]);
      if (standing.rows.length !== 1 || Number(standing.rows[0].id) !== authority.organizationId) throw unavailableCredential();
    }
    let row: Record<string, any> | undefined;
    try { row = (await db.query('SELECT credentials, is_valid FROM connector_credentials WHERE organization_id = $1 AND connector_id = $2', [authority.organizationId, authority.connectorId])).rows[0]; }
    catch { throw unavailableCredential(); }
    if (!row || credentialDigest(row) !== authority.digest || row.is_valid === false) throw unavailableCredential();
    const value = decodeCredentials(row.credentials, authority.organizationId, authority.connectorId);
    if (isEnvelope(value) && !usableGrant(value, authority.purpose)) throw unavailableCredential();
  };
  await current();
  if (authority.grant && auditUse) {
    const { recordAuditRow } = await import('../audit/audit-write-outcome.js');
    const written = await recordAuditRow({ tenantId: authority.organizationId, userId, action: 'credential.use',
      resourceType: 'connector_credential_grant', resourceId: authority.connectorId,
      details: { credentialId: authority.connectorId, grantId: authority.grant.id, revision: authority.grant.revision, purpose: authority.purpose, accountOwner: 'client' } });
    if (!written.persisted || !written.chained) throw unavailableCredential();
    await current();
  }
}
/** A tenant with any model-card row has opted into customer-owned credentials;
 * revoked/expired/broken cards cannot silently charge the platform account. */
export async function resolveTenantModelCredentialAvailability(organizationId: number, db: CredentialDb = pool, purpose: 'model_inference' | 'embedding' = 'model_inference'): Promise<{ mode: 'platform' | 'customer_owned'; providers: TenantModelProvider[] }> {
  if (!positiveId(organizationId)) throw unavailableCredential();
  let rows: Array<Record<string, any>>;
  try { rows = (await db.query("SELECT connector_id, credentials, is_valid FROM connector_credentials WHERE organization_id = $1 AND connector_id IN ('llm_anthropic','llm_openai','llm_moonshot')", [organizationId])).rows; }
  catch { throw unavailableCredential(); }
  if (!rows.length) return { mode: 'platform', providers: [] };
  const providers: TenantModelProvider[] = [];
  for (const row of rows) {
    try {
      const value = decodeCredentials(row.credentials, organizationId, String(row.connector_id));
      if (isEnvelope(value) && row.is_valid !== false && usableGrant(value, purpose) && typeof value.credentials.apiKey === 'string' && value.credentials.apiKey) {
        providers.push(String(row.connector_id).slice(4) as TenantModelProvider);
      }
    } catch { /* A broken tenant card is unavailable, never a platform fallback. */ }
  }
  return { mode: 'customer_owned', providers };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

// How to build each connector. Never a shared instance: getAuthenticatedConnector
// writes the calling organization's credentials onto the instance, and the
// Drive, Box and OneDrive connectors keep their access token while it is
// valid — so one instance shared across tenants sent organization B's search
// out with organization A's token (D6, 2026-10-01). One instance per call.
const connectors: Map<string, () => DataConnector> = new Map();

function initializeConnectors(): void {
  if (connectors.size > 0) return;

  connectors.set('clinical_trials_gov', () => new ClinicalTrialsGovConnector());
  connectors.set('pubmed', () => new PubMedConnector());
  connectors.set('fda_drugs', () => new FDADrugsConnector());
  connectors.set('ema_epar', () => new EMAEPARConnector());
  // Live EU/global data connectors (close the geographic data gap).
  connectors.set('eudamed', () => new EudamedConnector());
  connectors.set('eu_ctis', () => new EuCtisConnector());
  connectors.set('pmda_reviews', () => new PMDAConnector());
  connectors.set('nmpa_cde', () => new NMPACDEConnector());
  connectors.set('veeva_vault', () => new VeevaVaultConnector());
  connectors.set('medidata_rave', () => new MedidataRaveConnector());
  connectors.set('sharepoint', () => new SharePointConnector());
  connectors.set('fhir-r4', () => new FHIRR4Connector());
  connectors.set('onedrive', () => new OneDriveConnector());
  connectors.set('google_drive', () => new GoogleDriveConnector());
  connectors.set('box', () => new BoxConnector());
  // Sponsored programs / research administration.
  connectors.set('grants_gov', () => new GrantsGovConnector());
  connectors.set('sam_exclusions', () => new SamExclusionsConnector());
  connectors.set('ellucian_banner', () => new EllucianBannerConnector());
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
  // is_valid: NULL = stored, never validated; false = marked invalid.
  let credRows: Array<{ connector_id: string; is_valid: boolean | null; credentials?: string }> = [];
  try {
    const credResult = await pool.query(
      `SELECT connector_id, is_valid, credentials FROM connector_credentials WHERE organization_id = $1`,
      [organizationId]
    );
    credRows = credResult.rows as typeof credRows;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42P01') throw e;
    // else: table not provisioned — no credentials stored, empty credMap.
  }
  const credMap = new Map(credRows.map(r => [r.connector_id, r.is_valid]));
  const unavailableGrants = new Set<string>();
  for (const row of credRows) {
    if (!row.credentials || !CREDENTIAL_CARD_SPECS.some(spec => spec.id === row.connector_id)) continue;
    try { const value = decodeCredentials(row.credentials, organizationId, row.connector_id);
      if (isEnvelope(value) && (row.is_valid === false || !usableGrant(value, 'connector_search'))) unavailableGrants.add(row.connector_id);
    } catch { unavailableGrants.add(row.connector_id); }
  }

  return CONNECTOR_CATALOG.map(entry => ({
    ...entry,
    // An unavailable connector has nothing behind it, so it is never
    // "configured": a credential-free entry used to read as connected.
    configured: entry.available !== false && !unavailableGrants.has(entry.id) && (!entry.requiresCredentials || credMap.has(entry.id)),
    healthy: !unavailableGrants.has(entry.id) && credMap.get(entry.id) !== false,
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
  if (CREDENTIAL_CARD_SPECS.some(spec => spec.id === connectorId)) {
    throw new CredentialCardRefusal('SECURE_CAPTURE_REQUIRED', 'Use the administrator’s re-authenticated credential card to change this account.', 403);
  }
  // SSRF guard at storage time (see assertSafeCredentialUrl).
  assertSafeCredentialUrl(credentials.baseUrl, 'baseUrl');
  assertSafeCredentialUrl(
    credentials.customHeaders?.['tokenEndpoint'],
    'customHeaders.tokenEndpoint'
  );

  const encrypted = encrypt(JSON.stringify(credentials));

  // 2026-10-15: wrote is_valid = true, last_validated_at = NOW() with no
  // validation call. Nothing here validates, so a stored or replaced credential
  // is unvalidated: both NULL (explicitly — the column defaults to true).
  await pool.query(
    `INSERT INTO connector_credentials (organization_id, connector_id, credentials, is_valid, last_validated_at, created_at)
     VALUES ($1, $2, $3, NULL, NULL, NOW())
     ON CONFLICT (organization_id, connector_id)
     DO UPDATE SET credentials = $3, is_valid = NULL, last_validated_at = NULL`,
    [organizationId, connectorId, encrypted]
  );
}

/**
 * A new connector instance, authenticated with this organization's own
 * credentials. Never reused across calls or tenants.
 */
async function getAuthenticatedConnector(
  organizationId: number,
  connectorId: string,
  userId: number | undefined
): Promise<{ connector: DataConnector; credentialUse?: CapturedCredentialUse } | null> {
  initializeConnectors();
  const make = connectors.get(connectorId);
  if (!make) return null;
  const connector = make();
  let credentialUse: CapturedCredentialUse | undefined;

  // Load credentials if needed. A stored credential is unvalidated (NULL) until
  // a call proves it; the search is that call. Only one marked invalid is withheld.
  if (connector.requiresCredentials) {
    const captured = await captureCredentialForUse(organizationId, connectorId, 'connector_search');
    if (!captured) return null;
    await assertCredentialUseCurrent(captured, userId);
    credentialUse = captured;
    await connector.authenticate(captured.credentials);
  }

  return { connector, credentialUse };
}

/**
 * Search across multiple connectors in parallel.
 * Provider failures can echo submitted secrets. Return a fixed failure and
 * only its numeric HTTP status; never forward arbitrary exception text into
 * agent context, API responses or the turn's trace (§19 trust boundary).
 */
export async function searchConnectors(
  organizationId: number,
  connectorIds: string[],
  query: ConnectorQuery,
  actorUserId: number | null
): Promise<{ connectorId: string; results: ConnectorResult[]; error?: string }[]> {
  if (actorUserId !== null && !positiveId(actorUserId)) throw unavailableCredential();
  const userId = actorUserId === null ? undefined : actorUserId;
  initializeConnectors();

  const searchPromises = connectorIds.map(async connectorId => {
    try {
      const authenticated = await getAuthenticatedConnector(organizationId, connectorId, userId);
      if (!authenticated) {
        return { connectorId, results: [], error: 'Connector not available or not configured' };
      }
      if (authenticated.credentialUse) await assertCredentialUseCurrent(authenticated.credentialUse, userId, false);
      const results = await authenticated.connector.search(query);
      return { connectorId, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const match = /\bHTTP\s+([1-5]\d{2})\b|\b(?:error|failed):\s*([1-5]\d{2})\b/i.exec(message);
      const status = match?.[1] ?? match?.[2];
      const error = `Connector search failed${status ? ` (HTTP ${status})` : ''}. Check the connection settings and try again.`;
      return { connectorId, results: [], error };
    }
  });

  return Promise.all(searchPromises);
}

export default {
  getConnectorCatalog,
  storeCredentials,
  searchConnectors,
};
