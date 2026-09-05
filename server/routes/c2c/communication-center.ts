/**
 * The Communication Center's persistence guard, project/visibility helpers
 * and the submission-center item routes.
 *
 * The submission-center handlers were written in routes/concept2cure-
 * communication-center.ts behind a registrar that nothing ever called
 * (ledger L161), so `concept2cure_submission_center_items` had two
 * migrations and no reachable reader. They are mounted here, at the same
 * prefix and behind the same chain as every other Concept2Cure router. The
 * agency-communication, authority-profile and PublishOps handlers followed
 * from routes/concept2cure.ts in L53 slice 4, so the whole domain answers
 * from one router; the main file still imports the persistence probe and
 * project helpers from here for its remaining inline handlers.
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
  PUBLISHOPS_SERVICE_STATES,
  SUBMISSION_CENTER_ITEM_STATES,
  type AgencyCommunicationEventRecord,
  type AuthorityProfileRecord,
  type CommunicationVisibilityTier,
  type PublishOpsServiceRecord,
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
    } catch {
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
    } catch {
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

/* ── Authority profiles, agency communications, PublishOps services ───────── */

router.get('/projects/:projectId/authority-profiles', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT profile_id, authority, center_or_division, channel_type, submission_transport,
              accepted_formats, validation_requirements, package_constraints, acknowledgment_model,
              message_receipt_model, metadata_requirements, is_active, created_by, created_at, updated_at
         FROM concept2cure_authority_profiles
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const profiles: AuthorityProfileRecord[] = result.rows.map((row: any) => ({
      id: row.profile_id,
      organizationId,
      projectId,
      authority: row.authority,
      centerOrDivision: row.center_or_division,
      channelType: row.channel_type,
      submissionTransport: row.submission_transport,
      acceptedFormats: row.accepted_formats || [],
      validationRequirements: row.validation_requirements || [],
      packageConstraints: row.package_constraints || [],
      acknowledgmentModel: row.acknowledgment_model,
      messageReceiptModel: row.message_receipt_model,
      metadataRequirements: row.metadata_requirements || [],
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return sendSuccess(res, profiles, {
      scope: { organizationId, projectId },
      model: 'authority_profile',
      behavior: 'configuration_driven',
    });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to load authority profiles'
    );
  }
});

router.post('/projects/:projectId/authority-profiles', async (req: Request, res: Response) => {
  const schema = z.object({
    authority: z.string().min(2),
    centerOrDivision: z.string().min(2),
    channelType: z.enum(['portal', 'gateway', 'email', 'mixed']),
    submissionTransport: z.string().min(2),
    acceptedFormats: z.array(z.string()).default([]),
    validationRequirements: z.array(z.string()).default([]),
    packageConstraints: z.array(z.string()).default([]),
    acknowledgmentModel: z.string().min(2),
    messageReceiptModel: z.string().min(2),
    metadataRequirements: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    const now = new Date().toISOString();
    const profile: AuthorityProfileRecord = {
      id: `auth_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      ...input,
      createdBy: req.userEmail || `user_${getUserId(req)}`,
      createdAt: now,
      updatedAt: now,
    };
    await pool.query(
      `INSERT INTO concept2cure_authority_profiles (
         profile_id, organization_id, project_id, authority, center_or_division, channel_type,
         submission_transport, accepted_formats, validation_requirements, package_constraints,
         acknowledgment_model, message_receipt_model, metadata_requirements, is_active, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16::timestamptz,$17::timestamptz)`,
      [
        profile.id,
        organizationId,
        projectId,
        profile.authority,
        profile.centerOrDivision,
        profile.channelType,
        profile.submissionTransport,
        JSON.stringify(profile.acceptedFormats),
        JSON.stringify(profile.validationRequirements),
        JSON.stringify(profile.packageConstraints),
        profile.acknowledgmentModel,
        profile.messageReceiptModel,
        JSON.stringify(profile.metadataRequirements),
        profile.isActive,
        profile.createdBy,
        profile.createdAt,
        profile.updatedAt,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      authorityProfileId: profile.id,
      authority: profile.authority,
    });
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to create authority profile'
    );
  }
});

router.get('/projects/:projectId/agency-communications', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT event_id, source_type, communication_type, source_channel, linked_submission_id,
              linked_package_id, linked_section_codes, linked_artifact_ids, received_date, due_date,
              urgency, response_required, extracted_issues, human_review_status, closure_status, audit_metadata
         FROM concept2cure_agency_communications
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const records: AgencyCommunicationEventRecord[] = result.rows.map((row: any) => ({
      id: row.event_id,
      organizationId,
      projectId,
      sourceType: row.source_type,
      communicationType: row.communication_type,
      sourceChannel: row.source_channel,
      linkedSubmissionId: row.linked_submission_id ?? undefined,
      linkedPackageId: row.linked_package_id ?? undefined,
      linkedSectionCodes: row.linked_section_codes || [],
      linkedArtifactIds: row.linked_artifact_ids || [],
      receivedDate: new Date(row.received_date).toISOString(),
      dueDate: row.due_date ? new Date(row.due_date).toISOString() : undefined,
      urgency: row.urgency,
      responseRequired: row.response_required,
      extractedIssues: row.extracted_issues || [],
      humanReviewStatus: row.human_review_status,
      closureStatus: row.closure_status,
      auditMetadata: row.audit_metadata,
    }));
    const visible = records.filter(event =>
      canViewVisibilityTier(event.auditMetadata.visibilityTier, req.userRole)
    );
    return sendSuccess(res, visible, {
      scope: { organizationId, projectId },
      model: 'agency_communication_event',
      filtered: records.length - visible.length,
    });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to load agency communication events'
    );
  }
});

router.post('/projects/:projectId/agency-communications', async (req: Request, res: Response) => {
  const schema = z.object({
    sourceType: z.enum([
      'agency_portal_event',
      'gateway_acknowledgment',
      'validation_result',
      'email_request_or_letter',
      'uploaded_official_correspondence',
      'meeting_minutes',
      'managed_service_operator_event',
      'manual_logged_event',
      'internal_discussion_linked',
    ]),
    communicationType: z.string().min(2),
    sourceChannel: z.string().min(2),
    linkedSubmissionId: z.string().optional(),
    linkedPackageId: z.string().optional(),
    linkedSectionCodes: z.array(z.string()).default([]),
    linkedArtifactIds: z.array(z.string()).default([]),
    dueDate: z.string().optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    responseRequired: z.boolean().default(false),
    extractedIssues: z.array(z.string()).default([]),
    humanReviewStatus: z.enum(['pending_review', 'triaged', 'actioned']).default('pending_review'),
    closureStatus: z.enum(['open', 'in_progress', 'closed']).default('open'),
    visibilityTier: z.enum(COMMUNICATION_VISIBILITY_TIERS),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    if (!canViewVisibilityTier(input.visibilityTier, req.userRole)) {
      return sendError(res, 403, 'Visibility tier not permitted for current role');
    }
    const now = new Date().toISOString();
    const event: AgencyCommunicationEventRecord = {
      id: `ace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      sourceType: input.sourceType,
      communicationType: input.communicationType,
      sourceChannel: input.sourceChannel,
      linkedSubmissionId: input.linkedSubmissionId,
      linkedPackageId: input.linkedPackageId,
      linkedSectionCodes: input.linkedSectionCodes,
      linkedArtifactIds: input.linkedArtifactIds,
      receivedDate: now,
      dueDate: input.dueDate,
      urgency: input.urgency,
      responseRequired: input.responseRequired,
      extractedIssues: input.extractedIssues,
      humanReviewStatus: input.humanReviewStatus,
      closureStatus: input.closureStatus,
      auditMetadata: {
        capturedBy: req.userEmail || `user_${getUserId(req)}`,
        capturedAt: now,
        visibilityTier: input.visibilityTier,
      },
    };
    await pool.query(
      `INSERT INTO concept2cure_agency_communications (
        event_id, organization_id, project_id, source_type, communication_type, source_channel,
        linked_submission_id, linked_package_id, linked_section_codes, linked_artifact_ids,
        received_date, due_date, urgency, response_required, extracted_issues,
        human_review_status, closure_status, audit_metadata, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::timestamptz,$12::timestamptz,$13,$14,$15::jsonb,$16,$17,$18::jsonb,$19::timestamptz)`,
      [
        event.id,
        organizationId,
        projectId,
        event.sourceType,
        event.communicationType,
        event.sourceChannel,
        event.linkedSubmissionId ?? null,
        event.linkedPackageId ?? null,
        JSON.stringify(event.linkedSectionCodes),
        JSON.stringify(event.linkedArtifactIds),
        event.receivedDate,
        event.dueDate ?? null,
        event.urgency,
        event.responseRequired,
        JSON.stringify(event.extractedIssues),
        event.humanReviewStatus,
        event.closureStatus,
        JSON.stringify(event.auditMetadata),
        now,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      agencyCommunicationEventId: event.id,
      sourceType: event.sourceType,
      visibilityTier: event.auditMetadata.visibilityTier,
    });
    return sendSuccess(res, event);
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to create agency communication event'
    );
  }
});

/**
 * Advance an agency communication through triage.
 *
 * ── Why this route exists ────────────────────────────────────────────────────
 * The Communication Center's "Triage" / "Advance" button — the only action on
 * every agency-communication card — moved the status in React state and stopped
 * there. Nothing was persisted, so the triage a regulatory lead performed
 * vanished on reload, and a second person opening the same screen saw an
 * untouched queue. On a surface whose entire purpose is tracking what the
 * agency asked for and whether anyone has answered, that is a record-keeping
 * failure rather than a UI one.
 *
 * The columns were always there — `human_review_status` and `closure_status`
 * are written by the POST above and read by the GET above. Only the transition
 * was missing.
 *
 * ── The transition is computed here, not accepted from the client ────────────
 * The client sends WHICH event to advance, not what to advance it to. Letting
 * the caller name the next status would let a card jump from pending_review
 * straight to actioned, skipping the triage step the audit trail is supposed to
 * record. The pairing (review status, closure status) advances together because
 * that is what the button means: triaging opens work, actioning closes it.
 */
const AGENCY_COMM_ADVANCE: Record<string, { humanReviewStatus: string; closureStatus: string }> = {
  pending_review: { humanReviewStatus: 'triaged', closureStatus: 'in_progress' },
  triaged: { humanReviewStatus: 'actioned', closureStatus: 'closed' },
};

router.patch(
  '/projects/:projectId/agency-communications/:eventId/advance',
  async (req: Request, res: Response) => {
    try {
      await ensureCommunicationCenterTables();
      const organizationId = getOrganizationId(req);
      const projectId = parseProjectParam(req.params.projectId);
      const eventId = String(req.params.eventId || '').trim();
      if (!eventId) {
        return sendError(res, 400, 'An event id is required.');
      }

      // Read the current state inside the same request so the transition is
      // computed from what is stored, not from what the client last rendered.
      const current = await pool.query(
        `SELECT human_review_status
           FROM concept2cure_agency_communications
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3`,
        [organizationId, projectId, eventId]
      );
      if (current.rowCount === 0) {
        return sendError(res, 404, 'That communication was not found in this project.');
      }

      const from = String(current.rows[0].human_review_status || 'pending_review');
      const next = AGENCY_COMM_ADVANCE[from];
      if (!next) {
        // Already actioned. Refused rather than silently re-applied, so the
        // audit trail never carries a transition that did not change anything.
        return sendError(res, 409, 'That communication has already been actioned.');
      }

      const updated = await pool.query(
        `UPDATE concept2cure_agency_communications
            SET human_review_status = $4, closure_status = $5, updated_at = NOW()
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
          RETURNING event_id, human_review_status, closure_status`,
        [organizationId, projectId, eventId, next.humanReviewStatus, next.closureStatus]
      );

      await logAuditEntry(req, 'UPDATE', 'project', `proj_${projectId}`, undefined, {
        agencyCommunicationEventId: eventId,
        humanReviewStatusFrom: from,
        humanReviewStatusTo: next.humanReviewStatus,
        closureStatusTo: next.closureStatus,
      });

      const row = updated.rows[0];
      return sendSuccess(res, {
        id: row.event_id,
        humanReviewStatus: row.human_review_status,
        closureStatus: row.closure_status,
      });
    } catch (error: any) {
      return sendError(
        res,
        communicationCenterErrorStatus(error),
        error?.message || 'Failed to advance the agency communication'
      );
    }
  }
);

router.get('/projects/:projectId/publishops/services', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT service_id, status, service_request_title, entitlement_level, requested_by_role, requested_by,
              operator_assignee, blocked_reason, created_at, updated_at
         FROM concept2cure_publishops_services
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const services: PublishOpsServiceRecord[] = result.rows.map((row: any) => ({
      id: row.service_id,
      organizationId,
      projectId,
      status: row.status,
      serviceRequestTitle: row.service_request_title,
      entitlementLevel: row.entitlement_level,
      requestedByRole: row.requested_by_role,
      requestedBy: row.requested_by,
      operatorAssignee: row.operator_assignee ?? undefined,
      blockedReason: row.blocked_reason ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return sendSuccess(res, services, {
      states: PUBLISHOPS_SERVICE_STATES,
      scope: { organizationId, projectId },
    });
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to load PublishOps services'
    );
  }
});

router.post('/projects/:projectId/publishops/services', async (req: Request, res: Response) => {
  const schema = z.object({
    serviceRequestTitle: z.string().min(3),
    entitlementLevel: z.enum([
      'core_self_serve',
      'advanced_publishing_tooling',
      'managed_publishops_service',
    ]),
    requestedByRole: z.enum([
      'managed_submission_operator',
      'managed_submission_reviewer',
      'client_project_owner',
      'client_reviewer',
      'outside_consultant',
    ]),
    operatorAssignee: z.string().optional(),
    blockedReason: z.string().optional(),
    status: z.enum(PUBLISHOPS_SERVICE_STATES).default('requested'),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    const now = new Date().toISOString();
    const service: PublishOpsServiceRecord = {
      id: `pos_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      status: input.status,
      serviceRequestTitle: input.serviceRequestTitle,
      entitlementLevel: input.entitlementLevel,
      requestedByRole: input.requestedByRole,
      requestedBy: req.userEmail || `user_${getUserId(req)}`,
      operatorAssignee: input.operatorAssignee,
      blockedReason: input.blockedReason,
      createdAt: now,
      updatedAt: now,
    };
    await pool.query(
      `INSERT INTO concept2cure_publishops_services (
        service_id, organization_id, project_id, status, service_request_title, entitlement_level,
        requested_by_role, requested_by, operator_assignee, blocked_reason, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz)`,
      [
        service.id,
        organizationId,
        projectId,
        service.status,
        service.serviceRequestTitle,
        service.entitlementLevel,
        service.requestedByRole,
        service.requestedBy,
        service.operatorAssignee ?? null,
        service.blockedReason ?? null,
        service.createdAt,
        service.updatedAt,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      publishOpsServiceId: service.id,
      status: service.status,
      entitlementLevel: service.entitlementLevel,
    });
    return sendSuccess(res, service);
  } catch (error: any) {
    return sendError(
      res,
      communicationCenterErrorStatus(error),
      error?.message || 'Failed to create PublishOps service request'
    );
  }
});

router.patch(
  '/projects/:projectId/publishops/services/:serviceId/status',
  async (req: Request, res: Response) => {
    const schema = z.object({
      status: z.enum(PUBLISHOPS_SERVICE_STATES),
      blockedReason: z.string().optional(),
      operatorAssignee: z.string().optional(),
    });
    try {
      await ensureCommunicationCenterTables();
      const organizationId = getOrganizationId(req);
      const projectId = parseProjectParam(req.params.projectId);
      const input = schema.parse(req.body || {});
      const priorRes = await pool.query(
        `SELECT service_id, status, service_request_title, entitlement_level, requested_by_role, requested_by,
                operator_assignee, blocked_reason, created_at, updated_at
           FROM concept2cure_publishops_services
          WHERE organization_id = $1 AND project_id = $2 AND service_id = $3
          LIMIT 1`,
        [organizationId, projectId, req.params.serviceId]
      );
      if (priorRes.rows.length === 0) {
        return sendError(res, 404, 'PublishOps service request not found');
      }
      const row = priorRes.rows[0];
      const previous: PublishOpsServiceRecord = {
        id: row.service_id,
        organizationId,
        projectId,
        status: row.status,
        serviceRequestTitle: row.service_request_title,
        entitlementLevel: row.entitlement_level,
        requestedByRole: row.requested_by_role,
        requestedBy: row.requested_by,
        operatorAssignee: row.operator_assignee ?? undefined,
        blockedReason: row.blocked_reason ?? undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
      const updated: PublishOpsServiceRecord = {
        ...previous,
        status: input.status,
        blockedReason: input.blockedReason ?? previous.blockedReason,
        operatorAssignee: input.operatorAssignee ?? previous.operatorAssignee,
        updatedAt: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE concept2cure_publishops_services
            SET status = $1,
                blocked_reason = $2,
                operator_assignee = $3,
                updated_at = $4::timestamptz
          WHERE organization_id = $5 AND project_id = $6 AND service_id = $7`,
        [
          updated.status,
          updated.blockedReason ?? null,
          updated.operatorAssignee ?? null,
          updated.updatedAt,
          organizationId,
          projectId,
          updated.id,
        ]
      );
      await logAuditEntry(req, 'UPDATE', 'project', `proj_${projectId}`, previous, updated);
      return sendSuccess(res, updated);
    } catch (error: any) {
      return sendError(
        res,
        communicationCenterErrorStatus(error),
        error?.message || 'Failed to update PublishOps service status'
      );
    }
  }
);

export default router;
