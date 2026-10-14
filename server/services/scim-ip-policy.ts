/** SCIM network policy changes and their chained record share the existing platform-admin transaction. */
import type { Request } from 'express';
import { transaction } from '../db';
import { writeChainedAuditRow } from './auditService';
import { clientIpOf } from '../utils/client-ip';

export interface ScimIpRuleRow {
  id: number; organization_id: number; cidr: string; label: string | null; enabled: boolean;
  created_at?: Date | string; updated_at?: Date | string;
}
type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: ScimIpRuleRow[] }> };
type Change = { kind: 'create'; organizationId: number; cidr: string; label: string | null; reason?: string } |
  { kind: 'update'; id: number; enabled: boolean; reason?: string } |
  { kind: 'delete'; id: number; reason?: string };

const policyOf = (row: ScimIpRuleRow | null) => row ? { cidr: row.cidr, label: row.label, enabled: row.enabled } : null;

async function changeRule(client: Client, change: Change): Promise<{ before: ScimIpRuleRow | null; after: ScimIpRuleRow | null } | null> {
  if (change.kind === 'create') {
    const organization = await client.query('SELECT id FROM organizations WHERE id = $1 FOR KEY SHARE', [change.organizationId]);
    if (Number(organization.rows[0]?.id) !== change.organizationId) return null;
    const inserted = await client.query(
      `INSERT INTO scim_ip_allowlist (organization_id, cidr, label) VALUES ($1, $2, $3)
       RETURNING id, organization_id, cidr, label, enabled, created_at, updated_at`,
      [change.organizationId, change.cidr, change.label],
    );
    if (!inserted.rows[0]) throw new Error('SCIM policy insert returned no row');
    return { before: null, after: inserted.rows[0] };
  }
  // The locked row proves the target organization; a request's body cannot redirect the mutation.
  const selected = await client.query(
    'SELECT id, organization_id, cidr, label, enabled FROM scim_ip_allowlist WHERE id = $1 FOR UPDATE', [change.id],
  );
  const before = selected.rows[0];
  if (!before) return null;
  if (!Number.isInteger(before.organization_id) || before.organization_id < 1) throw new Error('SCIM policy organization could not be confirmed');
  if (change.kind === 'delete') {
    const deleted = await client.query('DELETE FROM scim_ip_allowlist WHERE id = $1 AND organization_id = $2 RETURNING id', [change.id, before.organization_id]);
    if (!deleted.rows[0]) throw new Error('SCIM policy delete returned no row');
    return { before, after: null };
  }
  const updated = await client.query(
    `UPDATE scim_ip_allowlist SET enabled = $1, updated_at = now() WHERE id = $2 AND organization_id = $3
     RETURNING id, organization_id, cidr, label, enabled, created_at, updated_at`,
    [change.enabled, change.id, before.organization_id],
  );
  if (!updated.rows[0]) throw new Error('SCIM policy update returned no row');
  return { before, after: updated.rows[0] };
}

/** Called only behind authMiddleware + the unchanged DB-authoritative requirePlatformAdmin gate. */
export async function writeScimIpPolicy(req: Request, change: Change): Promise<ScimIpRuleRow | null> {
  const actorId = Number(req.userId ?? req.user?.id);
  if (!Number.isInteger(actorId) || actorId < 1) throw new Error('SCIM policy actor could not be confirmed');
  // This route's established system scope is inherited by db.transaction's pinned client.
  return transaction(async (client: Client) => {
    const changed = await changeRule(client, change);
    if (!changed) return null;
    const target = changed.after ?? changed.before!;
    await writeChainedAuditRow(client, {
      tenantId: target.organization_id, userId: actorId,
      action: ({ create: 'scim_ip_rule_created', update: 'scim_ip_rule_updated', delete: 'scim_ip_rule_deleted' })[change.kind],
      resourceType: 'scim_ip_allowlist', resourceId: String(target.id),
      ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent'), reason: change.reason,
      details: { organizationId: target.organization_id, previousPolicy: policyOf(changed.before), currentPolicy: policyOf(changed.after) },
    });
    return target;
  });
}
