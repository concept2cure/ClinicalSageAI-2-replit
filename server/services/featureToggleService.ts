/**
 * Feature Toggle Service
 *
 * This service enables safe, controlled roll-out of new features
 * by providing a mechanism to toggle features on/off for specific
 * organizations and client workspaces.
 */
import { db } from '../db';
import { featureToggles } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getTenantScope, runWithSystemTenantScope } from '../db/tenantStore';
import { logger } from '../utils/logger';

export class FeatureToggleService {
  /**
   * Check if a feature is enabled globally or for a specific tenant
   *
   * @param featureKey Unique identifier for the feature
   * @param organizationId Organization ID to check (optional)
   * @param clientWorkspaceId Client workspace ID to check (optional)
   * @returns Boolean indicating if the feature is enabled
   */
  /**
   * Read one toggle row, establishing a system scope only when the caller has
   * none.
   *
   * ── Why a scope is needed at all ────────────────────────────────────────
   * Pool instrumentation refuses any statement issued with no tenant scope
   * while RLS_ENFORCE=on, which production hard-requires. `initializeFeatureToggle`
   * already carries that argument in full — `feature_toggles` is platform
   * reference data with no tenant column and no RLS policy, so the scope is a
   * statement of what the operation IS rather than authority minted from an
   * argument — and it was given a scope for exactly this reason.
   *
   * The READ was not. So every caller outside a request — the startup toggle
   * bootstrap, any job — had its query refused, and the catch above turned the
   * refusal into "the feature is off". The document-catalog bootstrap logged
   * "inactive platform-wide" on every enforcing boot no matter what the
   * operator had set, which is the one thing that bootstrap exists to report
   * accurately. A control wired to one of two doors again: the write got the
   * scope, the read did not, and only the read is on the path anybody watches.
   *
   * When a caller already has a scope, that scope is kept. Replacing a request's
   * `admin` with `app_super_admin` would be inert against a table with no
   * policy, but a data accessor that quietly upgrades its caller's role is a
   * shape worth not having.
   */
  private static async readToggle(
    featureKey: string,
  ): Promise<Array<typeof featureToggles.$inferSelect>> {
    /* `await` inside the callback, not outside it. A drizzle builder is lazy —
       it issues nothing until it is awaited — so handing the builder back from
       a synchronous callback lets runWithSystemTenantScope return, and the
       query then runs with the scope already unwound. The refusal is
       byte-identical to having no scope at all, which is what makes this worth
       a sentence. */
    const read = async () =>
      await db.select().from(featureToggles).where(eq(featureToggles.featureKey, featureKey)).limit(1);
    return getTenantScope() ? read() : runWithSystemTenantScope('feature-toggle:read', read);
  }

  static async isFeatureEnabled(
    featureKey: string,
    organizationId?: number,
    clientWorkspaceId?: number
  ): Promise<boolean> {
    const state = await this.readFeatureState(featureKey, organizationId, clientWorkspaceId);
    return state.enabled;
  }

  /**
   * The same resolution, with the one fact the boolean cannot carry: whether
   * the toggle store could be read at all.
   *
   * `isFeatureEnabled` fails closed — never enable a feature we cannot confirm
   * is on — which is right, and which makes "disabled" and "we could not find
   * out" the same answer. For an operator trying to work out why a switch they
   * flipped did nothing, those are the two different answers that matter, so
   * the caller that reports the state at startup reads it from here instead.
   * One query, two views; the boolean stays the default.
   */
  static async readFeatureState(
    featureKey: string,
    organizationId?: number,
    clientWorkspaceId?: number
  ): Promise<{ enabled: boolean; readable: boolean }> {
    let toggles: Array<typeof featureToggles.$inferSelect>;
    try {
      toggles = await this.readToggle(featureKey);
    } catch (err) {
      /* Fail-safe: if the toggle store is unreachable, treat the feature as
         disabled. But SAY SO — this catch used to be bare, so a refused read
         and a deliberately disabled feature produced the same `false` with
         nothing written anywhere, and the refused read was the common case
         (see readToggle). An operator enabling a toggle and watching nothing
         happen had no thread to pull. */
      logger.error('[feature-toggle] read failed — reporting the feature DISABLED', {
        featureKey,
        organizationId,
        reason: err instanceof Error ? ((err as any).cause?.message ?? err.message) : String(err),
      });
      return { enabled: false, readable: false };
    }
    return { enabled: this.resolveEnabled(toggles, organizationId, clientWorkspaceId), readable: true };
  }

  /** Pure: what a fetched toggle row means for this tenant. */
  private static resolveEnabled(
    toggles: Array<typeof featureToggles.$inferSelect>,
    organizationId?: number,
    clientWorkspaceId?: number
  ): boolean {

    if (toggles.length === 0) {
      return false;
    }

    const toggle = toggles[0];

    // If globally enabled, return true
    if (toggle.enabled) {
      return true;
    }

    // Check organization-specific enablement
    if (
      organizationId &&
      toggle.enabledForOrganizationIds &&
      Array.isArray(toggle.enabledForOrganizationIds) &&
      toggle.enabledForOrganizationIds.includes(organizationId)
    ) {
      return true;
    }

    // Check client workspace-specific enablement
    if (
      clientWorkspaceId &&
      toggle.enabledForClientWorkspaceIds &&
      Array.isArray(toggle.enabledForClientWorkspaceIds) &&
      toggle.enabledForClientWorkspaceIds.includes(clientWorkspaceId)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Enable a feature for specific tenants
   *
   * @param featureKey Unique identifier for the feature
   * @param organizationId Organization ID to enable for (optional)
   * @param clientWorkspaceId Client workspace ID to enable for (optional)
   */
  static async enableFeatureForTenant(
    featureKey: string,
    organizationId?: number,
    clientWorkspaceId?: number
  ): Promise<void> {
    // First, check if the feature toggle exists
    const existingToggles = await db
      .select()
      .from(featureToggles)
      .where(eq(featureToggles.featureKey, featureKey))
      .limit(1);

    if (existingToggles.length === 0) {
      // Feature toggle doesn't exist, create it
      await db.insert(featureToggles).values({
        featureKey,
        description: `Feature toggle for ${featureKey}`,
        enabled: false,
        enabledForOrganizationIds: organizationId ? [organizationId] : [],
        enabledForClientWorkspaceIds: clientWorkspaceId ? [clientWorkspaceId] : [],
      });
      return;
    }

    const toggle = existingToggles[0];

    // Update existing toggle
    if (organizationId) {
      const orgIds = Array.isArray(toggle.enabledForOrganizationIds)
        ? toggle.enabledForOrganizationIds
        : [];

      if (!orgIds.includes(organizationId)) {
        await db
          .update(featureToggles)
          .set({
            enabledForOrganizationIds: [...orgIds, organizationId],
            updatedAt: new Date(),
          })
          .where(eq(featureToggles.id, toggle.id));
      }
    }

    if (clientWorkspaceId) {
      const clientIds = Array.isArray(toggle.enabledForClientWorkspaceIds)
        ? toggle.enabledForClientWorkspaceIds
        : [];

      if (!clientIds.includes(clientWorkspaceId)) {
        await db
          .update(featureToggles)
          .set({
            enabledForClientWorkspaceIds: [...clientIds, clientWorkspaceId],
            updatedAt: new Date(),
          })
          .where(eq(featureToggles.id, toggle.id));
      }
    }
  }

  /**
   * Disable a feature for specific tenants
   *
   * @param featureKey Unique identifier for the feature
   * @param organizationId Organization ID to disable for (optional)
   * @param clientWorkspaceId Client workspace ID to disable for (optional)
   */
  static async disableFeatureForTenant(
    featureKey: string,
    organizationId?: number,
    clientWorkspaceId?: number
  ): Promise<void> {
    const existingToggles = await db
      .select()
      .from(featureToggles)
      .where(eq(featureToggles.featureKey, featureKey))
      .limit(1);

    if (existingToggles.length === 0) {
      return;
    }

    const toggle = existingToggles[0];

    if (organizationId) {
      const orgIds = Array.isArray(toggle.enabledForOrganizationIds)
        ? toggle.enabledForOrganizationIds.filter(id => id !== organizationId)
        : [];

      await db
        .update(featureToggles)
        .set({
          enabledForOrganizationIds: orgIds,
          updatedAt: new Date(),
        })
        .where(eq(featureToggles.id, toggle.id));
    }

    if (clientWorkspaceId) {
      const clientIds = Array.isArray(toggle.enabledForClientWorkspaceIds)
        ? toggle.enabledForClientWorkspaceIds.filter(id => id !== clientWorkspaceId)
        : [];

      await db
        .update(featureToggles)
        .set({
          enabledForClientWorkspaceIds: clientIds,
          updatedAt: new Date(),
        })
        .where(eq(featureToggles.id, toggle.id));
    }
  }

  /**
   * Initialize a feature toggle with default state
   *
   * @param featureKey Unique identifier for the feature
   * @param description Description of what the feature does
   * @param enabled Whether the feature is enabled globally
   */
  static async initializeFeatureToggle(
    featureKey: string,
    description: string,
    enabled: boolean = false
  ): Promise<void> {
    // Runs in a SYSTEM scope, and unlike a per-tenant accessor that is safe to
    // do from inside the function itself.
    //
    // `feature_toggles` is platform reference data: it has no tenant column and
    // carries no RLS policy (verified against a provisioned database), so there
    // is no tenant dimension here to escalate across. The scope is not authority
    // derived from a caller-supplied id — it is a statement of what this
    // operation IS. Contrast SentinelScheduler.scheduleOrg, which takes an
    // organizationId and therefore establishes its scope at the job boundary
    // instead: a data accessor that mints tenant authority out of one of its own
    // arguments is a privilege-escalation shape.
    //
    // Without a scope this bootstrap is refused outright under RLS_ENFORCE=on —
    // "[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope" —
    // which is what made the toggle bootstrap fail on every enforcing boot.
    await runWithSystemTenantScope('feature-toggle:initialize', async () => {
      const existingToggles = await db
        .select()
        .from(featureToggles)
        .where(eq(featureToggles.featureKey, featureKey))
        .limit(1);

      if (existingToggles.length === 0) {
        await db.insert(featureToggles).values({
          featureKey,
          description,
          enabled,
          enabledForOrganizationIds: [],
          enabledForClientWorkspaceIds: [],
        });
      } else {
        // Only update description if toggle already exists
        await db
          .update(featureToggles)
          .set({
            description,
            updatedAt: new Date(),
          })
          .where(eq(featureToggles.id, existingToggles[0].id));
      }
    });
  }
}

export default FeatureToggleService;
