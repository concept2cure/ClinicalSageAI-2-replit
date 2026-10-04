/**
 * Encryption for credentials an organisation stores with the platform: search
 * and data connectors (connector-registry.ts) and agency gateway accounts
 * (submission-gateways/gateway-accounts.ts). One implementation, moved here
 * unchanged from connector-registry.ts on 2026-10-01 (D7) so both use it:
 * AES-256-GCM, key derived once per process from CONNECTOR_ENCRYPTION_KEY, and
 * the same "iv:tag:ciphertext" hex format, so every existing ciphertext still
 * decrypts.
 */
import crypto from 'crypto';

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

export function encryptCredential(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getDerivedKey(ENCRYPTION_KEY);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptCredential(text: string): string {
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
