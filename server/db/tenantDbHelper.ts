/**
 * Tenant Database Helper Functions
 *
 * This file provides utility functions for working with tenant databases,
 * particularly for getting tenant-specific database instances in API routes.
 */
import { Request } from 'express';
import { TenantDb } from './tenantDb';
import type { TenantContext } from '../middleware/tenantContext';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('tenant-db-helper');

/**
 * Get a tenant-specific database instance from a request
 *
 * This function examines the request for tenant context and returns
 * either a tenant-scoped database instance or the default database.
 *
 * @param req The Express request
 * @returns A tenant-scoped database instance or the default database
 */
export function getDb(req: Request): TenantDb | typeof db {
  try {
    // TenantDb's constructor expects the full TenantContext object — not a
    // bare organizationId. Passing a primitive here means orgId/clientId end
    // up undefined and every query skips its tenant filter.
    if (req.tenantContext?.organizationId != null) {
      const ctx = req.tenantContext;
      return new TenantDb({
        organizationId: ctx.organizationId == null ? null : String(ctx.organizationId),
        organizationUuid: ctx.organizationUuid ?? null,
        clientWorkspaceId:
          ctx.clientWorkspaceId == null ? null : String(ctx.clientWorkspaceId),
        module: ctx.module ?? null,
      } satisfies TenantContext);
    }

    if (req.tenantId != null) {
      return new TenantDb({
        organizationId: String(req.tenantId),
        organizationUuid: null,
        clientWorkspaceId: null,
        module: null,
      } satisfies TenantContext);
    }

    return db;
  } catch (error) {
    logger.error('Error getting tenant database', error);
    return db;
  }
}

/**
 * Helper function to ensure that a tenant ID is set in the request
 *
 * @param req The Express request
 * @returns The tenant ID from the request
 * @throws Error if tenant ID is not set
 */
export function ensureTenantId(req: Request): number {
  if (!req.tenantId && !req.tenantContext?.organizationId) {
    throw new Error('Tenant ID is required but not set in the request');
  }

  return req.tenantId || req.tenantContext!.organizationId;
}
