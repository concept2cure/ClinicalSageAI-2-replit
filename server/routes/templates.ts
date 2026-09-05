/**
 * templates.ts
 *
 * Extracted from server/index.ts — Template catalog, eCTD template, and drafting task routes.
 * The fallbackTemplates static data array lives in services/templates/ectd-fallback-templates.ts (the one copy — see GA ledger L48).
 *
 * Routes (multiple mount points):
 *   GET  /api/templates               — fallback template catalog
 *   GET  /api/ectd/templates          — DB-backed eCTD templates (fallback to static)
 *   GET  /api/ectd/templates/:id      — single eCTD template
 *   POST /api/v1/drafting/start_task  — create AI document draft
 *   GET  /api/v1/drafting/task_status/:task_id — check draft status
 */

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getPool } from '../db';
import { db } from '../db';
import { getSecureOrgId } from '../utils/tenantContext';
import { draftingTasks } from '@shared/schema';
import { fallbackTemplates } from '../services/templates/ectd-fallback-templates';

// ── Template catalog router (mounted at /api/templates) ────────────────────

export const templatesRouter = Router();

templatesRouter.get('/', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      templates: fallbackTemplates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

// ── eCTD templates router (mounted at /api/ectd/templates) ─────────────────

export const ectdTemplatesRouter = Router();
const pool = getPool();

/**
 * PATCH /api/ectd/templates/:id/default — flip is_default within an org.
 *
 * Backs the kit's Templates browser "star a default per granule" action.
 * The unique index `ectd_templates_default_uniq (organization_id,
 * granule_id) WHERE is_default = true` (migration 20260507) guarantees
 * at most one default per (org, granule). To avoid index conflicts we
 * first clear any existing default for that granule, then set the
 * requested row.
 */
ectdTemplatesRouter.patch('/:id/default', async (req: Request, res: Response) => {
  const organizationId = getSecureOrgId(req);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(422).json({ error: 'id must be numeric' });
  }
  const setDefault = req.body?.isDefault !== false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const own = await client.query<{ granule_id: string | null }>(
      `SELECT granule_id FROM ectd_templates
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, organizationId],
    );
    if (own.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found in this organization' });
    }
    const granule = own.rows[0].granule_id;
    if (setDefault && granule) {
      await client.query(
        `UPDATE ectd_templates SET is_default = false, updated_at = NOW()
          WHERE organization_id = $1 AND granule_id = $2 AND is_default = true AND id != $3`,
        [organizationId, granule, id],
      );
    }
    const result = await client.query(
      `UPDATE ectd_templates SET is_default = $3, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, template_name, granule_id, is_default`,
      [id, organizationId, setDefault],
    );
    await client.query('COMMIT');
    return res.json({ data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[templates] set-default failed:', err);
    return res.status(500).json({ error: 'Failed to set default' });
  } finally {
    client.release();
  }
});

ectdTemplatesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    try {
      const result = await pool.query(
        `SELECT id, template_name as name, template_name as title, 'FDA' as region, version,
                template_name as description, content as template_data
         FROM ectd_templates
         WHERE organization_id = $1
         ORDER BY id`,
        [organizationId]
      );

      const templates = result.rows.map(row => {
        const templateData = row.template_data || {};
        return {
          id: row.id,
          name: row.name,
          title: row.title,
          template_name: row.title,
          region: row.region,
          version: row.version,
          description: row.description,
          module_number: templateData.module,
          granule_id: templateData.granule_id,
          content: templateData.content,
          placeholders: templateData.placeholders,
          category: row.name.includes('Module_1')
            ? 'administrative'
            : row.name.includes('Module_2')
            ? 'clinical'
            : 'regulatory',
          template_data: templateData,
        };
      });

      res.json(templates);
    } catch (dbError: any) {
      // This endpoint promises the ORG'S eCTD templates. Swapping in the static
      // `fallbackTemplates` catalog on a DB failure answered a tenant-scoped
      // question with tenant-agnostic content — the caller got a 200 and a list
      // that looks like their templates but belongs to no organization, with
      // ids that resolve to nothing on the follow-up GET /:id. A read that could
      // not reach the store must say so.
      console.error('[templates] eCTD template list read failed:', dbError?.message);
      if (dbError?.code === '42P01') {
        return res.status(503).json({
          error: 'Template store is not provisioned',
          code: 'TEMPLATE_STORE_UNPROVISIONED',
        });
      }
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }
  } catch (error) {
    console.error('[ERROR] Failed to fetch templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

ectdTemplatesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    try {
      const result = await pool.query(
        `SELECT id, template_name as name, template_name as title, 'FDA' as region, version,
                template_name as description, content as template_data
         FROM ectd_templates
         WHERE id = $1 AND organization_id = $2`,
        [templateId, organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const row = result.rows[0];
      const templateData = row.template_data || {};

      const template = {
        id: row.id,
        name: row.name,
        title: row.title,
        template_name: row.title,
        region: row.region,
        version: row.version,
        description: row.description,
        module_number: templateData.module,
        granule_id: templateData.granule_id,
        content: templateData.content,
        placeholders: templateData.placeholders,
        category: row.name.includes('Module_1')
          ? 'administrative'
          : row.name.includes('Module_2')
          ? 'clinical'
          : 'regulatory',
        template_data: templateData,
      };

      res.json(template);
    } catch (dbError: any) {
      // Same rule as the list route, plus a sharper failure mode: the static
      // catalog's ids are a separate id space from `ectd_templates.id`, so on a
      // DB fault this used to return a DIFFERENT template than the one asked
      // for whenever the numbers happened to collide — a wrong-document answer
      // served as a 200. And a miss became a 404 ("no such template") when the
      // truth was "the store is unreachable".
      console.error('[templates] eCTD template fetch failed:', dbError?.message);
      if (dbError?.code === '42P01') {
        return res.status(503).json({
          error: 'Template store is not provisioned',
          code: 'TEMPLATE_STORE_UNPROVISIONED',
        });
      }
      return res.status(500).json({ error: 'Failed to fetch template' });
    }
  } catch (error) {
    console.error('[ERROR] Failed to fetch template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Drafting router (mounted at /api/v1/drafting) ──────────────────────────

export const draftingRouter = Router();

/** Generate document content from eCTD template */
async function generateDocumentContent(
  ectdSection: string,
  documentTitle: string,
  template: string
) {
  const matchingTemplate = fallbackTemplates.find(
    t =>
      t.granule_id.includes(ectdSection.toLowerCase().replace('.', '-')) ||
      t.module_number === ectdSection.split('.')[0]
  );

  if (matchingTemplate) {
    let content = matchingTemplate.content;
    content = content.replace(
      /\[DRUG_NAME\]/g,
      documentTitle.split(' - ')[0] || 'Investigational Drug'
    );
    content = content.replace(
      /\[INDICATION\]/g,
      documentTitle.split(' - ')[1] || 'Primary Indication'
    );
    content = content.replace(/\[DOCUMENT_TITLE\]/g, documentTitle);
    content = content.replace(/\[ECTD_SECTION\]/g, ectdSection);
    content = content.replace(/\[TEMPLATE\]/g, template);
    content = content.replace(/\[DATE\]/g, new Date().toLocaleDateString());
    return content;
  }

  return `${documentTitle}

Module: ${ectdSection}
Template: ${template}
Generated: ${new Date().toLocaleDateString()}

1. INTRODUCTION
This document has been generated for Module ${ectdSection} according to eCTD specifications.

2. DOCUMENT STRUCTURE
The document follows FDA eCTD v4.0 guidelines and includes all required sections for regulatory submission.

3. CONTENT PLACEHOLDER
[This section should be completed with study-specific information]

4. REGULATORY COMPLIANCE
This document template ensures compliance with:
- FDA eCTD v4.0 requirements
- ICH guidelines
- Regional regulatory standards

5. NEXT STEPS
1. Complete all placeholder sections
2. Review for regulatory compliance
3. Prepare for submission

---
Generated by Concept2Cure AI Document Generator
Date: ${new Date().toISOString()}
`;
}

draftingRouter.post('/start_task', async (req: Request, res: Response) => {
  try {
    const { project_id, ectd_section, document_title, template } = req.body;

    if (!project_id || !ectd_section || !document_title) {
      return res.status(400).json({
        error: 'project_id, ectd_section, and document_title are required',
      });
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generatedContent = await generateDocumentContent(ectd_section, document_title, template);

    try {
      await db.insert(draftingTasks).values({
        taskId,
        projectId: project_id,
        ectdSection: ectd_section,
        documentTitle: document_title,
        template: template || null,
        status: 'COMPLETED',
        draftContent: generatedContent,
        createdById: (req as any).user?.id || null,
      });
    } catch (dbError) {
      console.warn(
        '[drafting] DB insert failed, using in-memory fallback:',
        (dbError as Error).message
      );
      (global as any).draftingTasks = (global as any).draftingTasks || {};
      (global as any).draftingTasks[taskId] = {
        id: taskId,
        project_id,
        ectd_section,
        document_title,
        template,
        status: 'COMPLETED',
        draft_content: generatedContent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    res.status(202).json({ task_id: taskId });
  } catch (error) {
    console.error('Document creation error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

draftingRouter.get('/task_status/:task_id', async (req: Request, res: Response) => {
  try {
    const task_id = req.params.task_id as string;

    try {
      const [task] = await db.select().from(draftingTasks).where(eq(draftingTasks.taskId, task_id));
      if (task) {
        return res.json({
          id: task.taskId,
          project_id: task.projectId,
          ectd_section: task.ectdSection,
          document_title: task.documentTitle,
          template: task.template,
          status: task.status,
          draft_content: task.draftContent,
          created_at: task.createdAt?.toISOString(),
          updated_at: task.updatedAt?.toISOString(),
        });
      }
    } catch {
      // DB query failed — fall through to in-memory
    }

    const memTask = (global as any).draftingTasks?.[task_id];
    if (!memTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(memTask);
  } catch (error) {
    console.error('Get task status error:', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

// Also export fallbackTemplates for any other code that needs it
export { fallbackTemplates } from '../services/templates/ectd-fallback-templates';
