/**
 * Tenant lifecycle posture — the canonical answer to "may this organization use
 * the platform right now, and how much of it?"
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `organizations.status` (active | inactive | suspended | …) and
 * `organizations.payment_status` (active | trialing | past_due | canceled |
 * incomplete) have existed on the schema since the first billing migration, and
 * both are written by real code paths: the admin console writes `status`
 * (`routes/tenants.ts`), and the Stripe webhook writes `payment_status`
 * (`services/billing.ts:767-846`). Until now **nothing on the request path read
 * either one.** A suspended organization — suspended for non-payment, for a
 * terminated contract, or in response to a security incident — kept full read
 * and write access to every route on the platform.
 *
 * The only pre-existing check lived at `middleware/tenantContext.ts:253` and in
 * `services/ana-platform-controller.ts:131`, both of which are mounted on a
 * handful of routers out of several hundred. This module is the one place the
 * decision is made, so a route cannot forget it.
 *
 * ── Decision model ────────────────────────────────────────────────────────────
 * Two independent columns collapse to one of three decisions, most-restrictive
 * wins:
 *
 *   allow      — normal operation.
 *   read_only  — the tenant keeps sight of its own data but cannot create new
 *                work. This is the commercially important state: a past-due or
 *                cancelled customer must still be able to read, export and pay,
 *                because locking them out of their own regulatory record is both
 *                a support burden and, under most enterprise MSAs, a breach.
 *   deny       — no access to tenant data at all.
 *
 * `status` is the authoritative security control and is evaluated first;
 * `payment_status` only ever narrows an otherwise-active tenant.
 *
 * ── Two deliberately asymmetric unknown-value policies ────────────────────────
 * An unrecognized `status` DENIES. The vocabulary is small, closed, and written
 * only by our own admin surfaces, so an unknown value means a bug or tampering
 * — exactly when a security control should refuse.
 *
 * An unrecognized `payment_status` ALLOWS (and logs). That column mirrors
 * Stripe's subscription status, whose vocabulary Stripe may extend without
 * asking us. Denying on an unrecognized value would convert a Stripe release
 * note into a customer-visible outage.
 *
 * ── Fail-closed ───────────────────────────────────────────────────────────────
 * If the posture cannot be read, access is refused (503). This matches the
 * fail-closed doctrine already set by `middleware/orgMembership.ts`, and costs
 * no additional availability in practice: membership is re-checked from the same
 * tables earlier in the same chain, so a database that cannot answer this query
 * has already refused the request. The alternative — treating "unknown" as
 * "active" — would let a suspended tenant regain access on a database blip.
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 * Same shape as the membership cache next door: short positive+negative TTL, a
 * hard entry cap, and explicit invalidation from every mutation site so a
 * suspension takes effect immediately on the mutating instance and within the
 * TTL everywhere else.
 *
 * @module server/services/tenant/tenant-lifecycle
 */

import { createScopedLogger } from '../../utils/logger';
import { runWithTenantScope } from '../../db/tenantStore';

const logger = createScopedLogger('tenant-lifecycle');

/** How long a resolved posture is trusted. Matches ORG_MEMBERSHIP_CACHE_TTL_MS. */
const POSTURE_CACHE_TTL_MS = 60_000;
const POSTURE_CACHE_MAX_ENTRIES = 5_000;

/**
 * Lifecycle states, in the order of decreasing access. `pending_deletion` and
 * `purged` are written by the offboarding lifecycle
 * (`services/tenant/tenant-offboarding.ts`); the rest predate this module.
 */
export type TenantLifecycleState =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'subscription_canceled'
  | 'pending_deletion'
  | 'suspended'
  | 'inactive'
  | 'purged'
  | 'unknown';

export type TenantAccessDecision = 'allow' | 'read_only' | 'deny';

export interface TenantAccessPosture {
  organizationId: number;
  state: TenantLifecycleState;
  decision: TenantAccessDecision;
  /** Machine-readable code surfaced to clients so a UI can render the right banner. */
  code: string;
  /** Operator- and customer-safe explanation. Contains no other tenant's data. */
  reason: string;
}

/** Raw column values this module knows how to interpret. */
const DENYING_STATUSES = new Set(['suspended', 'purged', 'deleted']);
const READ_ONLY_STATUSES = new Set(['pending_deletion']);
const ALLOWING_STATUSES = new Set(['active']);
/**
 * `inactive` is the legacy default for an organization that was created but
 * never activated. It denies: the row exists but the tenant was never turned on.
 */
const INACTIVE_STATUSES = new Set(['inactive']);

const ALLOWING_PAYMENT_STATUSES = new Set([
  'active',
  'trialing',
  // A brand-new self-service organization sits at `incomplete` until its first
  // invoice settles. Locking it out here would break onboarding before the
  // customer ever reaches a checkout form.
  'incomplete',
  'incomplete_expired',
]);
const READ_ONLY_PAYMENT_STATUSES = new Set(['past_due', 'unpaid', 'canceled']);

interface PostureCacheEntry {
  posture: TenantAccessPosture;
  expiresAt: number;
}

const postureCache = new Map<number, PostureCacheEntry>();

/**
 * Drop cached postures. Call from every path that writes `organizations.status`
 * or `organizations.payment_status` so a suspension, reinstatement or Stripe
 * webhook takes effect immediately on the mutating instance instead of after the
 * TTL.
 *
 *   invalidateTenantPosture(organizationId) — one tenant
 *   invalidateTenantPosture()               — everything (tests, admin sweeps)
 */
export function invalidateTenantPosture(organizationId?: number | string): void {
  if (organizationId === undefined || organizationId === null) {
    postureCache.clear();
    return;
  }
  const id = typeof organizationId === 'number' ? organizationId : Number.parseInt(String(organizationId), 10);
  if (Number.isFinite(id)) postureCache.delete(id);
}

function cachePosture(posture: TenantAccessPosture): void {
  if (postureCache.size >= POSTURE_CACHE_MAX_ENTRIES) {
    // Map preserves insertion order — evict the oldest entry.
    const oldest = postureCache.keys().next().value;
    if (oldest !== undefined) postureCache.delete(oldest);
  }
  postureCache.set(posture.organizationId, {
    posture,
    expiresAt: Date.now() + POSTURE_CACHE_TTL_MS,
  });
}

/**
 * Layer 1 — administrative status. The security control.
 *
 * Returns a posture when `status` alone decides the outcome, or `null` when the
 * organization is administratively active and the subscription layer gets a say.
 */
function deriveFromStatus(
  organizationId: number,
  normalizedStatus: string
): TenantAccessPosture | null {
  if (DENYING_STATUSES.has(normalizedStatus)) {
    return {
      organizationId,
      state: normalizedStatus === 'purged' || normalizedStatus === 'deleted' ? 'purged' : 'suspended',
      decision: 'deny',
      code: normalizedStatus === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_PURGED',
      reason:
        normalizedStatus === 'suspended'
          ? 'This organization is suspended. Contact your administrator or Concept2Cure support.'
          : 'This organization has been closed and its data removed.',
    };
  }

  if (INACTIVE_STATUSES.has(normalizedStatus)) {
    return {
      organizationId,
      state: 'inactive',
      decision: 'deny',
      code: 'TENANT_INACTIVE',
      reason: 'This organization is not active. Contact your administrator.',
    };
  }

  if (READ_ONLY_STATUSES.has(normalizedStatus)) {
    return {
      organizationId,
      state: 'pending_deletion',
      decision: 'read_only',
      code: 'TENANT_PENDING_DELETION',
      reason:
        'This organization is scheduled for deletion. Existing records remain readable and ' +
        'exportable until the retention window closes; new changes are blocked.',
    };
  }

  if (!ALLOWING_STATUSES.has(normalizedStatus)) {
    // Unrecognized administrative status — see the module header on why this
    // arm denies while the payment arm below does not.
    logger.warn('Unrecognized organization status — denying access (fail-closed)', {
      organizationId,
      status: normalizedStatus || '(empty)',
    });
    return {
      organizationId,
      state: 'unknown',
      decision: 'deny',
      code: 'TENANT_STATUS_UNRECOGNIZED',
      reason: 'This organization is in an unrecognized state. Contact Concept2Cure support.',
    };
  }

  // Administratively active — the subscription layer decides.
  return null;
}

/**
 * Collapse the two raw columns into a decision. Pure — no I/O — so the whole
 * policy is unit-testable without a database.
 *
 * @param status         `organizations.status`
 * @param paymentStatus  `organizations.payment_status`
 */
export function derivePosture(
  organizationId: number,
  status: string | null | undefined,
  paymentStatus: string | null | undefined
): TenantAccessPosture {
  const normalizedStatus = (status ?? '').trim().toLowerCase();
  const normalizedPayment = (paymentStatus ?? '').trim().toLowerCase();

  const fromStatus = deriveFromStatus(organizationId, normalizedStatus);
  if (fromStatus) return fromStatus;

  // ── Layer 2: subscription status. Narrows an otherwise-active tenant. ──────
  if (READ_ONLY_PAYMENT_STATUSES.has(normalizedPayment)) {
    const canceled = normalizedPayment === 'canceled';
    return {
      organizationId,
      state: canceled ? 'subscription_canceled' : 'past_due',
      decision: 'read_only',
      code: canceled ? 'TENANT_SUBSCRIPTION_CANCELED' : 'TENANT_PAST_DUE',
      reason: canceled
        ? 'This subscription has ended. Your records remain readable and exportable; ' +
          'renew the subscription to resume editing.'
        : 'This subscription is past due. Your records remain readable and exportable; ' +
          'settle the outstanding invoice to resume editing.',
    };
  }

  if (!ALLOWING_PAYMENT_STATUSES.has(normalizedPayment) && normalizedPayment !== '') {
    // Unrecognized subscription status. Stripe owns this vocabulary and may
    // extend it, so this arm ALLOWS and logs rather than manufacturing an
    // outage from a value we simply have not seen before.
    logger.warn('Unrecognized payment_status — allowing access, review the Stripe status mapping', {
      organizationId,
      paymentStatus: normalizedPayment,
    });
  }

  return {
    organizationId,
    state: normalizedPayment === 'trialing' ? 'trialing' : 'active',
    decision: 'allow',
    code: 'TENANT_ACTIVE',
    reason: 'Active.',
  };
}

/**
 * Read the two columns. The db module is imported lazily for the same reason
 * `orgMembership.queryOrgMembership` does it: this service is reached from
 * middleware imported by hundreds of route files, and must not pull a database
 * connection at module-load time.
 *
 * Returns `null` when the posture cannot be established (organization missing,
 * database unavailable, schema not initialized) — the caller fails closed.
 */
async function queryTenantPosture(organizationId: number): Promise<TenantAccessPosture | null> {
  try {
    const [dbModule, schemaModule, drizzle] = await Promise.all([
      import('../../db'),
      import('../../../shared/schema'),
      import('drizzle-orm'),
    ]);
    const db = (dbModule as { db?: any }).db;
    const organizations = (schemaModule as { organizations?: any }).organizations;
    if (!db || typeof db.select !== 'function' || !organizations) {
      logger.warn('Tenant posture unavailable (db not initialized) — access will be refused', {
        organizationId,
      });
      return null;
    }

    // Bootstrap scope: this lookup happens before the request's own tenant work
    // and must not be blocked by the instrumented pool's no-scope guard. Scoping
    // it to the organization being examined is both truthful and the narrowest
    // scope that can answer the question.
    const rows = await runWithTenantScope(
      {
        tenantId: String(organizationId),
        role: null,
        source: 'request',
        caller: 'tenant-lifecycle-bootstrap',
      },
      async () =>
        db
          .select({
            status: organizations.status,
            paymentStatus: organizations.paymentStatus,
          })
          .from(organizations)
          .where(drizzle.eq(organizations.id, organizationId))
          .limit(1)
    );

    if (!rows.length) {
      logger.warn('Tenant posture requested for an organization that does not exist', {
        organizationId,
      });
      return {
        organizationId,
        state: 'purged',
        decision: 'deny',
        code: 'TENANT_NOT_FOUND',
        reason: 'This organization no longer exists.',
      };
    }

    return derivePosture(organizationId, rows[0].status, rows[0].paymentStatus);
  } catch (error) {
    logger.warn('Tenant posture lookup failed — access will be refused (fail-closed)', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve a tenant's access posture, consulting the cache first.
 *
 * Returns `null` when the posture is indeterminate — the caller MUST refuse the
 * request (503) rather than assume the tenant is active. Indeterminate results
 * are never cached, so the next request retries as soon as the database
 * recovers.
 */
export async function getTenantAccessPosture(
  organizationId: number
): Promise<TenantAccessPosture | null> {
  const cached = postureCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.posture;

  const posture = await queryTenantPosture(organizationId);
  if (posture) cachePosture(posture);
  return posture;
}

/**
 * Synchronous cache probe, for callers that already hold a decision and only
 * want to avoid a redundant round-trip (mirrors `peekOrgMembership`). Returns
 * `null` when there is no live entry.
 */
export function peekTenantAccessPosture(organizationId: number): TenantAccessPosture | null {
  const cached = postureCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.posture;
  return null;
}

/**
 * Should background work act on this tenant?
 *
 * ── Why background work needs its own question ────────────────────────────────
 * The lifecycle guard is Express middleware. Cron sweeps and workers run on no
 * transport at all, so nothing was asking. `server/jobs/taskDueSweep.ts` selected
 * across EVERY organization and sent notifications; a suspended organization's
 * users kept receiving automated mail about work that every HTTP route would
 * refuse them, and the platform kept spending compute — and, on the AI-backed
 * sweeps, model budget — on tenants that are not paying.
 *
 * ── Why the answer differs from the HTTP one ──────────────────────────────────
 * Two deliberate divergences from `decisionPermitsMethod`:
 *
 *  1. `read_only` is a NO. There is no read-only background job: a sweep exists
 *     to write something, notify someone, or bill for something. Treating
 *     read_only as "go ahead" would let a past-due tenant keep generating
 *     notifications and spend, which is the thing the state is for.
 *
 *  2. An unreadable posture is a SKIP, not an error. On HTTP, failing closed
 *     means 503 — the caller learns and retries. A sweep has no caller; the
 *     safe failure is to do nothing this tick and pick the tenant up on the
 *     next one, once the posture is readable again. Refusing loudly would turn
 *     a transient database blip into a cron alert storm, and doing the work
 *     anyway would defeat the control.
 *
 * Callers should treat `false` as "skip this tenant, quietly" — not as an error.
 *
 * ── Pure core, thin wrapper ───────────────────────────────────────────────────
 * The decision is `backgroundWorkPermitted`, which takes a posture and does no
 * I/O — the same shape `seat-licensing.evaluateSeats` uses, and for the same
 * reason: the policy is what deserves exhaustive testing, and a policy behind a
 * database call cannot be tested exhaustively. The resolver is injectable so the
 * batch form can be driven directly rather than through a module mock (which,
 * for an intra-module call like this one, does not intercept — a lesson learned
 * by watching four tests pass for the wrong reason).
 */
export function backgroundWorkPermitted(posture: TenantAccessPosture | null): boolean {
  if (!posture) return false;
  return posture.decision === 'allow';
}

export async function shouldProcessTenantInBackground(
  organizationId: number,
  resolve: (id: number) => Promise<TenantAccessPosture | null> = getTenantAccessPosture
): Promise<boolean> {
  return backgroundWorkPermitted(await resolve(organizationId));
}

/**
 * Batch form. A sweep typically holds rows for many organizations and wants one
 * decision per distinct org rather than one per row — the posture cache makes
 * the repeat lookups cheap, but the round-trips are not free at 500 rows.
 *
 * Returns the set of organization ids background work MAY act on.
 */
export async function filterTenantsForBackgroundWork(
  organizationIds: Iterable<number>,
  resolve: (id: number) => Promise<TenantAccessPosture | null> = getTenantAccessPosture
): Promise<Set<number>> {
  const distinct = [...new Set(organizationIds)];
  const allowed = new Set<number>();
  await Promise.all(
    distinct.map(async id => {
      if (backgroundWorkPermitted(await resolve(id))) allowed.add(id);
    })
  );
  return allowed;
}

/** True when the decision permits the given HTTP method. */
export function decisionPermitsMethod(decision: TenantAccessDecision, method: string): boolean {
  if (decision === 'allow') return true;
  if (decision === 'deny') return false;
  // read_only
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}
