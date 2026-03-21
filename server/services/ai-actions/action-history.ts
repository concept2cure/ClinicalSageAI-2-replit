/**
 * Action History Service
 *
 * Queries the regulatoryAuditLogs table for AI action audit trail.
 * Provides paginated, filterable history of all executed actions.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { regulatoryAuditLogs } from '../../../shared/schema';

export interface ActionHistoryQuery {
  limit: number;
  offset: number;
  actionType?: string;
  projectId?: number;
}

export interface ActionHistoryEntry {
  auditId: string;
  actionType: string;
  targetType: string;
  targetId: string | number | null;
  success: boolean;
  durationMs: number;
  userId: number;
  userName: string;
  projectId: number | null;
  errors: unknown[];
  createdObjects: unknown[];
  updatedObjects: unknown[];
  timestamp: string;
}

export interface ActionHistoryResult {
  entries: ActionHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Get paginated action history for an organization.
 */
export async function getActionHistory(
  organizationId: number,
  query: ActionHistoryQuery
): Promise<ActionHistoryResult> {
  const { limit, offset, actionType, projectId } = query;

  try {
    // Build where conditions
    const conditions = [
      eq(regulatoryAuditLogs.organizationId, organizationId),
      eq(regulatoryAuditLogs.entityType, 'ai_action'),
    ];

    if (actionType) {
      conditions.push(eq(regulatoryAuditLogs.action, actionType));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [{ count: totalCount }] = await (db as any)
      .select({ count: sql<number>`count(*)` })
      .from(regulatoryAuditLogs)
      .where(whereClause);

    const total = Number(totalCount);

    // Get paginated results
    const rows = await (db as any)
      .select({
        auditId: regulatoryAuditLogs.auditId,
        action: regulatoryAuditLogs.action,
        newValue: regulatoryAuditLogs.newValue,
        userId: regulatoryAuditLogs.userId,
        userName: regulatoryAuditLogs.userName,
        createdAt: regulatoryAuditLogs.createdAt,
      })
      .from(regulatoryAuditLogs)
      .where(whereClause)
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Map to response entries
    const entries: ActionHistoryEntry[] = rows
      .filter((row: any) => {
        // Filter by projectId if specified
        if (projectId !== undefined) {
          const val = row.newValue as any;
          return val?.projectId === projectId;
        }
        return true;
      })
      .map((row: any) => {
        const val = (row.newValue || {}) as Record<string, any>;
        return {
          auditId: row.auditId,
          actionType: val.actionType || row.action,
          targetType: val.targetType || 'unknown',
          targetId: val.targetId || null,
          success: val.success ?? false,
          durationMs: val.durationMs || 0,
          userId: row.userId,
          userName: row.userName,
          projectId: val.projectId || null,
          errors: val.errors || [],
          createdObjects: val.createdObjects || [],
          updatedObjects: val.updatedObjects || [],
          timestamp: row.createdAt?.toISOString?.() || new Date().toISOString(),
        };
      });

    return {
      entries,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  } catch (err: any) {
    console.error('[Action History] Query failed:', err.message);
    return {
      entries: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }
}
