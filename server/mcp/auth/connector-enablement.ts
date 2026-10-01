/**
 * Whether an organisation has opened the connector for Claude to its members
 * (ADR-0014 §10; plan P1-47; row D8).
 *
 * Two switches, and both must be on. The deployment's (MCP_ENABLED with Claude's
 * redirect origins, LAUNCH_DEFINITION_OF_DONE.md product decision P-2) mounts the
 * connector at all. This one is the organisation's: until its owner or
 * administrator turns it on, the consent page refuses the organisation's
 * members, and a connector token or refresh token minted for the organisation
 * is refused at /mcp and at /token. A connector is a new path for tenant
 * content to leave the platform, to a client the customer controls, so the
 * customer, not the vendor, opens it.
 *
 * Stored at `organizations.settings.claudeConnector` as `{ enabled: boolean }`.
 * Changed through one door, PUT /api/tenant-config/:tenantId/claude-connector,
 * by the roles `mayChangeClaudeConnector` names, through the one settings writer
 * (services/tenant/tenant-settings-writer.ts) and its chained audit row. The
 * writer refuses any other write that would change it (ConnectorSettingRefusedError,
 * fix round 2026-10-01, IAM-24), so a settings door that forgets its own check
 * cannot open it. The general doors also refuse a body that names it, with 403:
 * tenant-config's PATCH /settings, the AnA controller's updateSettings, and
 * PATCH /api/organizations/:id/settings, which writes organizations.settings
 * without the shared writer and so depends on that check alone (DP-69). Read
 * on every request by the connector (auth/platform-token.ts), from the
 * organisation row its membership read already joins, so there is no cache to
 * outlive a change: turning it off refuses tokens already issued.
 *
 * Who opens it (IAM-25, decided by the product owner 2026-10-01; ADR-0014 §10).
 * The organisation's owner or administrator. `organization_users.role` holds
 * admin, manager, member or viewer, and no product path writes `owner` there:
 * sign-up and first-run setup make the organisation's creator `admin`. So a
 * connector only an owner could open stayed closed for every organisation.
 * The administrator is the customer's highest in-product role, so the customer,
 * not the vendor, still decides. `owner` stays on the list so that an owner
 * the platform provisions, if one ever exists, is not locked out. Roles are
 * compared exactly, as requireRole compares them: a manager, member or viewer,
 * platform staff (`super_admin`) and an administrator of another organisation
 * are refused (the route also checks the organisation).
 *
 * Absent means off, and so does anything other than the boolean `true` under an
 * object: a string "true", a bare `true` in place of the object, a null. A value
 * the connector's own door would not have written is not the organisation's decision.
 *
 * No I/O here, so the route, the settings writer and the connector apply the
 * same rule without any of them importing another.
 */

import { isDeepStrictEqual } from 'node:util';

/** The key under organizations.settings. */
export const CLAUDE_CONNECTOR_SETTING = 'claudeConnector';

/** The organisation roles that turn the connector on or off (ADR-0014 §10; IAM-25 above). */
export const CONNECTOR_OPENER_ROLES: readonly string[] = Object.freeze(['owner', 'admin']);

/** True only for a role on CONNECTOR_OPENER_ROLES, compared exactly. */
export function mayChangeClaudeConnector(role: unknown): boolean {
  return typeof role === 'string' && CONNECTOR_OPENER_ROLES.includes(role);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True when a settings patch names the connector, whatever the value. A door
 * that writes general settings refuses such a patch (403,
 * CONNECTOR_NOT_A_GENERAL_SETTING) rather than writing or silently dropping it.
 */
export function namesClaudeConnector(patch: unknown): boolean {
  return isPlainObject(patch) && Object.prototype.hasOwnProperty.call(patch, CLAUDE_CONNECTOR_SETTING);
}

/**
 * True when a settings write would change the stored connector setting in any
 * way: on, off, null, or the key removed. The settings writer refuses such a
 * write unless it is the connector's own door.
 */
export function claudeConnectorChanged(before: unknown, after: unknown): boolean {
  const b = isPlainObject(before) ? before[CLAUDE_CONNECTOR_SETTING] : undefined;
  const a = isPlainObject(after) ? after[CLAUDE_CONNECTOR_SETTING] : undefined;
  return !isDeepStrictEqual(b, a);
}

/** True only when the stored settings hold `claudeConnector: { enabled: true }`. */
export function claudeConnectorEnabled(settings: unknown): boolean {
  if (!isPlainObject(settings)) return false;
  const connector = settings[CLAUDE_CONNECTOR_SETTING];
  return isPlainObject(connector) && connector.enabled === true;
}

/**
 * What a member is told at consent, /mcp and /token while the connector is off.
 * It says what is so; who can change it is shown on the setting itself.
 */
export const CONNECTOR_NOT_ENABLED = 'The connector for Claude is not enabled for this organisation.';

/** What anyone else is told when they try to turn it on or off. */
export const CONNECTOR_OPENER_ONLY =
  "Only the organisation's owner or administrator can turn the connector for Claude on or off.";

/** What a door that writes general settings answers when the body names the connector. */
export const CONNECTOR_NOT_A_GENERAL_SETTING =
  "The connector for Claude is not changed here. It has a setting of its own, which only the organisation's owner or administrator can change.";

/**
 * Thrown by the settings writer when a write that is not the connector's own
 * door would change the connector setting. Nothing has been written or
 * recorded when it is thrown; the writer has rolled back.
 */
export class ConnectorSettingRefusedError extends Error {
  readonly code = 'CLAUDE_CONNECTOR_OWN_DOOR';
  readonly statusCode = 403;

  constructor() {
    super(CONNECTOR_NOT_A_GENERAL_SETTING);
    this.name = 'ConnectorSettingRefusedError';
  }
}
