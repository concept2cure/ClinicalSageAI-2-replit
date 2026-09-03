/**
 * CERV2 Sections Routes
 * 510(k) section tree navigation
 */
import { Router } from 'express';
import { z } from 'zod';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { enforceAuthorLineage } from '../services/clinical-regulatory-evidence/lineage-gate';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { cerv2510kSections, cerv2SectionVersions } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';
import auditService from '../services/auditService';
import {
  recordCerv2SectionVersion,
  type SectionVersionExec,
} from '../services/cerv2/section-version.js';
import { writeMutation } from './c2c/actions.js';

const SECTION_APPROVAL_STATES: ReadonlySet<string> = new Set(['validated', 'approved']);

function statusBecameApproved(prev: string | null | undefined, next: string | null | undefined): boolean {
  const wasApproved = prev != null && SECTION_APPROVAL_STATES.has(prev);
  const isApproved = next != null && SECTION_APPROVAL_STATES.has(next);
  return !wasApproved && isApproved;
}

const router = Router();
const logger = createScopedLogger('cerv2-sections');

/**
 * Ledger L39 — this file no longer writes `cerv2_section_versions` itself.
 *
 * Three handlers here (create, PATCH, accept-ana-draft) each carried their own
 * INSERT into that table, alongside the shared writer in
 * services/cerv2/section-version.ts that AnA's write_kit_section tool uses.
 * Four writers of one history table meant four answers to "was this change
 * recorded, and with what?", and the three here were the untested ones. They
 * now call the shared writer.
 *
 * WHAT MOVED, COLUMN BY COLUMN. The shared writer sets every column these
 * inserts set, plus `completion_percentage`, which none of them recorded and
 * which is now captured. `field_data` was the one column the inline inserts
 * wrote that the shared writer had no parameter for; rather than let the
 * migration quietly drop it, the parameter was added there and all three calls
 * below pass it. A consolidation that loses a column is not a consolidation.
 *
 * The create handler also stops hardcoding `version_number: 1`. The shared
 * writer derives it from MAX(version_number) + 1 scoped to (section,
 * organization) — the same value for a brand-new section, and correct rather
 * than lucky.
 *
 * Each call now runs on the SAME transaction as its content write, which the
 * shared writer's contract requires: a history row that commits while the
 * content rolls back attests to a change that never happened, and content that
 * commits without history is the loss the writer exists to prevent.
 */
// The Drizzle-transaction → pg-style client adapter the shared writers need
// (section-version writer, lineage gate) lives in server/db/drizzle-queryable.
const sectionVersionExec = queryableFromDrizzle;

const resolveOrganizationId = (req: any) => {
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserId = (req: any) => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Actor + request metadata every version row records, resolved once. */
function versionActor(req: any) {
  return {
    changedBy: resolveUserId(req),
    changedByEmail: req.userEmail ?? null,
    changedByName: (req.user as { name?: string } | undefined)?.name ?? null,
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

const tableExists = async (_req: any, tableName: string) => {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      )
    `);
    const rows = (result as any).rows ?? result;
    return rows?.[0]?.exists === true;
  } catch (error) {
    logger.error('Failed to check table existence', { error, tableName });
    return false;
  }
};

const serializeSection = (section: any) => {
  const sources = section.sources || {};
  return {
    id: section.id,
    document_id: section.documentId ?? null,
    section_number: section.sectionNumber,
    section_title: section.sectionTitle,
    section_key: section.sectionKey,
    category: section.category,
    parent_section_id: section.parentSectionId ?? null,
    level: section.level ?? 1,
    display_order: section.displayOrder ?? 0,
    is_required: section.isRequired ?? false,
    icon: section.icon ?? null,
    fields: section.fields ?? [],
    content: section.content ?? '',
    field_data: sources.fieldData ?? {},
    status: section.status ?? 'todo',
    completion_percentage: section.completionPercentage ?? 0,
    compliance_notes: section.complianceNotes ?? null,
    regulatory_references: section.regulatoryReferences ?? null,
    sources: sources || {},
    validation_errors: section.validationErrors ?? null,
    validation_status: section.validationStatus ?? null,
    /* Draft provenance — populated when AnA drafts the section via the
       write_kit_section tool. The MDX surfaces read these to render the
       "drafted by AnA — accept / refine" affordance. Null on legacy rows
       and on rows the user has accepted. */
    draft_source: section.draftSource ?? null,
    drafted_at: section.draftedAt ?? null,
    drafted_summary: section.draftedSummary ?? null,
    accepted_at: section.acceptedAt ?? null,
    accepted_by: section.acceptedBy ?? null,
    last_modified: section.updatedAt ?? section.createdAt,
  };
};

const createSchema = z.object({
  document_id: z.number().int().nullable().optional(),
  section_number: z.string().min(1),
  section_title: z.string().min(1),
  section_key: z.string().min(1),
  category: z.string().min(1),
  display_order: z.number().int().optional(),
  is_required: z.boolean().optional(),
  icon: z.string().optional(),
  fields: z.array(z.any()).optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  field_data: z.record(z.any()).optional(),
});

const updateSchema = z.object({
  section_number: z.string().min(1).optional(),
  section_title: z.string().min(1).optional(),
  section_key: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  display_order: z.number().int().optional(),
  is_required: z.boolean().optional(),
  icon: z.string().optional(),
  fields: z.array(z.any()).optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  field_data: z.record(z.any()).optional(),
  completion_percentage: z.number().int().optional(),
  compliance_notes: z.string().optional(),
  regulatory_references: z.array(z.string()).optional(),
});

router.get('/', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const hasTable = await tableExists(req, 'cerv2_510k_sections');
  if (!hasTable) {
    return res.json({ sections: [] });
  }

  const rawDocumentId = req.query.document_id;
  const documentId = rawDocumentId ? Number(rawDocumentId) : null;

  try {
    const condition = documentId
      ? and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.documentId, documentId)
        )
      : eq(cerv2510kSections.organizationId, organizationId);

    const sections = await db
      .select()
      .from(cerv2510kSections)
      .where(condition)
      .orderBy(asc(cerv2510kSections.displayOrder));

    return res.json({ sections: sections.map(serializeSection) });
  } catch (error) {
    logger.error('Failed to fetch sections', { error });
    return res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

router.get('/:sectionId', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  // 301 redirect: if this section has been migrated to c2c_document_sections,
  // point clients to the canonical new URL. Fall through if not yet migrated.
  try {
    const { rows } = await db.execute(sql`
      SELECT
        'doc_fda510k_' || fd.project_id::text AS document_id,
        s.section_key
      FROM cerv2_510k_sections s
      JOIN fda_510k_documents fd ON fd.id = s.document_id
      WHERE s.id = ${sectionId} AND s.document_id IS NOT NULL
      LIMIT 1
    `);
    if (rows.length > 0) {
      const { document_id, section_key } = rows[0] as any;
      res.set('Deprecation', 'true');
      res.set('Sunset', '2026-08-01');
      return res.redirect(301, `/api/c2c/documents/${document_id}/sections/${section_key}`);
    }
  } catch {
    // fda_510k_documents may not exist in this schema state — fall through.
  }

  try {
    const [section] = await db
      .select()
      .from(cerv2510kSections)
      .where(
        and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.id, sectionId)
        )
      )
      .limit(1);

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    return res.json({ section: serializeSection(section) });
  } catch (error) {
    logger.error('Failed to fetch section', { error, sectionId });
    return res.status(500).json({ error: 'Failed to fetch section' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const { field_data, display_order, document_id, ...payload } = parsed.data;

    let finalDisplayOrder = display_order;
    if (!finalDisplayOrder) {
      const [row] = await db
        .select({ maxOrder: sql<number>`max(${cerv2510kSections.displayOrder})` })
        .from(cerv2510kSections)
        .where(eq(cerv2510kSections.organizationId, organizationId));
      const maxOrder = Number(row?.maxOrder || 0);
      finalDisplayOrder = maxOrder + 1;
    }

    const userId = resolveUserId(req);

    /* The section row and its first history row commit together. If the
       version write fails the section is not created either — an unversioned
       section is the state this table exists to make impossible. */
    const inserted = await db.transaction(async tx => {
      const [created] = await tx
        .insert(cerv2510kSections)
        .values({
          organizationId,
          documentId: document_id ?? null,
          sectionNumber: payload.section_number,
          sectionTitle: payload.section_title,
          sectionKey: payload.section_key,
          category: payload.category,
          displayOrder: finalDisplayOrder,
          isRequired: payload.is_required ?? false,
          icon: payload.icon ?? null,
          fields: payload.fields ?? [],
          content: payload.content ?? '',
          status: payload.status ?? 'todo',
          sources: field_data ? { fieldData: field_data } : null,
          updatedAt: new Date(),
        })
        .returning();

      await recordCerv2SectionVersion(sectionVersionExec(tx), {
        sectionId: created.id,
        organizationId,
        changeType: 'created',
        changeSummary: 'Section created',
        content: created.content ?? '',
        status: created.status ?? 'todo',
        completionPercentage: created.completionPercentage ?? null,
        fieldData: field_data ?? null,
        fieldsChanged: ['section_number', 'section_title', 'section_key'],
        /* A section being created has no prior state. The empty object says
           that, rather than leaving a reader unable to tell "nothing existed"
           from "nobody captured it". */
        previousValues: {},
        newValues: { ...payload, field_data: field_data ?? null },
        ...versionActor(req),
      });

      return created;
    });

    void auditService.logAction({
      tenantId: organizationId,
      userId: userId ?? undefined,
      action: 'section.create',
      resourceType: 'cerv2_510k_section',
      resourceId: String(inserted.id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        sectionNumber: inserted.sectionNumber,
        sectionTitle: inserted.sectionTitle,
        documentId: inserted.documentId ?? null,
      },
    });

    return res.status(201).json({ section: serializeSection(inserted) });
  } catch (error) {
    logger.error('Failed to create section', { error });
    return res.status(500).json({ error: 'Failed to create section' });
  }
});

router.patch('/:sectionId', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const [existing] = await db
      .select()
      .from(cerv2510kSections)
      .where(
        and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.id, sectionId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const { field_data, ...updates } = parsed.data;
    const nextSources = field_data
      ? { ...(existing.sources || {}), fieldData: field_data }
      : existing.sources;

    const updatePayload: any = {
      updatedAt: new Date(),
      sources: nextSources,
    };

    if (updates.section_number !== undefined) updatePayload.sectionNumber = updates.section_number;
    if (updates.section_title !== undefined) updatePayload.sectionTitle = updates.section_title;
    if (updates.section_key !== undefined) updatePayload.sectionKey = updates.section_key;
    if (updates.category !== undefined) updatePayload.category = updates.category;
    if (updates.display_order !== undefined) updatePayload.displayOrder = updates.display_order;
    if (updates.is_required !== undefined) updatePayload.isRequired = updates.is_required;
    if (updates.icon !== undefined) updatePayload.icon = updates.icon;
    if (updates.fields !== undefined) updatePayload.fields = updates.fields;
    if (updates.content !== undefined) updatePayload.content = updates.content;
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.completion_percentage !== undefined) {
      updatePayload.completionPercentage = updates.completion_percentage;
    }
    if (updates.compliance_notes !== undefined)
      updatePayload.complianceNotes = updates.compliance_notes;
    if (updates.regulatory_references !== undefined) {
      updatePayload.regulatoryReferences = updates.regulatory_references;
    }

    const userId = resolveUserId(req);
    /* Section prose bound for a 510(k)/PMA/CER is attributed or refused —
       the lineage gate below records every clause as someone's assertion, and
       a placeholder is not someone. Metadata-only updates carry no prose and
       need no author. */
    if (updates.content !== undefined && !userId) {
      return res.status(401).json({
        error: 'An identified author is required to write section content (21 CFR Part 11).',
      });
    }

    /* Content and history on one transaction: the version row is the only
       record of the text this UPDATE overwrites, so it cannot be allowed to
       fail independently of the overwrite. */
    const { updated, nextVersion } = await db.transaction(async tx => {
      const [row] = await tx
        .update(cerv2510kSections)
        .set(updatePayload)
        .where(
          and(
            eq(cerv2510kSections.organizationId, organizationId),
            eq(cerv2510kSections.id, sectionId)
          )
        )
        .returning();

      /* The lineage gate, in this transaction: every clause of the new text
         is recorded as the author's assertion, a verified quote from an earlier
         AnA draft is kept only where its text still stands, and a gap rolls
         the content write back with it (ledger L157). */
      if (updates.content !== undefined) {
        const client = sectionVersionExec(tx);
        await enforceAuthorLineage(
          client,
          organizationId,
          { documentTable: 'cerv2_510k_sections', documentId: String(sectionId) },
          row.content ?? '',
          String(userId),
        );
      }

      const version = await recordCerv2SectionVersion(sectionVersionExec(tx), {
        sectionId,
        organizationId,
        changeType: 'edited',
        changeSummary: 'Section updated',
        content: row.content ?? '',
        status: row.status ?? 'todo',
        completionPercentage: row.completionPercentage ?? null,
        fieldData: (row.sources as any)?.fieldData ?? null,
        fieldsChanged: Object.keys(parsed.data),
        previousValues: {
          content: existing.content ?? '',
          field_data: (existing.sources as any)?.fieldData ?? null,
          status: existing.status ?? 'todo',
        },
        newValues: { ...parsed.data },
        ...versionActor(req),
      });

      return { updated: row, nextVersion: version };
    });

    // Reflect into the central audit_logs. The cerv2_section_versions row
    // above is the rich change record; this row gives auditors a single
    // unified table to query across resources. A status flip into a
    // section-approval state is logged with action `section.approve`
    // separately so reviewers can find sign-offs directly.
    void auditService.logAction({
      tenantId: organizationId,
      userId: userId ?? undefined,
      action: 'section.edit',
      resourceType: 'cerv2_510k_section',
      resourceId: String(sectionId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        sectionNumber: updated.sectionNumber,
        versionNumber: nextVersion,
        fieldsChanged: Object.keys(parsed.data),
      },
    });

    if (statusBecameApproved(existing.status, updated.status)) {
      void auditService.logAction({
        tenantId: organizationId,
        userId: userId ?? undefined,
        action: 'section.approve',
        resourceType: 'cerv2_510k_section',
        resourceId: String(sectionId),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          sectionNumber: updated.sectionNumber,
          previousStatus: existing.status ?? null,
          newStatus: updated.status ?? null,
          versionNumber: nextVersion,
        },
      });
    }

    return res.json({ section: serializeSection(updated) });
  } catch (error) {
    logger.error('Failed to update section', { error, sectionId });
    return res.status(500).json({ error: 'Failed to update section' });
  }
});

router.delete('/:sectionId', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  try {
    const deleted = await db
      .delete(cerv2510kSections)
      .where(
        and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.id, sectionId)
        )
      )
      .returning();

    if (!deleted.length) {
      return res.status(404).json({ error: 'Section not found' });
    }

    void auditService.logAction({
      tenantId: organizationId,
      userId: resolveUserId(req) ?? undefined,
      action: 'section.delete',
      resourceType: 'cerv2_510k_section',
      resourceId: String(sectionId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        sectionNumber: deleted[0].sectionNumber,
        sectionTitle: deleted[0].sectionTitle,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete section', { error, sectionId });
    return res.status(500).json({ error: 'Failed to delete section' });
  }
});

router.get('/:sectionId/versions', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  try {
    const versions = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.organizationId, organizationId),
          eq(cerv2SectionVersions.sectionId, sectionId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.changedAt));

    return res.json({ versions });
  } catch (error) {
    logger.error('Failed to fetch versions', { error, sectionId });
    return res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

/**
 * POST /:sectionId/accept-ana-draft — accept an AnA-drafted section.
 *
 * Used by the K510Surface / PmaSurface / CerSurface "accept" affordance.
 * Keeps draft_source — the origin is a fact about the text, not a pending
 * flag — and stamps accepted_by + accepted_at; optionally accepts
 * a refined content body. Writes a section-version row + audit_log entry so
 * the 21 CFR Part 11 trail captures who took the AI draft into review.
 */
const acceptAnaDraftSchema = z.object({
  refined_content: z.string().optional(),
  status: z
    .enum(['drafting', 'ready_for_review', 'in_review', 'validated'])
    .optional(),
});

router.post('/:sectionId/accept-ana-draft', authMiddleware, async (req, res) => {
  // This is the one path that flips the section row and the only one the
  // surfaces call; the governance ledger row is written from here
  // (`writeMutation('accept-ai-suggestion')` below). It used to advertise
  // itself as deprecated in favour of the ledger action, which never touched
  // the section (ledger L155).

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const sectionId = Number(req.params.sectionId);
  if (!Number.isFinite(sectionId)) {
    return res.status(400).json({ error: 'Invalid section id' });
  }
  const parsed = acceptAnaDraftSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  try {
    const [existing] = await db
      .select()
      .from(cerv2510kSections)
      .where(
        and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.id, sectionId),
        ),
      )
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Section not found' });
    }
    if (existing.draftSource !== 'ana' || existing.acceptedAt) {
      return res.status(409).json({
        error: existing.acceptedAt
          ? 'This AnA draft has already been accepted.'
          : 'No AnA draft to accept on this section: it was not drafted by AnA.',
      });
    }

    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: 'An identified person must accept an AnA draft — the accept is the moment the text becomes theirs to answer for (21 CFR Part 11).',
      });
    }
    const acceptedAt = new Date();
    const nextStatus = parsed.data.status ?? 'ready_for_review';
    const nextContent = parsed.data.refined_content ?? existing.content ?? '';

    /* Accepting a draft is the moment an AI-authored body becomes a human's
       to answer for. The status flip and the row that records who took it
       commit together or not at all. */
    const { updated, nextVersion } = await db.transaction(async tx => {
      const [row] = await tx
        .update(cerv2510kSections)
        .set({
          content:                nextContent,
          status:                 nextStatus,
          /* draft_source stays 'ana'. Clearing it made the live row read as a
             section with no stated origin that a person accepted — the fact
             survived only in the version history (ledger L155). */
          acceptedAt,
          acceptedBy:             userId ?? null,
          updatedAt:              acceptedAt,
        })
        .where(
          and(
            eq(cerv2510kSections.organizationId, organizationId),
            eq(cerv2510kSections.id, sectionId),
          ),
        )
        .returning();

      /* Lineage for the accepted text, in this transaction. Unrefined, the
         draft's own spans are re-verified in place and stand; refined, the
         clauses that changed become the acceptor's assertions and any quote
         that moved is retired rather than left pointing at the wrong words
         (ledger L157). */
      const client = sectionVersionExec(tx);
      await enforceAuthorLineage(
        client,
        organizationId,
        { documentTable: 'cerv2_510k_sections', documentId: String(sectionId) },
        row.content ?? '',
        String(userId),
      );
      const version = await recordCerv2SectionVersion(sectionVersionExec(tx), {
        sectionId,
        organizationId,
        changeType:    'edited',
        changeSummary: 'Accepted AnA draft',
        content:       row.content ?? '',
        status:        row.status ?? 'todo',
        completionPercentage: row.completionPercentage ?? null,
        fieldData:     (row.sources as any)?.fieldData ?? null,
        fieldsChanged: parsed.data.refined_content
          ? ['content', 'status', 'accepted_at', 'accepted_by']
          : ['status', 'accepted_at', 'accepted_by'],
        previousValues: {
          content:      existing.content ?? '',
          status:       existing.status ?? 'todo',
          draft_source: existing.draftSource,
          accepted_at:  existing.acceptedAt ?? null,
          /* The inline insert recorded the field values only in the
             `field_data` column, which holds the state AFTER the change. The
             pre-acceptance values were not recoverable from it; they are now. */
          field_data:   (existing.sources as any)?.fieldData ?? null,
        },
        newValues: {
          ...parsed.data,
          draft_source: existing.draftSource,
          accepted_at:  acceptedAt.toISOString(),
          accepted_by:  userId ?? null,
        },
        ...versionActor(req),
      });

      return { updated: row, nextVersion: version };
    });

    void auditService.logAction({
      tenantId: organizationId,
      userId:   userId === null ? undefined : userId,
      action:   'section.ana_draft_accepted',
      resourceType: 'cerv2_510k_section',
      resourceId:   String(sectionId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        sectionNumber: updated.sectionNumber,
        sectionKey:    updated.sectionKey,
        versionNumber: nextVersion,
        refined:       Boolean(parsed.data.refined_content),
        status:        updated.status,
      },
    });

    // Also write to the universal mutation ledger so the audit chain starts.
    // Fire-and-forget: legacy path must not break if the new table is absent.
    void writeMutation(
      'accept-ai-suggestion',
      {
        target: `section:cerv2:${sectionId}`,
        reason: `Accepted AnA draft for section ${sectionId}`,
        payload: { status: nextStatus, refined: Boolean(parsed.data.refined_content) },
      },
      userId ?? 0,
      organizationId,
    ).catch((err: unknown) => {
      logger.warn('c2c_ana_actions write failed (non-blocking)', { err });
    });

    return res.json({ section: serializeSection(updated) });
  } catch (error) {
    logger.error('Failed to accept AnA draft', { error, sectionId });
    return res.status(500).json({ error: 'Failed to accept AnA draft' });
  }
});

export default router;
