/**
 * CERV2 Sections Routes
 * 510(k) section tree navigation
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { cerv2510kSections, cerv2SectionVersions } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { getDb } from '../db/tenantDbHelper';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('cerv2-sections');

const resolveOrganizationId = (req: any) => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserId = (req: any) => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const tableExists = async (req: any, tableName: string) => {
  try {
    const db = getDb(req);
    if (!db || !('execute' in db)) {
      return false;
    }
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
  const db = getDb(req);
  if (!db || !('select' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

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

  const db = getDb(req);
  if (!db || !('select' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
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

  const db = getDb(req);
  if (!db || !('insert' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
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

    const [inserted] = await db
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

    const userId = resolveUserId(req);
    await db.insert(cerv2SectionVersions).values({
      sectionId: inserted.id,
      organizationId,
      versionNumber: 1,
      changeType: 'created',
      changeSummary: 'Section created',
      content: inserted.content ?? '',
      fieldData: field_data ?? null,
      status: inserted.status ?? 'todo',
      fieldsChanged: ['section_number', 'section_title', 'section_key'],
      newValues: { ...payload, field_data },
      changedBy: userId ?? undefined,
      changedByEmail: req.userEmail ?? null,
      changedByName: req.user?.name ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
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

  const db = getDb(req);
  if (!db || !('select' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
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

    const [updated] = await db
      .update(cerv2510kSections)
      .set(updatePayload)
      .where(
        and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.id, sectionId)
        )
      )
      .returning();

    const [versionRow] = await db
      .select({ maxVersion: sql<number>`max(${cerv2SectionVersions.versionNumber})` })
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.organizationId, organizationId),
          eq(cerv2SectionVersions.sectionId, sectionId)
        )
      );

    const nextVersion = Number(versionRow?.maxVersion || 0) + 1;
    const userId = resolveUserId(req);

    await db.insert(cerv2SectionVersions).values({
      sectionId,
      organizationId,
      versionNumber: nextVersion,
      changeType: 'edited',
      changeSummary: 'Section updated',
      content: updated.content ?? '',
      fieldData: field_data ?? (existing.sources as any)?.fieldData ?? null,
      status: updated.status ?? 'todo',
      fieldsChanged: Object.keys(parsed.data),
      previousValues: {
        content: existing.content ?? '',
        field_data: (existing.sources as any)?.fieldData ?? null,
        status: existing.status ?? 'todo',
      },
      newValues: { ...parsed.data },
      changedBy: userId ?? undefined,
      changedByEmail: req.userEmail ?? null,
      changedByName: req.user?.name ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

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

  const db = getDb(req);
  if (!db || !('delete' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
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

  const db = getDb(req);
  if (!db || !('select' in db)) {
    return res.status(503).json({ error: 'Database unavailable' });
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

export default router;
