/**
 * Authentication events into the audit trail (21 CFR Part 11 §11.10(e)): every
 * login attempt, logout and credential-changing event.
 *
 * ── Why the write opens its own tenant scope ─────────────────────────────────
 * Every /api/auth request runs in the pre-auth scope: tenant '0', no role
 * (`runWithPreAuthScope`, mounted by register-platform-routes). That is right
 * for the request, since no tenant is known until the user has been identified.
 * It is wrong for the audit row of an identified user, which carries that
 * user's organisation. `audit_logs`' tenant isolation policy admits a row only
 * for the scope's own tenant, so under RLS_ENFORCE=on (the only posture
 * production accepts) every such row was refused:
 *   - the MFA challenge every password sign-in issues;
 *   - a wrong password on a real account;
 *   - a lockout.
 * The refusal is swallowed below by design. A sign-in therefore left no audit
 * record (VSR-001 §13, F-19; tests/db/sign-in-audit-trail.dbtest.ts).
 *
 * So the write for an identified user runs in a scope for exactly the tenant it
 * records. That tenant is resolved by the server, from the user record or from
 * its own signed MFA challenge, never from the request. The scope carries no
 * role, so it reaches that tenant's audit chain and nothing else. It wraps the
 * audit write alone: the request's own queries stay in the pre-auth scope. The
 * same least-privilege shape is used for new-organisation provisioning at
 * signup (routes/auth.ts). An event with no identified tenant, such as an
 * unknown email, is written from the scope it arrives in, as tenant 0.
 *
 * ── Why a failure does not fail the request ─────────────────────────────────
 * An audit-pipeline outage must never lock every user out of the product. The
 * failure is logged at warn level. It is no longer the steady state of every
 * sign-in.
 */
import { runWithTenantScope } from '../../db/tenantStore';
import { createScopedLogger } from '../../utils/logger.js';
import auditService from '../auditService';

const logger = createScopedLogger('auth');

export interface AuthAuditEvent {
  action: string;
  userId?: number | string | null;
  tenantId?: number | string | null;
  email?: string;
  outcome: 'success' | 'failure';
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** The organisation an event records, when it names one: a positive integer id. */
function recordedTenant(tenantId: AuthAuditEvent['tenantId']): number | null {
  if (tenantId === null || tenantId === undefined || tenantId === '') return null;
  const id = Number(tenantId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function recordAuthEvent(entry: AuthAuditEvent): Promise<void> {
  const write = () =>
    auditService.logAction({
      tenantId: entry.tenantId ?? undefined,
      userId: entry.userId ?? undefined,
      action: entry.action,
      resourceType: 'user',
      resourceId: entry.userId?.toString() ?? entry.email ?? 'unknown',
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      details: {
        outcome: entry.outcome,
        reason: entry.reason,
        email: entry.email,
      },
    });

  const tenant = recordedTenant(entry.tenantId);
  const authAudit =
    tenant === null
      ? await write()
      : await runWithTenantScope(
          { tenantId: String(tenant), role: null, source: 'request', caller: `auth audit: ${entry.action}` },
          write,
        );
  if (!authAudit.persisted) {
    logger.warn('Audit log write failed (non-fatal)', {
      err: authAudit.error ?? 'no durable store accepted the row',
      action: entry.action,
    });
  }
}
