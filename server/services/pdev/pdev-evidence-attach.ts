/**
 * PDEV evidence attach — wire evidence_objects to PDEV activities.
 *
 * The platform already has the evidence graph (`evidence_objects` + `evidence_links`
 * — see `shared/schema/programs.ts`). This service is the read/write surface
 * that ties evidence to PDEV activities specifically:
 *
 *   - attach: creates an evidence_links row with
 *       targetType='pdev_activity',
 *       targetId=<activity_state_uuid>,
 *       targetPath='<workstream>.<activity_key>'
 *     and updates the activity's evidence_object_ids JSONB cache.
 *
 *   - detach: removes the link + updates the cache.
 *
 *   - listForActivity: returns hydrated evidence rows for one activity.
 *
 * Tenant isolation: the regulatoryPrograms join gates the program; the
 * evidenceObjects.organization_id gates the evidence.
 *
 * @module server/services/pdev/pdev-evidence-attach
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { evidenceObjects, evidenceLinks } from '../../../shared/schema/programs';
import type { EvidenceObject } from '../../../shared/schema/programs';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import { getActivityByKey } from './pdev-activity-registry';
import auditService from '../auditService';

const logger = createScopedLogger('pdev-evidence-attach');

const TARGET_TYPE = 'pdev_activity';

export interface PdevEvidenceAttachInput {
  programId: string;
  organizationId: number;
  userId: number;
  activityKey: string;
  evidenceObjectId: string;
  /** Default 'supports'. */
  linkType?: 'supports' | 'contradicts' | 'references' | 'supersedes';
  /** Default 'moderate'. */
  strength?: 'strong' | 'moderate' | 'weak';
  rationale?: string;
}

export interface PdevEvidenceDetachInput {
  programId: string;
  organizationId: number;
  userId: number;
  activityKey: string;
  evidenceObjectId: string;
}

export class PdevEvidenceAttachService {
  /**
   * Attach an evidence object to a PDEV activity. Creates the activity
   * state row if it doesn't exist (state 'evidence_linked' on first
   * attach, otherwise no state change).
   */
  async attach(input: PdevEvidenceAttachInput): Promise<{
    activityStateId: string;
    evidenceLinkId: string;
    evidenceObjectIds: string[];
  }> {
    const activity = getActivityByKey(input.activityKey);
    if (!activity) {
      throw new Error(`Unknown PDEV activity key: ${input.activityKey}`);
    }

    // Tenant gate: program belongs to org.
    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) {
      throw new Error('PDEV program not found in tenant');
    }

    // Tenant gate: evidence belongs to same org.
    const evidenceRows = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(
        and(
          eq(evidenceObjects.id, input.evidenceObjectId),
          eq(evidenceObjects.organizationId, input.organizationId)
        )
      )
      .limit(1);
    if (!evidenceRows[0]) {
      throw new Error('Evidence object not found in tenant');
    }

    // Upsert the activity state row.
    const now = new Date();
    const existing = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, input.programId),
          eq(pdevProgramActivities.activityKey, activity.key)
        )
      )
      .limit(1);

    const previousIds = Array.isArray(existing[0]?.evidenceObjectIds)
      ? (existing[0]!.evidenceObjectIds as string[])
      : [];
    const mergedIds = Array.from(new Set([...previousIds, input.evidenceObjectId]));

    let activityStateId: string;
    if (existing[0]) {
      // Don't downgrade an already-advanced state. Only move to
      // 'evidence_linked' if currently 'not_started' or 'drafting'.
      const shouldAdvance = ['not_started', 'drafting'].includes(existing[0].state);
      const updated = await db
        .update(pdevProgramActivities)
        .set({
          evidenceObjectIds: mergedIds,
          state: shouldAdvance ? 'evidence_linked' : existing[0].state,
          stateChangedAt: shouldAdvance ? now : existing[0].stateChangedAt,
          stateChangedBy: shouldAdvance ? input.userId : existing[0].stateChangedBy,
          updatedAt: now,
        })
        .where(eq(pdevProgramActivities.id, existing[0].id))
        .returning({ id: pdevProgramActivities.id });
      activityStateId = updated[0].id;
    } else {
      const inserted = await db
        .insert(pdevProgramActivities)
        .values({
          programId: input.programId,
          activityKey: activity.key,
          workstream: activity.workstream,
          stage: activity.stage,
          state: 'evidence_linked',
          evidenceObjectIds: mergedIds,
          stateChangedAt: now,
          stateChangedBy: input.userId,
        })
        .returning({ id: pdevProgramActivities.id });
      activityStateId = inserted[0].id;
    }

    // Create the evidence_links row.
    const linkRows = await db
      .insert(evidenceLinks)
      .values({
        organizationId: input.organizationId,
        evidenceId: input.evidenceObjectId,
        targetType: TARGET_TYPE,
        targetId: activityStateId,
        targetPath: `${activity.workstream}.${activity.key}`,
        linkType: input.linkType ?? 'supports',
        strength: input.strength ?? 'moderate',
        rationale: input.rationale ?? null,
        createdBy: String(input.userId),
      })
      .returning({ id: evidenceLinks.id });
    const linkId = linkRows[0].id;

    void auditService.logAction({
      tenantId: input.organizationId,
      userId: input.userId,
      action: 'pdev_evidence_attached',
      resourceType: 'pdev_program_activity',
      resourceId: activityStateId,
      details: {
        programId: input.programId,
        activityKey: activity.key,
        evidenceObjectId: input.evidenceObjectId,
        evidenceLinkId: linkId,
        linkType: input.linkType ?? 'supports',
      },
    });

    logger.info('Evidence attached to PDEV activity', {
      activityKey: activity.key,
      evidenceObjectId: input.evidenceObjectId,
    });

    return {
      activityStateId,
      evidenceLinkId: linkId,
      evidenceObjectIds: mergedIds,
    };
  }

  /**
   * Remove an evidence link from a PDEV activity. Does not delete the
   * evidence object itself.
   */
  async detach(input: PdevEvidenceDetachInput): Promise<{
    activityStateId: string;
    evidenceObjectIds: string[];
    removedLinks: number;
  }> {
    const activity = getActivityByKey(input.activityKey);
    if (!activity) {
      throw new Error(`Unknown PDEV activity key: ${input.activityKey}`);
    }

    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) {
      throw new Error('PDEV program not found in tenant');
    }

    const existing = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, input.programId),
          eq(pdevProgramActivities.activityKey, activity.key)
        )
      )
      .limit(1);
    if (!existing[0]) {
      return {
        activityStateId: '',
        evidenceObjectIds: [],
        removedLinks: 0,
      };
    }

    const previousIds = Array.isArray(existing[0].evidenceObjectIds)
      ? (existing[0].evidenceObjectIds as string[])
      : [];
    const mergedIds = previousIds.filter(id => id !== input.evidenceObjectId);

    const now = new Date();
    await db
      .update(pdevProgramActivities)
      .set({ evidenceObjectIds: mergedIds, updatedAt: now })
      .where(eq(pdevProgramActivities.id, existing[0].id));

    // Remove only the link rows that match this activity state + this evidence object.
    const removed = await db
      .delete(evidenceLinks)
      .where(
        and(
          eq(evidenceLinks.organizationId, input.organizationId),
          eq(evidenceLinks.evidenceId, input.evidenceObjectId),
          eq(evidenceLinks.targetType, TARGET_TYPE),
          eq(evidenceLinks.targetId, existing[0].id)
        )
      )
      .returning({ id: evidenceLinks.id });

    void auditService.logAction({
      tenantId: input.organizationId,
      userId: input.userId,
      action: 'pdev_evidence_detached',
      resourceType: 'pdev_program_activity',
      resourceId: existing[0].id,
      details: {
        programId: input.programId,
        activityKey: activity.key,
        evidenceObjectId: input.evidenceObjectId,
        removedLinks: removed.length,
      },
    });

    return {
      activityStateId: existing[0].id,
      evidenceObjectIds: mergedIds,
      removedLinks: removed.length,
    };
  }

  /**
   * List evidence objects currently attached to one PDEV activity.
   */
  async listForActivity(
    programId: string,
    organizationId: number,
    activityKey: string
  ): Promise<EvidenceObject[]> {
    const activity = getActivityByKey(activityKey);
    if (!activity) return [];

    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) return [];

    const state = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, programId),
          eq(pdevProgramActivities.activityKey, activityKey)
        )
      )
      .limit(1);
    if (!state[0]) return [];

    const links = await db
      .select({ evidenceId: evidenceLinks.evidenceId })
      .from(evidenceLinks)
      .where(
        and(
          eq(evidenceLinks.organizationId, organizationId),
          eq(evidenceLinks.targetType, TARGET_TYPE),
          eq(evidenceLinks.targetId, state[0].id)
        )
      );
    if (links.length === 0) return [];

    const evidenceIds = links.map(l => l.evidenceId);
    const rows: EvidenceObject[] = [];
    for (const id of evidenceIds) {
      const r = await db
        .select()
        .from(evidenceObjects)
        .where(
          and(
            eq(evidenceObjects.id, id),
            eq(evidenceObjects.organizationId, organizationId)
          )
        )
        .limit(1);
      if (r[0]) rows.push(r[0]);
    }
    return rows;
  }
}

export const pdevEvidenceAttachService = new PdevEvidenceAttachService();
