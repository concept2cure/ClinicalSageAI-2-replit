/**
 * PDEV provenance trace — single read endpoint that returns the full
 * regulatory traceability tree for one PDEV activity on one program.
 *
 * For a regulated user, "provenance" means: for every artifact filed
 * under this activity, who/when/why was it produced, what evidence
 * supports it, what AI generation chain led to it, what audit events
 * have touched it. This service stitches together the existing real
 * tables — no new schema:
 *
 *   - pdev_program_activities         (per-program state row)
 *   - evidence_links + evidence_objects   (regulatoryPrograms attached evidence)
 *   - concept2cure_artifacts          (governed AI / human artifacts whose
 *                                      provenance.pdevActivityKey matches)
 *   - data_lineage_records            (source → target chain for each artifact)
 *   - audit_logs                      (every recorded action on the activity)
 *
 * Tenant gated via regulatoryPrograms join, same pattern as the rest
 * of the PDEV surface.
 *
 * @module server/services/pdev/pdev-provenance-trace
 */

import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms, evidenceObjects, evidenceLinks } from '../../../shared/schema/programs';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import {
  concept2cureArtifacts,
  auditLogs,
  dataLineageRecords,
} from '../../../shared/schema';
import {
  getActivityByKey,
  type PdevActivityState,
} from './pdev-activity-registry';

const logger = createScopedLogger('pdev-provenance-trace');

export interface PdevProvenanceArtifact {
  id: number;
  artifactId: string;
  title: string;
  type: string;
  status: string;
  version: number;
  ctdSection: string | null;
  contentHash: string | null;
  createdAt: string;
  citationCount: number;
}

export interface PdevProvenanceEvidence {
  id: string;
  title: string;
  evidenceType: string;
  evidenceCategory: string;
  sourceType: string;
  sourceCitation: string | null;
  linkType: string;
  attachedAt: string;
}

export interface PdevProvenanceLineage {
  id: number;
  sourceObjectType: string;
  sourceObjectId: string;
  sourceTitle: string | null;
  targetObjectType: string;
  targetObjectId: string;
  linkageType: string;
  transformationType: string | null;
  confidenceScore: number | null;
  aiModelUsed: string | null;
  createdAt: string;
}

export interface PdevProvenanceAuditEvent {
  id: string;
  action: string;
  userId: number | null;
  createdAt: string;
  details: unknown;
}

export interface PdevProvenanceTrace {
  programId: string;
  activityKey: string;
  activityTitle: string;
  workstream: string;
  stage: string;
  currentState: PdevActivityState;
  /** Activity-state row (if it exists). */
  activityStateRow: {
    id: string;
    notes: string | null;
    ownerUserId: number | null;
    reviewerUserId: number | null;
    stateChangedAt: string;
    stateChangedBy: number | null;
  } | null;
  /** Artifacts whose concept2cure_artifacts.metadata.provenance.pdevActivityKey matches. */
  artifacts: PdevProvenanceArtifact[];
  /** Evidence attached via evidence_links (targetType='pdev_activity'). */
  evidence: PdevProvenanceEvidence[];
  /** data_lineage_records where source OR target is one of the artifacts above. */
  lineage: PdevProvenanceLineage[];
  /** audit_logs scoped to the activity state row. */
  audit: PdevProvenanceAuditEvent[];
  /** Roll-up counts. */
  counts: {
    artifacts: number;
    evidence: number;
    lineageEdges: number;
    auditEvents: number;
  };
}

const TARGET_TYPE_PDEV_ACTIVITY = 'pdev_activity';

export class PdevProvenanceTraceService {
  async trace(
    programId: string,
    organizationId: number,
    activityKey: string
  ): Promise<PdevProvenanceTrace | null> {
    const activity = getActivityByKey(activityKey);
    if (!activity) return null;

    // Tenant gate.
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
    if (!programRows[0]) return null;

    // 1. Activity-state row (may not exist if no one has touched the activity).
    const stateRow = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, programId),
          eq(pdevProgramActivities.activityKey, activityKey)
        )
      )
      .limit(1);
    const state = stateRow[0];

    // 2. Evidence linked to the activity state row.
    let evidence: PdevProvenanceEvidence[] = [];
    if (state) {
      const links = await db
        .select({
          evidenceId: evidenceLinks.evidenceId,
          linkType: evidenceLinks.linkType,
          createdAt: evidenceLinks.createdAt,
        })
        .from(evidenceLinks)
        .where(
          and(
            eq(evidenceLinks.organizationId, organizationId),
            eq(evidenceLinks.targetType, TARGET_TYPE_PDEV_ACTIVITY),
            eq(evidenceLinks.targetId, state.id)
          )
        );
      if (links.length > 0) {
        const ids = links.map(l => l.evidenceId);
        const rows = await db
          .select()
          .from(evidenceObjects)
          .where(
            and(
              eq(evidenceObjects.organizationId, organizationId),
              inArray(evidenceObjects.id, ids)
            )
          );
        const linkByEvidence = new Map<string, { linkType: string; createdAt: Date }>();
        for (const l of links) {
          linkByEvidence.set(l.evidenceId, {
            linkType: l.linkType ?? 'supports',
            createdAt: l.createdAt as Date,
          });
        }
        evidence = rows.map(e => {
          const link = linkByEvidence.get(e.id);
          return {
            id: e.id,
            title: e.title,
            evidenceType: e.evidenceType,
            evidenceCategory: e.evidenceCategory,
            sourceType: e.sourceType,
            sourceCitation: e.sourceCitation,
            linkType: link?.linkType ?? 'supports',
            attachedAt: link?.createdAt?.toISOString() ?? new Date().toISOString(),
          };
        });
      }
    }

    // 3. Artifacts whose provenance.pdevActivityKey matches this activity.
    //    Use a JSON path query against the metadata column. The artifact
    //    table stores provenance under metadata.provenance.pdevActivityKey
    //    (see pdev-ai-drafting.ts).
    const artifactRows = await db
      .select({
        id: concept2cureArtifacts.id,
        artifactId: concept2cureArtifacts.artifactId,
        title: concept2cureArtifacts.title,
        type: concept2cureArtifacts.type,
        status: concept2cureArtifacts.status,
        version: concept2cureArtifacts.version,
        ctdSection: concept2cureArtifacts.ctdSection,
        contentHash: concept2cureArtifacts.contentHash,
        createdAt: concept2cureArtifacts.createdAt,
        citations: concept2cureArtifacts.citations,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.organizationId, organizationId),
          sql`${concept2cureArtifacts.metadata}->'provenance'->>'pdevActivityKey' = ${activityKey}`
        )
      )
      .orderBy(desc(concept2cureArtifacts.createdAt))
      .limit(200);

    const artifacts: PdevProvenanceArtifact[] = artifactRows.map(r => ({
      id: r.id,
      artifactId: r.artifactId,
      title: r.title,
      type: r.type,
      status: r.status,
      version: r.version,
      ctdSection: r.ctdSection,
      contentHash: r.contentHash,
      createdAt: (r.createdAt as Date).toISOString(),
      citationCount: Array.isArray(r.citations) ? r.citations.length : 0,
    }));

    // 4. Lineage records whose source OR target object id matches one of
    //    the artifact ids above. Use the artifactId (external) since that's
    //    what data_lineage_records.target_object_id stores in the AnA
    //    pipeline.
    const artifactExternalIds = artifacts.map(a => a.artifactId);
    let lineage: PdevProvenanceLineage[] = [];
    if (artifactExternalIds.length > 0) {
      const lineageRows = await db
        .select()
        .from(dataLineageRecords)
        .where(
          and(
            eq(dataLineageRecords.organizationId, organizationId),
            sql`(${dataLineageRecords.targetObjectId} = ANY(${artifactExternalIds}) OR ${dataLineageRecords.sourceObjectId} = ANY(${artifactExternalIds}))`
          )
        )
        .orderBy(desc(dataLineageRecords.createdAt))
        .limit(500);
      lineage = lineageRows.map(l => ({
        id: l.id,
        sourceObjectType: l.sourceObjectType,
        sourceObjectId: l.sourceObjectId,
        sourceTitle: l.sourceTitle,
        targetObjectType: l.targetObjectType,
        targetObjectId: l.targetObjectId,
        linkageType: l.linkageType,
        transformationType: l.transformationType,
        confidenceScore: l.confidenceScore == null ? null : Number(l.confidenceScore),
        aiModelUsed: l.aiModelUsed,
        createdAt: (l.createdAt as Date).toISOString(),
      }));
    }

    // 5. Audit events scoped to the activity-state row id.
    let audit: PdevProvenanceAuditEvent[] = [];
    if (state) {
      try {
        const rows = await db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            userId: auditLogs.userId,
            createdAt: auditLogs.createdAt,
            newValues: auditLogs.newValues,
          })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.tenantId, organizationId),
              eq(auditLogs.tableName, 'pdev_program_activity'),
              eq(auditLogs.recordId, state.id)
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(200);
        audit = rows.map(r => ({
          id: String(r.id),
          action: r.action,
          userId: r.userId,
          createdAt: (r.createdAt as Date).toISOString(),
          details: r.newValues,
        }));
      } catch (err) {
        logger.warn('Audit log query failed (non-fatal)', { err });
      }
    }

    return {
      programId,
      activityKey,
      activityTitle: activity.title,
      workstream: activity.workstream,
      stage: activity.stage,
      currentState: (state?.state ?? 'not_started') as PdevActivityState,
      activityStateRow: state
        ? {
            id: state.id,
            notes: state.notes,
            ownerUserId: state.ownerUserId,
            reviewerUserId: state.reviewerUserId,
            stateChangedAt: (state.stateChangedAt as Date).toISOString(),
            stateChangedBy: state.stateChangedBy,
          }
        : null,
      artifacts,
      evidence,
      lineage,
      audit,
      counts: {
        artifacts: artifacts.length,
        evidence: evidence.length,
        lineageEdges: lineage.length,
        auditEvents: audit.length,
      },
    };
  }
}

export const pdevProvenanceTraceService = new PdevProvenanceTraceService();
