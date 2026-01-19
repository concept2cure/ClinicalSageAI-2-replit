import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  availableModules,
  licenseEntitlements,
  moduleSubscriptions,
  organizationLicenses,
} from '../../shared/schema.ts';

const isActiveWindow = (start, end, now) => {
  const afterStart = !start || start <= now;
  const beforeEnd = !end || end >= now;
  return afterStart && beforeEnd;
};

export async function getActiveLicenses(organizationId) {
  const now = new Date();
  return db
    .select()
    .from(organizationLicenses)
    .where(
      and(
        eq(organizationLicenses.organizationId, organizationId),
        eq(organizationLicenses.status, 'active'),
        or(isNull(organizationLicenses.startsAt), lte(organizationLicenses.startsAt, now)),
        or(isNull(organizationLicenses.endsAt), gte(organizationLicenses.endsAt, now))
      )
    );
}

export async function getActiveEntitlements(organizationId) {
  const now = new Date();
  const licenses = await getActiveLicenses(organizationId);
  if (licenses.length === 0) return [];

  const entitlements = await db
    .select({
      entitlement: licenseEntitlements,
      license: organizationLicenses,
    })
    .from(licenseEntitlements)
    .innerJoin(
      organizationLicenses,
      eq(licenseEntitlements.licenseId, organizationLicenses.id)
    )
    .where(
      and(
        eq(licenseEntitlements.organizationId, organizationId),
        eq(licenseEntitlements.status, 'active')
      )
    );

  return entitlements
    .filter(({ entitlement, license }) => {
      const start = entitlement.startsAt || license.startsAt;
      const end = entitlement.endsAt || license.endsAt;
      return isActiveWindow(start, end, now);
    })
    .map(({ entitlement, license }) => ({
      ...entitlement,
      license,
    }));
}

export async function getOrganizationModuleAccess(organizationId) {
  const entitlements = await getActiveEntitlements(organizationId);
  const subscriptions = await db
    .select({
      subscription: moduleSubscriptions,
      module: availableModules,
    })
    .from(moduleSubscriptions)
    .innerJoin(availableModules, eq(moduleSubscriptions.moduleId, availableModules.moduleId))
    .where(
      and(
        eq(moduleSubscriptions.organizationId, organizationId),
        eq(moduleSubscriptions.enabled, true)
      )
    );

  if (entitlements.length === 0) {
    return subscriptions.map(({ module, subscription }) => ({
      module,
      subscription,
      entitlement: null,
      scope: 'organization',
    }));
  }

  if (subscriptions.length === 0) {
    const moduleIds = [...new Set(entitlements.map(entitlement => entitlement.moduleId))];
    const modules = await db
      .select()
      .from(availableModules)
      .where(inArray(availableModules.moduleId, moduleIds));

    return modules.flatMap(module => {
      const moduleEntitlements = entitlements.filter(entitlement => entitlement.moduleId === module.moduleId);
      return moduleEntitlements.map(entitlement => ({
        module,
        subscription: null,
        entitlement,
        scope: entitlement.scope || 'organization',
      }));
    });
  }

  const entitlementByModule = new Map();
  entitlements.forEach(entitlement => {
    if (!entitlementByModule.has(entitlement.moduleId)) {
      entitlementByModule.set(entitlement.moduleId, []);
    }
    entitlementByModule.get(entitlement.moduleId).push(entitlement);
  });

  return subscriptions
    .filter(({ module }) => entitlementByModule.has(module.moduleId))
    .flatMap(({ module, subscription }) => {
      const moduleEntitlements = entitlementByModule.get(module.moduleId) || [];
      return moduleEntitlements.map(entitlement => ({
        module,
        subscription,
        entitlement,
        scope: entitlement.scope || 'organization',
      }));
    });
}

export async function hasModuleAccess({ organizationId, moduleId, projectId, clientWorkspaceId }) {
  const accessList = await getOrganizationModuleAccess(organizationId);
  if (accessList.length === 0) return false;

  return accessList.some(entry => {
    if (entry.module.moduleId !== moduleId) return false;
    if (!entry.entitlement) return true;

    if (entry.entitlement.scope === 'project' && projectId) {
      return entry.entitlement.projectId === projectId;
    }

    if (entry.entitlement.scope === 'workspace' && clientWorkspaceId) {
      return entry.entitlement.clientWorkspaceId === clientWorkspaceId;
    }

    return entry.entitlement.scope === 'organization';
  });
}

export async function getModuleAccessList(organizationId) {
  const accessList = await getOrganizationModuleAccess(organizationId);
  const modules = accessList.map(entry => ({
    moduleId: entry.module.moduleId,
    name: entry.module.name,
    description: entry.module.description,
    category: entry.module.category,
    path: entry.module.path,
    icon: entry.module.icon,
    scope: entry.scope,
    entitlement: entry.entitlement,
  }));

  return modules;
}
