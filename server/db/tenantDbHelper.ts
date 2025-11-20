/**
 * Tenant Database Helper Functions
 *
 * This file provides utility functions for working with tenant databases,
 * particularly for getting tenant-specific database instances in API routes.
 */
import { Request } from 'express';
import { TenantDb } from './tenantDb';
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
    // If the tenant context is established, return a tenant-scoped database
    if (req.tenantContext?.organizationId) {
      return new TenantDb(req.tenantContext.organizationId);
    }

    // If only the tenantId is available, use it
    if (req.tenantId) {
      return new TenantDb(req.tenantId);
    }

    // If no tenant context is available, return the default database
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
