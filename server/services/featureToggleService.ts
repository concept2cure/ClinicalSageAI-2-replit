/**
 * Feature Toggle Service
 *
 * This service enables safe, controlled roll-out of new features
 * by providing a mechanism to toggle features on/off for specific
 * organizations and client workspaces.
 */
import { db } from '../db';
import { featureToggles } from '../../shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { runWithSystemTenantScope } from '../db/tenantStore';

export class FeatureToggleService {
  /**
   * Check if a feature is enabled globally or for a specific tenant
   *
   * @param featureKey Unique identifier for the feature
   * @param organizationId Organization ID to check (optional)
   * @param clientWorkspaceId Client workspace ID to check (optional)
   * @returns Boolean indicating if the feature is enabled
   */
  static async isFeatureEnabled(
    featureKey: string,
    organizationId?: number,
    clientWorkspaceId?: number
  ): Promise<boolean> {
    let toggles: Array<typeof featureToggles.$inferSelect>;
    try {
      toggles = await db
        .select()
        .from(featureToggles)
        .where(eq(featureToggles.featureKey, featureKey))
        .limit(1);
    } catch {
      // Fail-safe: if the toggle store is unreachable, treat the feature
      // as disabled. Never enable a feature we cannot confirm is on.
      return false;
    }

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
