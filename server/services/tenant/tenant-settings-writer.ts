/**
 * The one writer of an organisation's settings (`organizations.settings`), and
 * the record of each write.
 *
 * Moved here from server/routes/tenant-config.ts on 2026-10-01 (P1-49, DP-58;
 * 21 CFR 11.10(e), EU GMP Annex 11 §12.4) so that every settings door uses it:
 * the tenant configuration routes (routes/tenant-config.ts) and the AnA platform
 * controller (services/ana-platform-controller.ts, mounted by
 * routes/ana-platform-control.ts). The controller had its own writer: a merge
 * on the shared pool and, after it, a best-effort `ana:update_settings` row that
 * a failure did not stop, so a configuration change could be made with no
 * record of it. Nothing here changed in the move; the route behaves as before.
 */
import { isDeepStrictEqual } from 'node:util';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { organizations } from '../../../shared/schema';
import { governedActorId } from '../../middleware/orgMembership';
import { clientIpOf } from '../../utils/client-ip';
import { requestDb, requestPgClient } from '../../db/requestDb';
import { writeChainedAuditRow } from '../auditService';
import { ConnectorSettingRefusedError, claudeConnectorChanged } from '../../mcp/auth/connector-enablement';

export type Settings = Record<string, unknown>;

export function asSettings(value: unknown): Settings {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};
}

/**
 * The settings whose values a write's audit row carries, before and after
 * (P1-41, DP-57): the organisation's access-control posture and its audit-trail
 * retention. Every other setting is recorded by section and field NAME only —
 * notifications carry webhook URLs, which are credentials, and a value recorded
 * in an append-only chain can never be removed.
 */
const VALUE_AUDITED: Readonly<Record<string, readonly string[]>> = {
  security: ['mfaRequired', 'passwordPolicy', 'sessionTimeoutMinutes', 'ipRestrictions'],
  qmp: ['auditTrailRetentionDays'],
  // Whether the organisation's members may use the connector for Claude, set by
  // its owner or administrator (P1-47, ADR-0014 §10; mcp/auth/connector-enablement.ts).
  claudeConnector: ['enabled'],
  // The AnA tools the organisation allows or switches off (routes/ana-tool-policy.ts):
  // the row carries the policy before and after, as that door's own row did.
  anaToolPolicy: ['allow', 'deny'],
};

function pick(section: Settings, keys: readonly string[]): Settings {
  return Object.fromEntries(keys.map(k => [k, section[k] ?? null]));
}

/** The names, never the values, of a section's fields whose stored value differs. */
function changedFieldNames(before: unknown, after: unknown): string[] {
  const b = asSettings(before);
  const a = asSettings(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter(k => !isDeepStrictEqual(b[k], a[k]))
    .sort();
}

/** What a settings write's audit row records: the sections written, the changed field names, and the audited values. */
function settingsAuditDetails(before: Settings, after: Settings, sections: string[]) {
  const changedFields: Record<string, string[]> = {};
  const values: Record<string, { before: Settings; after: Settings }> = {};
  for (const section of sections) {
    const fields = changedFieldNames(before[section], after[section]);
    if (fields.length > 0) changedFields[section] = fields;
    const audited = VALUE_AUDITED[section];
    if (audited) {
      values[section] = {
        before: pick(asSettings(before[section]), audited),
        after: pick(asSettings(after[section]), audited),
      };
    }
  }
  return { sections, changedFields, values };
}

export interface SettingsWrite {
  /** 'ana_tool_policy.update' is the tool-policy door's (routes/ana-tool-policy.ts), the name audit.explain reads. */
  action: 'tenant_settings_changed' | 'tenant_settings_reset' | 'ana_tool_policy.update';
  /** The settings to store, from those stored now and the tenant's tier. */
  next: (current: Settings, tier: string) => Settings;
  /** The sections this write names, given what was stored and what will be. */
  sections: (current: Settings, next: Settings) => string[];
  /**
   * The reason the door was given for the change, recorded on the row's
   * reason column (PATCH /api/organizations/:id/settings's governed form, DP-73).
   */
  reason?: string | null;
  /**
   * Set by the connector for Claude's own door only
   * (PUT /api/tenant-config/:tenantId/claude-connector; P1-47, ADR-0014 §10).
   * Any other write that would change that setting is refused below.
   */
  connectorDoor?: true;
}

/**
 * One settings write: the stored settings read under a row lock, the new ones
 * written, and the write's chained audit row — one transaction on the request's
 * own connection (requestDb is Drizzle over that same client), so the change
 * and its record commit or roll back together. A refused audit row throws and
 * the write is rolled back. Null when there is no such tenant.
 */
export async function writeTenantSettings(req: Request, tenantId: number, change: SettingsWrite): Promise<Settings | null> {
  const client = requestPgClient(req);
  const rdb = requestDb(req);
  await client.query('BEGIN');
  try {
    const [tenant] = await rdb
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1)
      .for('update');
    if (!tenant) {
      await client.query('ROLLBACK');
      return null;
    }
    const current = asSettings(tenant.settings);
    const next = change.next(current, tenant.tier || 'standard');
    // The connector for Claude has one door (P1-47 fix round, 2026-10-01,
    // IAM-24). A write from any other door that would change it, on, off, null
    // or removed, is refused here, before anything is written or recorded, so
    // a settings door that forgets its own check (the AnA controller's arbitrary
    // keys, a door added later) cannot open it.
    if (!change.connectorDoor && claudeConnectorChanged(current, next)) {
      throw new ConnectorSettingRefusedError();
    }
    const [updated] = await rdb
      .update(organizations)
      .set({ settings: next })
      .where(eq(organizations.id, tenantId))
      .returning();
    if (!updated) {
      await client.query('ROLLBACK');
      return null;
    }
    const stored = asSettings(updated.settings);
    await writeChainedAuditRow(client, {
      tenantId,
      userId: governedActorId(req) ?? undefined,
      action: change.action,
      resourceType: 'organization_settings',
      resourceId: String(tenantId),
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.get('user-agent'),
      details: settingsAuditDetails(current, stored, change.sections(current, stored)),
      ...(change.reason ? { reason: change.reason } : {}),
    });
    await client.query('COMMIT');
    return stored;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

function isPlainObject(value: unknown): value is Settings {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `patch` laid over `current`: where both hold an object the merge recurses,
 * otherwise `patch`'s value wins, and a key `patch` does not name is kept.
 * Until 2026-10-01 (DP-62) a reset replaced the whole object and a PATCH the
 * whole section, which erased `anaToolPolicy` (the organisation's switch-off
 * list for AnA tools) and `security.maxConcurrentSessions` (session-inactivity.ts),
 * neither of which those writes manage.
 */
export function overlaySettings(current: Settings, patch: Settings): Settings {
  const out: Settings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value) ? overlaySettings(existing, value) : value;
  }
  return out;
}
