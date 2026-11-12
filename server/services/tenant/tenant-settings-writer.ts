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
import type { RequestSqlClient } from '../../db/requestDb';
import { writeChainedAuditRow } from '../auditService';
import { ConnectorSettingRefusedError, claudeConnectorChanged } from '../../mcp/auth/connector-enablement';
import { companyDocumentsAuditDetails } from '../company-documents/provenance';
import { AggregateLearningRefusedError, assertRecordedLearningConsent, learningClassOf, learningContributionPolicyOf, recordPatternContribution, type LearningContributionPolicy } from '../intelligence/ana-failure-learning';

export type Settings = Record<string, unknown>;

export function asSettings(value: unknown): Settings {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};
}

export const DISCOVERY_NOT_A_GENERAL_SETTING = 'Save shared discovery answers through the onboarding questionnaire.';

/** All general settings doors refuse this managed section, even a null. */
export function namesOnboardingDiscovery(value: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(asSettings(value), 'onboardingDiscovery');
}

export class DiscoverySettingRefusedError extends Error {
  constructor() {
    super(DISCOVERY_NOT_A_GENERAL_SETTING);
    this.name = 'DiscoverySettingRefusedError';
  }
}

export const COMPANY_DOCUMENTS_NOT_A_GENERAL_SETTING = 'Manage company identity, letterhead and legal versions through Company documents.';
export function namesCompanyDocuments(value: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(asSettings(value), 'companyDocuments');
}

export const DERIVATIVE_CUSTODY_NOT_A_GENERAL_SETTING = 'Manage derivative custody through the governed AI placement policy controls.';

export class DerivativeCustodySettingRefusedError extends Error {
  constructor() {
    super(DERIVATIVE_CUSTODY_NOT_A_GENERAL_SETTING);
    this.name = 'DerivativeCustodySettingRefusedError';
  }
}
export class LearningContributionSettingRefusedError extends Error {
  constructor() { super('Manage aggregate-learning contributions through the governed AI data-use controls.'); this.name = 'LearningContributionSettingRefusedError'; }
}

/** A setting whose stored value is a credential: an API key, a secret, a token, a password, a webhook URL. */
const CREDENTIAL_KEY = /(api[-_]?key|secret|token|password|passphrase|webhook|private[-_]?key|credential)/i;

/**
 * A copy of `value` with every stored credential withheld. The field stays, empty, beside `<field>Configured: true`,
 * so a reader learns that one is stored and never what it is. Only a stored string is a credential: a policy object
 * under a matching name (`passwordPolicy`) is read as it is.
 */
function withoutStoredCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutStoredCredentials);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (typeof held === 'string' && CREDENTIAL_KEY.test(key)) {
      out[key] = '';
      if (held.trim()) out[`${key}Configured`] = true;
    } else out[key] = withoutStoredCredentials(held);
  }
  return out;
}

/** What only an organization's administrators read: its integrations and the network addresses it admits. */
const ADMINISTRATOR_ONLY_SECURITY = ['ipWhitelist', 'ipRestrictions'];

/**
 * Generic settings reads cannot expose project-scoped libraries or derivative custody, and never a stored
 * credential (role walk, 2026-11-12: GET /api/organizations/:id/settings returned `integrations.docusign.apiKey`
 * and `integrations.slack.webhookUrl` as stored, to every member and viewer). A reader who is not an administrator
 * also gets no `integrations` section and no network allowlist; the session and review policies their screens
 * read stay.
 */
export function generalSettingsView(value: unknown, reader: { administrator: boolean } = { administrator: true }): Settings {
  const view = withoutStoredCredentials(Object.fromEntries(Object.entries(asSettings(value))
    .filter(([key]) => !['companyDocuments', 'derivativeCustody', 'learningContributionPolicy'].includes(key)))) as Settings;
  if (reader.administrator) return view;
  const rest: Settings = Object.fromEntries(Object.entries(view).filter(([key]) => key !== 'integrations'));
  if (rest.security && typeof rest.security === 'object' && !Array.isArray(rest.security)) {
    rest.security = Object.fromEntries(Object.entries(rest.security as Record<string, unknown>)
      .filter(([key]) => !ADMINISTRATOR_ONLY_SECURITY.includes(key)));
  }
  return rest;
}

export class CompanyDocumentsSettingRefusedError extends Error {
  constructor() {
    super(COMPANY_DOCUMENTS_NOT_A_GENERAL_SETTING);
    this.name = 'CompanyDocumentsSettingRefusedError';
  }
}

/**
 * The settings whose values a write's audit row carries, before and after
 * (P1-41, DP-57): the organisation's access-control posture and its audit-trail
 * retention. Every other setting is recorded by section and field NAME only —
 * notifications carry webhook URLs, which are credentials, and a value recorded
 * in an append-only chain can never be removed.
 */
const VALUE_AUDITED: Readonly<Record<string, readonly string[]>> = {
  // independentReviewersRequired and soleMemberSelfApproval are the organisation's review rules (P-117).
  security: [
    'mfaRequired', 'passwordPolicy', 'sessionTimeoutMinutes', 'maxConcurrentSessions', 'ipRestrictions',
    'independentReviewersRequired', 'soleMemberSelfApproval',
  ],
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
  next: (current: Settings, tier: string) => Settings | Promise<Settings>;
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
  /** Only PATCH /api/onboarding/discovery supplies this managed-section door. */
  discoveryDoor?: true;
  /** Only the validated company-documents profile/registry writer supplies this. */
  companyDocumentsDoor?: true;
  /** Internal canonical registry proof captured under the same settings lock.
   * Never accepted from HTTP input; only the managed company door can use it. */
  companyDocumentsAudit?: () => ReturnType<typeof companyDocumentsAuditDetails>;
  /** Internal composition only: runs on the locked settings transaction before
   * commit. A failed provenance, permission or projection write rolls back the
   * settings and its audit record together. Never populated from HTTP input. */
  beforeCommit?: (client: RequestSqlClient, current: Settings, stored: Settings) => Promise<void>;
}

function managedSnapshot(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertManagedValue(before: unknown, after: unknown, door: boolean | undefined, refusal: () => Error): void {
  if (!door && !isDeepStrictEqual(before, after)) throw refusal();
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
    // A callback may build its result by mutating the object it was given.
    // Keep this managed JSON value before invoking it, so in-place mutation
    // cannot make the before/after comparison accidentally see the same value.
    const discoveryBefore = managedSnapshot(current.onboardingDiscovery);
    const companyDocumentsBefore = managedSnapshot(current.companyDocuments);
    const derivativeCustodyBefore = managedSnapshot(current.derivativeCustody);
    const learningPolicyBefore = managedSnapshot(current.learningContributionPolicy);
    const next = await change.next(current, tenant.tier || 'standard');
    // The connector for Claude has one door (P1-47 fix round, 2026-10-01,
    // IAM-24). A write from any other door that would change it, on, off, null
    // or removed, is refused here, before anything is written or recorded, so
    // a settings door that forgets its own check (the AnA controller's arbitrary
    // keys, a door added later) cannot open it.
    if (!change.connectorDoor && claudeConnectorChanged(current, next)) {
      throw new ConnectorSettingRefusedError();
    }
    // The questionnaire has one write door because revision/completion and
    // server-owned attribution must not be rewritten by generic settings or
    // an AnA tool. Keep a stored discovery intact on resets and unrelated edits.
    assertManagedValue(discoveryBefore, next.onboardingDiscovery, change.discoveryDoor, () => new DiscoverySettingRefusedError());
    assertManagedValue(companyDocumentsBefore, next.companyDocuments, change.companyDocumentsDoor, () => new CompanyDocumentsSettingRefusedError());
    // The dedicated placement writer holds its own settings lock and audit.
    // Generic/admin/model settings mutations never acquire its custody authority.
    assertManagedValue(derivativeCustodyBefore, next.derivativeCustody, false, () => new DerivativeCustodySettingRefusedError());
    assertManagedValue(learningPolicyBefore, next.learningContributionPolicy, false, () => new LearningContributionSettingRefusedError());
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
      details: {
        ...settingsAuditDetails(current, stored, change.sections(current, stored)),
        ...(change.companyDocumentsDoor ? {
          companyDocuments: change.companyDocumentsAudit?.() ?? companyDocumentsAuditDetails(companyDocumentsBefore, stored.companyDocuments, tenant.name || ''),
        } : {}),
      },
      ...(change.reason ? { reason: change.reason } : {}),
    });
    if (change.beforeCommit) await change.beforeCommit(client, current, stored);
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

/** The route verifies fresh human reauthentication; this transaction rechecks persisted administration. */
export async function writeLearningContributionPolicy(pool: {
  connect(): Promise<RequestSqlClient & { release(error?: Error): void }>;
}, organizationId: number, userId: number, raw: unknown): Promise<LearningContributionPolicy> {
  const body = { ...asSettings(raw) };
  if (Object.keys(body).some(key => !['enabled', 'expectedVersion', 'reasonForChange'].includes(key)) ||
      typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
      typeof body.reasonForChange !== 'string' || body.reasonForChange.trim().length < 8 || body.reasonForChange.length > 2000) {
    throw new AggregateLearningRefusedError(400);
  }
  const q = await pool.connect();
  let commitAttempted = false, discard: Error | undefined;
  try {
    await q.query('BEGIN');
    const org = await q.query("SELECT settings FROM organizations WHERE id=$1 AND status='active' FOR UPDATE", [organizationId]);
    if (org.rows.length !== 1) throw new AggregateLearningRefusedError();
    const { resolveSignerOrgRole } = await import('../part11/resolve-signer-role');
    const role = await resolveSignerOrgRole(userId, organizationId, q);
    if (!role || !['admin', 'owner'].includes(role)) throw new AggregateLearningRefusedError();
    const settings = asSettings(org.rows[0].settings), previous = learningContributionPolicyOf(settings);
    await assertRecordedLearningConsent(q, organizationId, previous);
    if (previous.version !== body.expectedVersion) throw new AggregateLearningRefusedError(409);
    const policy = { enabled: body.enabled, version: previous.version + 1 };
    await q.query('UPDATE organizations SET settings=$2::jsonb WHERE id=$1', [organizationId,
      JSON.stringify({ ...settings, learningContributionPolicy: policy })]);
    await writeChainedAuditRow(q, { tenantId: organizationId, userId, action: 'ana_pattern.contribution_policy',
      resourceType: 'aggregate_learning', resourceId: String(organizationId), reason: body.reasonForChange,
      details: { previous, policy } });
    commitAttempted = true;
    await q.query('COMMIT');
    return policy;
  } catch (error) {
    if (commitAttempted) {
      discard = new Error('Aggregate learning policy commit acknowledgement unavailable');
      throw new AggregateLearningRefusedError(503);
    }
    await q.query('ROLLBACK').catch(() => { discard = new Error('Aggregate learning policy rollback unavailable'); });
    throw error;
  } finally { q.release(discard); }
}

export async function writeLearningPatternContribution(pool: {
  connect(): Promise<RequestSqlClient & { release(error?: Error): void }>;
}, organizationId: number, userId: number, raw: unknown) {
  const body = { ...asSettings(raw) }, entry = learningClassOf(body.classKey);
  if (Object.keys(body).some(key => !['classKey', 'sourceAuditEventId', 'reasonForChange'].includes(key)) ||
      typeof body.sourceAuditEventId !== 'string' || typeof body.reasonForChange !== 'string' ||
      body.reasonForChange.trim().length < 8 || body.reasonForChange.length > 2000) throw new AggregateLearningRefusedError(400);
  const q = await pool.connect();
  let commitAttempted = false, discard: Error | undefined;
  try {
    await q.query('BEGIN');
    const result = await recordPatternContribution(q, { organizationId, userId, classKey: entry.key,
      sourceAuditEventId: body.sourceAuditEventId, reasonForChange: body.reasonForChange });
    commitAttempted = true;
    await q.query('COMMIT');
    return result;
  } catch (error) {
    if (commitAttempted) { discard = new Error('Pattern contribution commit acknowledgement unavailable'); throw new AggregateLearningRefusedError(503); }
    await q.query('ROLLBACK').catch(() => { discard = new Error('Pattern contribution rollback unavailable'); });
    throw error;
  } finally { q.release(discard); }
}
