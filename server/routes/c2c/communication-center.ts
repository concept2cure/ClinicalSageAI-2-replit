/**
 * The Communication Center's persistence guard, project/visibility helpers
 * and the submission-center item routes.
 *
 * The submission-center handlers were written in routes/concept2cure-
 * communication-center.ts behind a registrar that nothing ever called
 * (ledger L161), so `concept2cure_submission_center_items` had two
 * migrations and no reachable reader. They are mounted here, at the same
 * prefix and behind the same chain as every other Concept2Cure router. The
 * agency-communication, authority-profile and PublishOps handlers still
 * live inline in routes/concept2cure.ts and import the helpers from here;
 * they move into this router in a later L53 slice.
 *
 * @module server/routes/c2c/communication-center
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import * as crypto from 'crypto';
import { db, pool } from '../../db';
import { projectTasks } from '../../../shared/schema';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import { buildCanonicalGovernedState } from '../../services/governed-ana-execution.js';
import type { CanonicalGovernedState } from '../../../shared/types/governed-document-fabric';
import {
  COMMUNICATION_VISIBILITY_TIERS,
  SUBMISSION_CENTER_ITEM_STATES,
  type CommunicationVisibilityTier,
  type SubmissionCenterItemRecord,
} from '../../../shared/types/communication-center';
import {
  validateSubmissionCenterInput,
  validateSubmissionTransition,
} from '../../../shared/utils/communication-center-rules';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  sendError,
  sendSuccess,
} from './shared';
import { createNotification } from './notifications';

type CanonicalGovernedStateResult =
  | CanonicalGovernedState
  | { error: string; degraded: boolean };

/* ── Persistence guard ─────────────────────────────────────────────────────── */

/** Every table a Communication Center handler reads or writes. */
export const COMMUNICATION_CENTER_TABLES = [
  'concept2cure_authority_profiles',
  'concept2cure_agency_communications',
  'concept2cure_publishops_services',
  'concept2cure_submission_center_items',
] as const;

let communicationCenterSchemaCheck: 'unknown' | 'ready' | 'missing' = 'unknown';

export async function ensureCommunicationCenterTables(): Promise<void> {
  if (communicationCenterSchemaCheck === 'ready') return;
  if (communicationCenterSchemaCheck === 'missing') {
    throw new Error(
      'Communication Center persistence tables are missing. Run migrations 20260331_communication_center_scaffold.sql and 20260401_submission_center_items.sql'
    );
  }
  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [
      [...COMMUNICATION_CENTER_TABLES],
    ]
  );
  const found = new Set(result.rows.map((r: any) => r.table_name));
  const missing = COMMUNICATION_CENTER_TABLES.filter(t => !found.has(t));
  if (missing.length > 0) {
    communicationCenterSchemaCheck = 'missing';
    throw new Error(
      `Communication Center persistence tables missing: ${missing.join(
        ', '
      )}. Run migrations 20260331_communication_center_scaffold.sql and 20260401_submission_center_items.sql`
    );
  }
  communicationCenterSchemaCheck = 'ready';
}

export function parseProjectParam(projectParam: string | string[] | undefined): number {
  const raw = Array.isArray(projectParam) ? projectParam[0] : projectParam;
  if (typeof raw !== 'string') {
    throw new Error('Invalid project ID');
  }
  const numericId = parseIntegerProjectId(raw);
  if (numericId === null) {
    throw new Error('Invalid project ID');
  }
  return numericId;
}

export function canViewVisibilityTier(
  visibilityTier: CommunicationVisibilityTier,
  userRole?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (!COMMUNICATION_VISIBILITY_TIERS.includes(visibilityTier)) return false;
  if (visibilityTier === 'restricted_legal_sensitive') {
    return ['admin', 'owner', 'compliance', 'legal'].some(r => role.includes(r));
  }
  if (visibilityTier === 'publishops_only') {
    return role.includes('publishops') || role.includes('admin');
  }
  if (visibilityTier === 'c2c_internal') {
    return role.includes('c2c') || role.includes('admin');
  }
  return true;
}

export function communicationCenterErrorStatus(error: unknown): number {
  const message = (error as any)?.message || '';
  if (typeof message === 'string' && message.includes('persistence tables')) {
    return 503;
  }
  return 400;
}

/* ── Submission-center items ───────────────────────────────────────────────── */

async function createCommunicationCenterTask(params: {
  organizationId: number;
  projectId: number;
  name: string;
  description: string;
  moduleType: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  metadata?: Record<string, unknown>;
}) {
  const values = {
    organizationId: params.organizationId,
    projectId: params.projectId,
    name: params.name,
    description: params.description,
    status: 'todo' as const,
    priority: params.priority || ('medium' as const),
    moduleType: params.moduleType,
    dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
    metadata: params.metadata || {},
  };
  // `projectTasks` is typed as `any` in the schema, so drizzle widens the
  // returning() result to a union that includes a non-iterable QueryResult.
  // The runtime value is always the inserted-rows array.
  const inserted = (await db.insert(projectTasks).values(values).returning()) as any[];
  return inserted[0];
}

function mapSubmissionCenterItem(row: any, organizationId: number, projectId: number): SubmissionCenterItemRecord {
  return {
    id: row.item_id,
    organizationId,
    projectId,
    title: row.title,
    authority: row.authority,
    submissionType: row.submission_type,
    sequenceNumber: row.sequence_number ?? undefined,
    gatewayProfile: row.gateway_profile ?? undefined,
    status: row.status,
    ectdPath: row.ectd_path ?? undefined,
    dispatchReady: row.dispatch_ready,
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

router.get('/projects/:projectId/submission-center/items', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(String(req.params.projectId));
    const result = await pool.query(
      `SELECT item_id, title, authority, submission_type, sequence_number, gateway_profile,
              status, ectd_path, dispatch_ready, metadata, created_by, created_at, updated_at
         FROM concept2cure_submission_center_items
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const items = result.rows.map((row: any) => mapSubmissionCenterItem(row, organizationId, projectId));
    return sendSuccess(res, items, { scope: { organizationId, projectId }, states: SUBMISSION_CENTER_ITEM_STATES });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to load submission center work items'
    );
  }
});

router.post('/projects/:projectId/submission-center/items', async (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(3),
    authority: z.string().min(2),
    submissionType: z.enum(['IND', 'NDA', 'BLA', '510k', 'PMA', 'MAA', 'ANDA', 'Other']),
    sequenceNumber: z.string().optional(),
    gatewayProfile: z.string().optional(),
    status: z.enum(SUBMISSION_CENTER_ITEM_STATES).default('draft'),
    ectdPath: z.string().optional(),
    dispatchReady: z.boolean().default(false),
    metadata: z.record(z.string(), z.unknown()).default({}),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(String(req.params.projectId));
    const input = schema.parse(req.body || {});
    validateSubmissionCenterInput(input);
    const now = new Date().toISOString();
    const item: SubmissionCenterItemRecord = {
      id: `sci_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      title: input.title,
      authority: input.authority,
      submissionType: input.submissionType,
      sequenceNumber: input.sequenceNumber,
      gatewayProfile: input.gatewayProfile,
      status: input.status,
      ectdPath: input.ectdPath,
      dispatchReady: input.dispatchReady,
      metadata: input.metadata,
      createdBy: req.userEmail || `user_${getUserId(req)}`,
      createdAt: now,
      updatedAt: now,
    };

    await pool.query(
      `INSERT INTO concept2cure_submission_center_items (
        item_id, organization_id, project_id, title, authority, submission_type, sequence_number,
        gateway_profile, status, ectd_path, dispatch_ready, metadata, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::timestamptz,$15::timestamptz)`,
      [
        item.id,
        organizationId,
        projectId,
        item.title,
        item.authority,
        item.submissionType,
        item.sequenceNumber ?? null,
        item.gatewayProfile ?? null,
        item.status,
        item.ectdPath ?? null,
        item.dispatchReady,
        JSON.stringify(item.metadata),
        item.createdBy,
        item.createdAt,
        item.updatedAt,
      ]
    );

    const task = await createCommunicationCenterTask({
      organizationId,
      projectId,
      name: `Submission center item: ${item.title}`,
      description: `${item.authority} ${item.submissionType} is in ${item.status} state`,
      moduleType: 'submission-center',
      priority: 'high',
      metadata: { submissionCenterItemId: item.id, status: item.status, authority: item.authority },
    });

    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      submissionCenterItemId: item.id,
      generatedTaskId: task?.id,
      status: item.status,
    });

    // Governed Document Decision Fabric evaluation on creation — surface initial blockers/warnings
    let canonicalGovernedState: CanonicalGovernedStateResult | undefined;
    try {
      canonicalGovernedState = await buildCanonicalGovernedState({
        context: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          actorId: String(getUserId(req)),
          intendedAction: 'create',
          artifactId: item.id,
          documentType: 'submission_package',
          regulatorBody: item.authority,
          submissionType: item.submissionType,
        },
        documentState: {
          hasContent: false,
          hasEvidence: false,
          hasBeenReviewed: false,
          hasApproval: false,
          hasPlacement: !!item.ectdPath,
          placementValid: !!item.ectdPath,
          hasProvenance: false,
          unresolvedContradictionCount: 0,
          criticalContradictionCount: 0,
        },
      });
    } catch (fabricError) {
      canonicalGovernedState = { error: 'Canonical governed-state evaluation unavailable', degraded: true };
    }

    return sendSuccess(res, { ...item, generatedTaskId: task?.id, canonicalGovernedState });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to create submission center work item'
    );
  }
});

router.patch('/projects/:projectId/submission-center/items/:itemId/status', async (req: Request, res: Response) => {
  const schema = z.object({
    status: z.enum(SUBMISSION_CENTER_ITEM_STATES),
    dispatchReady: z.boolean().optional(),
    ectdPath: z.string().optional(),
    sequenceNumber: z.string().optional(),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(String(req.params.projectId));
    const input = schema.parse(req.body || {});

    const result = await pool.query(
      `SELECT item_id, title, authority, submission_type, sequence_number, gateway_profile,
              status, ectd_path, dispatch_ready, metadata, created_by, created_at, updated_at
         FROM concept2cure_submission_center_items
        WHERE organization_id = $1 AND project_id = $2 AND item_id = $3
        LIMIT 1`,
      [organizationId, projectId, req.params.itemId]
    );
    if (result.rows.length === 0) return sendError(res, 404, 'Submission center work item not found');

    const previous = mapSubmissionCenterItem(result.rows[0], organizationId, projectId);
    validateSubmissionTransition(previous.status, input.status);

    const updated: SubmissionCenterItemRecord = {
      ...previous,
      status: input.status,
      dispatchReady: input.dispatchReady ?? previous.dispatchReady,
      ectdPath: input.ectdPath ?? previous.ectdPath,
      sequenceNumber: input.sequenceNumber ?? previous.sequenceNumber,
      updatedAt: new Date().toISOString(),
    };
    validateSubmissionCenterInput(updated);

    await pool.query(
      `UPDATE concept2cure_submission_center_items
          SET status = $1, dispatch_ready = $2, ectd_path = $3, sequence_number = $4, updated_at = $5::timestamptz
        WHERE organization_id = $6 AND project_id = $7 AND item_id = $8`,
      [
        updated.status,
        updated.dispatchReady,
        updated.ectdPath ?? null,
        updated.sequenceNumber ?? null,
        updated.updatedAt,
        organizationId,
        projectId,
        updated.id,
      ]
    );

    if (req.userId && ['ready_for_publish', 'published', 'submitted_to_gateway'].includes(updated.status)) {
      // The one notification writer (routes/c2c/notifications.ts), not a
      // second insert into the same table.
      await createNotification({
        orgId: organizationId,
        projectId,
        recipientUserId: getUserId(req),
        actorUserId: getUserId(req),
        notificationType: 'submission_center_transition',
        title: `Submission item moved to ${updated.status}`,
        body: `${updated.title} (${updated.authority}) transitioned to ${updated.status}.`,
        severity: updated.status === 'submitted_to_gateway' ? 'critical' : 'info',
      });
    }

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${projectId}`, previous, updated);

    // Governed Document Decision Fabric evaluation for dispatch readiness
    let canonicalGovernedState: CanonicalGovernedStateResult | undefined;
    try {
      canonicalGovernedState = await buildCanonicalGovernedState({
        context: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          actorId: String(getUserId(req)),
          intendedAction: 'dispatch',
          artifactId: updated.id,
          documentType: 'submission_package',
          regulatorBody: updated.authority,
          submissionType: updated.submissionType,
        },
        documentState: {
          hasContent: true,
          hasEvidence: !!updated.ectdPath,
          hasBeenReviewed: ['ready_for_publish', 'published', 'submitted_to_gateway'].includes(updated.status),
          hasApproval: ['ready_for_publish', 'published', 'submitted_to_gateway'].includes(updated.status),
          hasPlacement: !!updated.ectdPath,
          placementValid: !!updated.ectdPath,
          hasProvenance: true,
          unresolvedContradictionCount: 0,
          criticalContradictionCount: 0,
        },
        publishState: {
          exportCompleted: ['ready_for_publish', 'published', 'submitted_to_gateway'].includes(updated.status),
          hasGatewayProfile: !!updated.gatewayProfile,
          gatewayProfileValid: !!updated.gatewayProfile,
          hasSequenceNumber: !!updated.sequenceNumber,
          hasAuthorityProfile: !!updated.authority,
          authorityAcceptsFormat: true,
          allSectionsApproved: ['ready_for_publish', 'published', 'submitted_to_gateway'].includes(updated.status),
          staleSectionCount: 0,
        },
      });
    } catch (fabricError) {
      canonicalGovernedState = { error: 'Canonical governed-state evaluation unavailable', degraded: true };
    }

    return sendSuccess(res, { ...updated, canonicalGovernedState });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to update submission center item status'
    );
  }
});

export default router;
