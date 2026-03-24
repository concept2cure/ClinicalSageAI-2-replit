import crypto from 'crypto';
import { pool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('integration-credential-vault');

interface StoredCredentialRecord {
  credentialRef: string;
  tenantId: string;
  integrationId: string;
  encryptedPayload: string;
  keyVersion: string;
  createdAt: string;
  updatedAt: string;
}

const memoryStore = new Map<string, StoredCredentialRecord>();
let tableInitialized = false;

function getEncryptionKey(): Buffer {
  const raw = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY || process.env.AUDIT_SIGNING_KEY || 'dev-integration-credential-key-change-me';
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptPayload(payload: Record<string, string>): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

async function ensureCredentialTable(): Promise<boolean> {
  if (!pool) return false;
  if (tableInitialized) return true;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS enterprise_integration_credentials (
        credential_ref TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        integration_id TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        key_version TEXT NOT NULL DEFAULT 'v1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_eic_tenant_integration
      ON enterprise_integration_credentials (tenant_id, integration_id)
    `);

    tableInitialized = true;
    return true;
  } catch (error: any) {
    logger.warn('Failed to initialize credential table, using memory fallback', { error: error?.message });
    return false;
  }
}

export async function upsertCredentialRef(
  tenantId: string,
  integrationId: string,
  secrets: Record<string, string>,
  existingRef?: string
): Promise<{ credentialRef: string; keyVersion: string; storedKeys: string[] }> {
  const credentialRef = existingRef || `cred_${integrationId}_${crypto.randomBytes(6).toString('hex')}`;
  const keyVersion = 'v1';
  const encryptedPayload = encryptPayload(secrets);
  const storedKeys = Object.keys(secrets);

  const hasDb = await ensureCredentialTable();
  if (!hasDb || !pool) {
    const now = new Date().toISOString();
    memoryStore.set(`${tenantId}:${integrationId}:${credentialRef}`, {
      credentialRef,
      tenantId,
      integrationId,
      encryptedPayload,
      keyVersion,
      createdAt: now,
      updatedAt: now,
    });

    return { credentialRef, keyVersion, storedKeys };
  }

  await pool.query(
    `INSERT INTO enterprise_integration_credentials (
      credential_ref, tenant_id, integration_id, encrypted_payload, key_version, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (credential_ref)
    DO UPDATE SET
      encrypted_payload = EXCLUDED.encrypted_payload,
      key_version = EXCLUDED.key_version,
      updated_at = NOW()`,
    [credentialRef, tenantId, integrationId, encryptedPayload, keyVersion]
  );

  return { credentialRef, keyVersion, storedKeys };
}

export async function getCredentialRefs(tenantId: string, integrationId: string): Promise<Array<{
  credentialRef: string;
  keyVersion: string;
  createdAt: string;
  updatedAt: string;
}>> {
  const hasDb = await ensureCredentialTable();
  if (!hasDb || !pool) {
    return Array.from(memoryStore.values())
      .filter((record) => record.tenantId === tenantId && record.integrationId === integrationId)
      .map((record) => ({
        credentialRef: record.credentialRef,
        keyVersion: record.keyVersion,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }));
  }

  const { rows } = await pool.query(
    `SELECT credential_ref, key_version, created_at, updated_at
     FROM enterprise_integration_credentials
     WHERE tenant_id = $1 AND integration_id = $2
     ORDER BY updated_at DESC`,
    [tenantId, integrationId]
  );

  return rows.map((row: any) => ({
    credentialRef: row.credential_ref,
    keyVersion: row.key_version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}
