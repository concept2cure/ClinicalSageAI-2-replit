/** Governed writes for the existing SCIM provisioning credentials. */
import * as crypto from 'crypto';
import type { Request } from 'express';
import { pool } from '../db';
import { isPlatformAdmin } from '../middleware/requirePlatformAdmin';
import { writeChainedAuditRow } from './auditService';
import { clientIpOf } from '../utils/client-ip';

export interface ScimTokenRow {
  id: number; organization_id: number; label: string | null; enabled: boolean;
  created_at?: Date | string; updated_at?: Date | string;
}
export type ScimTokenChange = { reason: string } & (
  { kind: 'create'; organizationId: number; label: string | null } |
  { kind: 'rotate'; id: number } | { kind: 'update'; id: number; enabled: boolean } |
  { kind: 'delete'; id: number }
);
type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };
const metadata = (row: ScimTokenRow | null) => row ? { label: row.label, enabled: row.enabled } : null;

function credential() {
  const token = `scim_${crypto.randomBytes(32).toString('base64url')}`;
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

async function changeToken(client: Client, change: ScimTokenChange) {
  const secret = ['create', 'rotate'].includes(change.kind) ? credential() : null;
  let before: ScimTokenRow | null = null;
  if (change.kind === 'create') {
    const org = await client.query('SELECT id FROM organizations WHERE id = $1 FOR KEY SHARE', [change.organizationId]);
    if (Number(org.rows[0]?.id) !== change.organizationId) return null;
  } else {
    const selected = await client.query(`SELECT id, organization_id, label, enabled, created_at, updated_at FROM scim_tenants WHERE id = $1 FOR UPDATE`, [change.id]);
    before = selected.rows[0] as unknown as ScimTokenRow ?? null;
    if (!before) return null;
    if (!Number.isSafeInteger(before.organization_id) || before.organization_id < 1) throw new Error('SCIM token organization unknown');
  }
  const result = change.kind === 'create'
    ? await client.query(`INSERT INTO scim_tenants (organization_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id, organization_id, label, enabled, created_at, updated_at`,
      [change.organizationId, secret!.hash, change.label])
    : change.kind === 'delete'
      ? await client.query(`DELETE FROM scim_tenants WHERE id = $1 AND organization_id = $2 RETURNING id, organization_id, label, enabled, created_at, updated_at`, [change.id, before!.organization_id])
      : change.kind === 'rotate'
        ? await client.query(`UPDATE scim_tenants SET token_hash = $1, updated_at = now() WHERE id = $2 AND organization_id = $3 RETURNING id, organization_id, label, enabled, created_at, updated_at`,
          [secret!.hash, change.id, before!.organization_id])
        : await client.query(`UPDATE scim_tenants SET enabled = $1, updated_at = now() WHERE id = $2 AND organization_id = $3 RETURNING id, organization_id, label, enabled, created_at, updated_at`,
          [change.enabled, change.id, before!.organization_id]);
  const row = result.rows[0] as unknown as ScimTokenRow | undefined;
  if (!row) throw new Error('SCIM token mutation returned no record');
  return { row, before, after: change.kind === 'delete' ? null : row, token: secret?.token };
}

export class ScimTokenPolicyError extends Error {
  readonly status = 503;
  readonly code: 'SCIM_TOKEN_UNAVAILABLE' | 'SCIM_TOKEN_COMMIT_UNCONFIRMED';
  readonly recoveryUrl = '/api/admin/scim-tenants';
  constructor(commitStarted: boolean) {
    super(commitStarted
      ? 'The token change could not be confirmed. Reload the directory before a fresh action; a rotated secret may no longer be recoverable.'
      : 'The token change and its audit entry could not be committed. Nothing was changed.');
    this.code = commitStarted ? 'SCIM_TOKEN_COMMIT_UNCONFIRMED' : 'SCIM_TOKEN_UNAVAILABLE';
  }
}

async function recheckStanding(client: Client, req: Request, actorId: number) {
  if (isPlatformAdmin(req)) return;
  const standing = await client.query(`SELECT id FROM platform_role_grants
    WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2::text[]) FOR SHARE`,
  [actorId, ['super_admin', 'platform_admin', 'support']]);
  if (!standing.rows.length) throw new Error('SCIM platform standing no longer active');
}

/** Secrets are returned only after the credential and audit row commit together. */
export async function writeScimToken(req: Request, change: ScimTokenChange) {
  const actorId = Number(req.userId ?? req.user?.id);
  if (!Number.isSafeInteger(actorId) || actorId < 1 || change.reason.trim().length < 3 || change.reason.trim().length > 500) {
    throw new Error('SCIM token actor and reason are required');
  }
  const client = await pool.connect();
  let commitStarted = false;
  let released = false;
  try {
    await client.query('BEGIN');
    await recheckStanding(client, req, actorId);
    const changed = await changeToken(client, change);
    if (!changed) { await client.query('ROLLBACK'); return null; }
    await writeChainedAuditRow(client, {
      tenantId: changed.row.organization_id, userId: actorId,
      action: ({ create: 'scim_token_created', rotate: 'scim_token_rotated', update: 'scim_token_updated', delete: 'scim_token_revoked' })[change.kind],
      resourceType: 'scim_tenants', resourceId: String(changed.row.id),
      ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent'), reason: change.reason.trim(),
      details: { organizationId: changed.row.organization_id, previousPolicy: metadata(changed.before), currentPolicy: metadata(changed.after) },
    });
    commitStarted = true;
    await client.query('COMMIT');
    return { row: changed.row, token: changed.token };
  } catch (error) {
    if (commitStarted) {
      client.release(error instanceof Error ? error : new Error('SCIM token commit unconfirmed')); released = true;
    } else {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { client.release(rollbackError instanceof Error ? rollbackError : new Error('SCIM token rollback unconfirmed')); released = true; }
    }
    throw new ScimTokenPolicyError(commitStarted);
  } finally { if (!released) client.release(); }
}
