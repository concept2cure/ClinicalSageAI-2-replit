/**
 * Quality Waiver Service
 *
 * This service handles waiver requests for quality gating rules, including validation,
 * approval workflows, and waiver tracking.
 */
import { createScopedLogger } from '../utils/logger';
import { getDb } from '../db/tenantDbHelper';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { storeInCache, getFromCache, invalidateCache } from '../cache/tenantCache';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { TenantDb } from '../db/tenantDb';

const logger = createScopedLogger('quality-waiver-service');

/**
 * Waiver Request Status
 */
export enum WaiverStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Waiver Request interface
 */
interface WaiverRequest {
  id?: number;
  qmpId: number;
  sectionCode: string;
  organizationId: number;
  requestedById: number;
  requestedDate: Date;
  justification: string;
  factorIds: number[];
  customRuleIds?: string[];
  status: WaiverStatus;
  expirationDate?: Date;
  approvedById?: number;
  approvedDate?: Date;
  comments?: string;
  riskAssessment?: any;
}

/**
 * Waiver Approval Request interface
 */
interface WaiverApprovalRequest {
  waiverId: number;
  approvedById: number;
  comments?: string;
  expirationDate?: Date;
  riskAssessment?: any;
}

/**
 * Create a new waiver request
 */
export async function createWaiverRequest(
  req: any,
  waiver: Omit<WaiverRequest, 'id' | 'status' | 'requestedDate'>
): Promise<WaiverRequest> {
  try {
    logger.debug('Creating waiver request', {
      qmpId: waiver.qmpId,
      sectionCode: waiver.sectionCode,
      organizationId: waiver.organizationId,
    });

    const dbInstance = getDb(req);
    if (!dbInstance) {
      throw new Error('Database not available');
    }

    // Check if the section gating rule exists
    const gatingRules =
      dbInstance instanceof TenantDb
        ? await dbInstance.select(
            qmpSectionGating,
            and(
              eq(qmpSectionGating.organizationId, waiver.organizationId),
              eq(qmpSectionGating.qmpId, waiver.qmpId),
              eq(qmpSectionGating.sectionKey, waiver.sectionCode)
            )
          )
        : await dbInstance
            .select()
            .from(qmpSectionGating)
            .where(
              and(
                eq(qmpSectionGating.organizationId, waiver.organizationId),
                eq(qmpSectionGating.qmpId, waiver.qmpId),
                eq(qmpSectionGating.sectionKey, waiver.sectionCode)
              )
            )
            .limit(1);

    if (gatingRules.length === 0) {
      throw new Error('No quality gating rule found for this section');
    }

    const gatingRule = gatingRules[0];

    // Check if overrides are allowed for this rule
    if (!gatingRule.allowOverride) {
      throw new Error('Quality overrides are not allowed for this section');
    }

    // Check if the QMP allows waivers
    const qmps =
      dbInstance instanceof TenantDb
        ? await dbInstance.select(
            qualityManagementPlans,
            and(
              eq(qualityManagementPlans.organizationId, waiver.organizationId),
              eq(qualityManagementPlans.id, waiver.qmpId)
            )
          )
        : await dbInstance
            .select()
            .from(qualityManagementPlans)
            .where(
              and(
                eq(qualityManagementPlans.organizationId, waiver.organizationId),
                eq(qualityManagementPlans.id, waiver.qmpId)
              )
            )
            .limit(1);

    if (qmps.length === 0) {
      throw new Error('Quality Management Plan not found');
    }

    const qmp = qmps[0];

    if (qmp.allowWaivers === false) {
      throw new Error('Quality waivers are not allowed for this QMP');
    }

    // Verify that the factor IDs are valid
    if (waiver.factorIds && waiver.factorIds.length > 0) {
      const factors =
        dbInstance instanceof TenantDb
          ? await dbInstance.select(
              ctqFactors,
              and(
                eq(ctqFactors.organizationId, waiver.organizationId),
                sql`${ctqFactors.id} = ANY(${waiver.factorIds})`
              )
            )
          : await dbInstance
              .select()
              .from(ctqFactors)
              .where(
                and(
                  eq(ctqFactors.organizationId, waiver.organizationId),
                  sql`${ctqFactors.id} = ANY(${waiver.factorIds})`
                )
              );

      if (factors.length !== waiver.factorIds.length) {
        throw new Error('One or more factor IDs are invalid');
      }
    }

    // This is where we'd insert a new waiver record
    // For now, we'll just return a mock waiver record
    const waiverRecord: WaiverRequest = {
      ...waiver,
      id: Date.now(), // This would be a DB-generated ID
      status: WaiverStatus.PENDING,
      requestedDate: new Date(),
    };

    // In a real implementation, we'd insert this into the database

    // Invalidate any caches related to waivers
    invalidateCache(waiver.organizationId, 'waivers', `section-${waiver.sectionCode}`);

    logger.info('Waiver request created', {
      waiverId: waiverRecord.id,
      qmpId: waiver.qmpId,
      sectionCode: waiver.sectionCode,
    });

    return waiverRecord;
  } catch (error) {
    logger.error('Error creating waiver request', { error });
    throw error;
  }
}

/**
 * Get all waiver requests for a QMP
 */
export async function getWaiverRequestsForQmp(
  req: any,
  organizationId: number,
  qmpId: number
): Promise<WaiverRequest[]> {
  try {
    // Try to get from cache
    const cacheKey = `qmp-waivers-${qmpId}`;
    const cachedWaivers = getFromCache<WaiverRequest[]>(organizationId, 'waivers', cacheKey);

    if (cachedWaivers) {
      logger.debug('Retrieved waiver requests from cache', { qmpId });
      return cachedWaivers;
    }

    // This is where we'd query the database for waiver requests
    // For now, we'll return a mock list
    const waivers: WaiverRequest[] = [
      {
        id: 1,
        qmpId,
        sectionCode: 'clinical-background',
        organizationId,
        requestedById: 101,
        requestedDate: new Date('2025-05-01'),
        justification: 'Incomplete clinical data due to ongoing study',
        factorIds: [1, 2],
        status: WaiverStatus.APPROVED,
        approvedById: 102,
        approvedDate: new Date('2025-05-02'),
        expirationDate: new Date('2025-11-01'),
        comments: 'Approved with conditions to update once study completes',
      },
      {
        id: 2,
        qmpId,
        sectionCode: 'benefit-risk',
        organizationId,
        requestedById: 101,
        requestedDate: new Date('2025-05-05'),
        justification: 'Missing risk data for specific population',
        factorIds: [3],
        status: WaiverStatus.PENDING,
      },
    ];

    // Store in cache for future requests
    storeInCache(organizationId, 'waivers', cacheKey, waivers);

    return waivers;
  } catch (error) {
    logger.error('Error getting waiver requests for QMP', { error, qmpId });
    throw error;
  }
}

/**
 * Get waiver requests for a specific section
 */
export async function getWaiverRequestsForSection(
  req: any,
  organizationId: number,
  qmpId: number,
  sectionCode: string
): Promise<WaiverRequest[]> {
  try {
    // Try to get from cache
    const cacheKey = `section-${sectionCode}`;
    const cachedWaivers = getFromCache<WaiverRequest[]>(organizationId, 'waivers', cacheKey);

    if (cachedWaivers) {
      logger.debug('Retrieved section waiver requests from cache', { sectionCode });
      return cachedWaivers;
    }

    // This is where we'd query the database for waiver requests for this section
    // For now, we'll filter the mock list
    const allWaivers = await getWaiverRequestsForQmp(req, organizationId, qmpId);
    const sectionWaivers = allWaivers.filter(waiver => waiver.sectionCode === sectionCode);

    // Store in cache for future requests
    storeInCache(organizationId, 'waivers', cacheKey, sectionWaivers);

    return sectionWaivers;
  } catch (error) {
    logger.error('Error getting waiver requests for section', { error, qmpId, sectionCode });
    throw error;
  }
}

/**
 * Get a specific waiver request
 */
export async function getWaiverRequest(
  req: any,
  organizationId: number,
  waiverId: number
): Promise<WaiverRequest | null> {
  try {
    // Try to get from cache
    const cacheKey = `waiver-${waiverId}`;
    const cachedWaiver = getFromCache<WaiverRequest>(organizationId, 'waivers', cacheKey);

    if (cachedWaiver) {
      logger.debug('Retrieved waiver request from cache', { waiverId });
      return cachedWaiver;
    }

    // This is where we'd query the database for a specific waiver request
    // For now, we'll find it in our mock list
    const allWaivers = await getWaiverRequestsForQmp(req, organizationId, 1); // Assumes qmpId=1 to simplify
    const waiver = allWaivers.find(w => w.id === waiverId);

    if (waiver) {
      // Store in cache for future requests
      storeInCache(organizationId, 'waivers', cacheKey, waiver);
    }

    return waiver || null;
  } catch (error) {
    logger.error('Error getting waiver request', { error, waiverId });
    throw error;
  }
}

/**
 * Approve a waiver request
 */
export async function approveWaiverRequest(
  req: any,
  organizationId: number,
  approvalRequest: WaiverApprovalRequest
): Promise<WaiverRequest> {
  try {
    const { waiverId, approvedById, comments, expirationDate, riskAssessment } = approvalRequest;

    // Get the waiver request
    const waiver = await getWaiverRequest(req, organizationId, waiverId);

    if (!waiver) {
      throw new Error('Waiver request not found');
    }

    if (waiver.status !== WaiverStatus.PENDING) {
      throw new Error(`Cannot approve waiver with status: ${waiver.status}`);
    }

    // This is where we'd update the waiver in the database
    // For now, we'll update our mock waiver
    const updatedWaiver: WaiverRequest = {
      ...waiver,
      status: WaiverStatus.APPROVED,
      approvedById,
      approvedDate: new Date(),
      comments: comments || waiver.comments,
      expirationDate: expirationDate || waiver.expirationDate,
      riskAssessment: riskAssessment || waiver.riskAssessment,
    };

    // Invalidate caches
    invalidateCache(organizationId, 'waivers', `waiver-${waiverId}`);
    invalidateCache(organizationId, 'waivers', `qmp-waivers-${waiver.qmpId}`);
    invalidateCache(organizationId, 'waivers', `section-${waiver.sectionCode}`);

    logger.info('Waiver request approved', {
      waiverId,
      approvedById,
      qmpId: waiver.qmpId,
      sectionCode: waiver.sectionCode,
    });

    return updatedWaiver;
  } catch (error) {
    logger.error('Error approving waiver request', { error, waiverId: approvalRequest.waiverId });
    throw error;
  }
}

/**
 * Reject a waiver request
 */
export async function rejectWaiverRequest(
  req: any,
  organizationId: number,
  waiverId: number,
  rejectedById: number,
  comments?: string
): Promise<WaiverRequest> {
  try {
    // Get the waiver request
    const waiver = await getWaiverRequest(req, organizationId, waiverId);

    if (!waiver) {
      throw new Error('Waiver request not found');
    }

    if (waiver.status !== WaiverStatus.PENDING) {
      throw new Error(`Cannot reject waiver with status: ${waiver.status}`);
    }

    // This is where we'd update the waiver in the database
    // For now, we'll update our mock waiver
    const updatedWaiver: WaiverRequest = {
      ...waiver,
      status: WaiverStatus.REJECTED,
      approvedById: rejectedById, // Use the same field to track who rejected it
      approvedDate: new Date(),
      comments: comments || waiver.comments,
    };

    // Invalidate caches
    invalidateCache(organizationId, 'waivers', `waiver-${waiverId}`);
    invalidateCache(organizationId, 'waivers', `qmp-waivers-${waiver.qmpId}`);
    invalidateCache(organizationId, 'waivers', `section-${waiver.sectionCode}`);

    logger.info('Waiver request rejected', {
      waiverId,
      rejectedById,
      qmpId: waiver.qmpId,
      sectionCode: waiver.sectionCode,
    });

    return updatedWaiver;
  } catch (error) {
    logger.error('Error rejecting waiver request', { error, waiverId });
    throw error;
  }
}

/**
 * Cancel a pending waiver request
 */
export async function cancelWaiverRequest(
  req: any,
  organizationId: number,
  waiverId: number,
  cancelledById: number
): Promise<WaiverRequest> {
  try {
    // Get the waiver request
    const waiver = await getWaiverRequest(req, organizationId, waiverId);

    if (!waiver) {
      throw new Error('Waiver request not found');
    }

    if (waiver.status !== WaiverStatus.PENDING) {
      throw new Error(`Cannot cancel waiver with status: ${waiver.status}`);
    }

    // Check if the user has permission to cancel the waiver
    // In a real app, we'd check if the user is the requester or an admin

    // This is where we'd update the waiver in the database
    // For now, we'll update our mock waiver
    const updatedWaiver: WaiverRequest = {
      ...waiver,
      status: WaiverStatus.CANCELLED,
    };

    // Invalidate caches
    invalidateCache(organizationId, 'waivers', `waiver-${waiverId}`);
    invalidateCache(organizationId, 'waivers', `qmp-waivers-${waiver.qmpId}`);
    invalidateCache(organizationId, 'waivers', `section-${waiver.sectionCode}`);

    logger.info('Waiver request cancelled', {
      waiverId,
      cancelledById,
      qmpId: waiver.qmpId,
      sectionCode: waiver.sectionCode,
    });

    return updatedWaiver;
  } catch (error) {
    logger.error('Error cancelling waiver request', { error, waiverId });
    throw error;
  }
}

/**
 * Check for expired waivers and update their status
 */
export async function checkAndUpdateExpiredWaivers(
  req: any,
  organizationId: number
): Promise<number> {
  try {
    // In a real app, we'd query the database for approved waivers with expiration dates in the past
    // For now, we'll check our mock list
    const allWaivers = await getWaiverRequestsForQmp(req, organizationId, 1); // Assumes qmpId=1 to simplify

    let updatedCount = 0;
    const now = new Date();

    for (const waiver of allWaivers) {
      if (
        waiver.status === WaiverStatus.APPROVED &&
        waiver.expirationDate &&
        waiver.expirationDate < now
      ) {
        // This waiver has expired

        // This is where we'd update the waiver in the database
        // For now, we'll just log and count
        logger.info('Waiver expired', {
          waiverId: waiver.id,
          qmpId: waiver.qmpId,
          sectionCode: waiver.sectionCode,
          expirationDate: waiver.expirationDate,
        });

        updatedCount++;

        // Invalidate caches
        invalidateCache(organizationId, 'waivers', `waiver-${waiver.id}`);
        invalidateCache(organizationId, 'waivers', `qmp-waivers-${waiver.qmpId}`);
        invalidateCache(organizationId, 'waivers', `section-${waiver.sectionCode}`);
      }
    }

    if (updatedCount > 0) {
      logger.info(`Updated ${updatedCount} expired waivers`, { organizationId });
    }

    return updatedCount;
  } catch (error) {
    logger.error('Error checking for expired waivers', { error, organizationId });
    throw error;
  }
}

export default {
  createWaiverRequest,
  getWaiverRequestsForQmp,
  getWaiverRequestsForSection,
  getWaiverRequest,
  approveWaiverRequest,
  rejectWaiverRequest,
  cancelWaiverRequest,
  checkAndUpdateExpiredWaivers,
  WaiverStatus,
};
