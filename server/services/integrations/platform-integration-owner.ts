/**
 * Whose are the deployment's own workspace integrations?
 *
 * The regulatory mailbox (GMAIL_OAUTH_JSON), the team calendar
 * (GOOGLE_CALENDAR_ID + GOOGLE_SERVICE_ACCOUNT) and the HubSpot CRM
 * (HUBSPOT_ACCESS_TOKEN) are each ONE account, configured for the whole
 * deployment, not per organisation. Until 2026-10-01 AnA's tools used them for
 * whichever organisation asked, so any tenant could read the operator's
 * mailbox and CRM and write the operator's calendar (audit finding ANA-03; AnA
 * local-safe-AI plan WS5, the mailbox half).
 *
 * Decision (docs/LAUNCH_DEFINITION_OF_DONE.md P-8, open decision 10): they
 * serve only the organisation PLATFORM_INTEGRATIONS_ORGANIZATION_ID names —
 * the operator's own organisation, or the one tenant of a single-tenant
 * deployment. The caller is the running request's tenant scope, never a value
 * a tool input carries. Every other organisation, an unscoped call and the
 * estate-wide system scope ('0') are told none is connected for them, and the
 * account is not reached. With no owner named, no one reaches them. A tenant's
 * own mailbox or CRM, on its own credential, is a connector capability for
 * after launch.
 *
 * @module server/services/integrations/platform-integration-owner
 */
import { getTenantScope } from '../../db/tenantStore.js';

export const PLATFORM_INTEGRATIONS_ORG_ENV = 'PLATFORM_INTEGRATIONS_ORGANIZATION_ID';

/** The organisation the deployment's own integrations belong to, or null when none is named. */
export function platformIntegrationsOwner(env: Record<string, string | undefined> = process.env): string | null {
  const value = (env[PLATFORM_INTEGRATIONS_ORG_ENV] ?? '').trim();
  return /^[1-9]\d*$/.test(value) ? value : null;
}

/** True only when `organizationId` is the named owner. */
export function isPlatformIntegrationsOwner(
  organizationId: number | string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const owner = platformIntegrationsOwner(env);
  return owner !== null && organizationId != null && String(organizationId) === owner;
}

/** True only when the running request is the named owner's (the estate-wide scope '0' is no organisation). */
export function callerOwnsPlatformIntegrations(): boolean {
  const tenantId = getTenantScope()?.tenantId;
  return Boolean(tenantId) && tenantId !== '0' && isPlatformIntegrationsOwner(tenantId);
}

/** What a tool says to an organisation the integration is not theirs. */
export function notYourIntegrationNote(what: string): string {
  return (
    `The ${what} is not connected for your organisation. It is this deployment's own account, ` +
    'and it serves only the organisation it belongs to.'
  );
}
