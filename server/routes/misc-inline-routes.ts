import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { fallbackTemplates } from '../services/templates/ectd-fallback-templates';
import { getSecureOrgId } from '../utils/tenantContext';
import { programInOrganization } from '../services/c2c/program-access';

/**
 * The eCTD template for exactly this section, with only the placeholders the
 * request actually fills. Null when no template exists for the section.
 *
 * ── 2026-10-14 ───────────────────────────────────────────────────────────────
 * This used to (1) fall back to the first template of the section's MODULE when
 * the section had none — so a 2.7.3 request was answered with the 2.2
 * Introduction, recorded as the 2.7.3 draft, and the separator replace only
 * touched the first dot, so every three-level section took that path; (2) fill
 * [DRUG_NAME] and [INDICATION] with "Investigational Drug" and "Primary
 * Indication" when the title did not carry them; and (3) with no template at
 * all, write a document stating that it "follows FDA eCTD v4.0 guidelines and
 * includes all required sections" and "ensures compliance with … FDA eCTD v4.0
 * requirements, ICH guidelines, Regional regulatory standards" — a compliance
 * claim about a page of headings, stored as a COMPLETED draft. A placeholder
 * the request does not fill now stays a visible placeholder.
 */
function generateDocumentContent(
  ectdSection: string,
  documentTitle: string,
  template: string
): string | null {
  const key = `m${ectdSection.trim().toLowerCase().replace(/\./g, '-')}-`;
  const matchingTemplate = fallbackTemplates.find(t => t.granule_id.startsWith(key));
  if (!matchingTemplate) return null;

  const [drugName, indication] = documentTitle.split(' - ').map(part => part.trim());
  let content = matchingTemplate.content;
  if (drugName && indication) {
    content = content.replace(/\[DRUG_NAME\]/g, drugName).replace(/\[INDICATION\]/g, indication);
  }
  content = content.replace(/\[DOCUMENT_TITLE\]/g, documentTitle);
  content = content.replace(/\[ECTD_SECTION\]/g, ectdSection);
  if (template) content = content.replace(/\[TEMPLATE\]/g, template);
  return content;
}

export function createMiscInlineRoutes(pool: Pool, authMiddleware: any): Router {
  const router = Router();

  // GET /api/templates — returns fallbackTemplates
  router.get('/templates', async (req: Request, res: Response) => {
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

  // GET /api/vault/statistics — real DB query on documents table
  router.get('/vault/statistics', async (req: Request, res: Response) => {
    try {
      const organizationId = getSecureOrgId(req);
      if (!organizationId) {
        return res.status(401).json({ error: 'Organization context required' });
      }
      const statsResult = await pool.query(
        `
        SELECT
          COUNT(*)::int AS total_documents,
          0::bigint AS total_size,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent_uploads
        FROM documents
        WHERE organization_id = $1
      `,
        [organizationId]
      );
      const stats = statsResult.rows[0] || {};
      res.json({
        totalDocuments: stats.total_documents || 0,
        totalSize: parseInt(stats.total_size) || 0,
        recentUploads: stats.recent_uploads || 0,
        // Removed `complianceScore: 95` — a fabricated constant with no
        // computation. Vault document counts do not yield a compliance
        // score; a real one would come from the compliance subsystem.
        storageUsed: parseInt(stats.total_size) || 0,
        storageLimit: 1000000000,
      });
    } catch (error) {
      console.error('Error fetching vault statistics:', error);
      res.status(500).json({ error: 'Failed to fetch vault statistics' });
    }
  });

  // GET /api/vault/list — paginated documents query
  router.get('/vault/list', async (req: Request, res: Response) => {
    try {
      const organizationId = getSecureOrgId(req);
      if (!organizationId) {
        return res.status(401).json({ error: 'Organization context required' });
      }
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize || '50'), 10)));
      const offset = (page - 1) * pageSize;

      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM documents WHERE organization_id = $1',
        [organizationId]
      );
      const total = countResult.rows[0]?.total || 0;

      const docsResult = await pool.query(
        `SELECT id, title, document_type, category, status, document_code, description, created_at, updated_at
         FROM documents WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [organizationId, pageSize, offset]
      );

      res.json({
        success: true,
        documents: docsResult.rows,
        metadata: {
          totalCount: total,
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          pageSize,
        },
      });
    } catch (error) {
      console.error('Error fetching vault documents:', error);
      res.status(500).json({ error: 'Failed to fetch vault documents' });
    }
  });

  // GET /api/ana/regulatory-intelligence (authMiddleware)
  router.get(
    '/ana/regulatory-intelligence',
    authMiddleware as any,
    async (req: Request, res: Response) => {
      try {
        // No regulatory-intelligence data source is wired for this feed.
        // The prior handler fabricated a complianceScore (95), a documents
        // successRate (94), and a full per-agency "Compliant" matrix with
        // invented scores (FDA 94, EMA 87, …) — none backed by any data.
        // Emit honest nulls / empty rather than fake regulatory compliance
        // statuses. Real values land when the source is connected.
        res.json({
          success: true,
          advisorySummary: {
            totalAdvisories: 0,
            criticalAlerts: 0,
            recentUpdates: 0,
            complianceScore: null,
          },
          documents: {
            totalAnalyzed: 0,
            successRate: null,
            averageProcessingTime: null,
            templatesAvailable: null,
          },
          compliance: {
            globalStatus: 'unknown',
            regions: [],
          },
          updates: [],
        });
      } catch (error) {
        console.error('Error fetching regulatory intelligence:', error);
        res.status(500).json({ error: 'Failed to fetch regulatory intelligence' });
      }
    }
  );

  // NOTE: /api/ana/regulatory-analysis and /api/ana/ich-e6r3-guidance were
  // removed from this grab-bag router. They were unconsumed duplicates of the
  // canonical handlers in server/routes/ana-cortex.ts (mounted at
  // /api/ana-cortex/*, which is what the client actually calls). Single source
  // now lives there.

  // GET /api/advisor/check-readiness
  //
  // DISABLED (501) on 2026-10-14. With its numbers already nulled (no program
  // context reaches this endpoint, so no readiness can be computed here), it
  // still answered every caller that five named sections were MISSING — CMC
  // Stability Study, CSRs, Toxicology Reports, Drug Substance Specs, the QOS —
  // with priorities, two "critical path items" and three recommendations
  // ("Prioritize CMC Stability Study completion"). None of it was read from a
  // program. No client calls it (grep: client/src). The program-scoped
  // readiness engines are server/services/orchestration/readiness-engine.ts and
  // server/services/pdev/pdev-readiness-service.ts.
  router.get('/advisor/check-readiness', (_req: Request, res: Response) => {
    res.status(501).json({
      error: {
        code: 'not_implemented',
        message:
          'Readiness is assessed per program. This endpoint has no program to assess, and its ' +
          'previous answer listed missing sections it had not looked for.',
      },
    });
  });

  // GET /api/ectd/templates — DB query with fallback
  router.get('/ectd/templates', async (req: Request, res: Response) => {
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
        // This endpoint promises the ORG'S eCTD templates. Substituting the
        // static `fallbackTemplates` catalog on a DB failure answered a
        // tenant-scoped question with tenant-agnostic content: a 200 carrying a
        // list that looks like the org's templates but belongs to no
        // organization, whose ids resolve to nothing on the follow-up
        // GET /:id. A read that could not reach the store must say so.
        console.error('[ectd/templates] template list read failed:', dbError?.message);
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

  // GET /api/ectd/templates/:id — single template with fallback
  router.get('/ectd/templates/:id', async (req: Request, res: Response) => {
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
        // catalog's ids are a separate id space from `ectd_templates.id`, so on
        // a DB fault this returned a DIFFERENT template than the one requested
        // whenever the numbers collided — a wrong-document answer served as a
        // 200. And a miss became a 404 ("no such template") when the truth was
        // "the store is unreachable".
        console.error('[ectd/templates] template fetch failed:', dbError?.message);
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

  // POST /api/v1/drafting/start_task — records a drafting task for one of the
  // organisation's own programs.
  //
  // Both /v1/drafting routes sit under /api/v1, which the global /api gate
  // leaves to the public API's X-API-Key check (routes/public-api.ts runs it
  // first), so each requires a session here (audit finding API-01). Ownership
  // is the program's: drafting_tasks carries no organisation column, its
  // project_id names a regulatory_programs row, and that row carries the
  // organisation (audit finding IAM-11, plan P1-8). A task is written and read
  // only through that ownership. There is no in-memory fallback: a task that
  // could not be recorded is an error, not a success held in process memory
  // that any caller could then read.
  router.post('/v1/drafting/start_task', authMiddleware as any, async (req: Request, res: Response) => {
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const { project_id, ectd_section, document_title, template } = req.body ?? {};
    if (!project_id || !ectd_section || !document_title) {
      return res.status(400).json({
        error: 'project_id, ectd_section, and document_title are required',
      });
    }
    try {
      // tenant-isolation-safe: the program is read with the session's organisation as a predicate.
      if (!(await programInOrganization(pool, String(project_id), organizationId))) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const templateName = template ? String(template) : '';
      const generatedContent = generateDocumentContent(String(ectd_section), String(document_title), templateName);
      if (generatedContent === null) {
        return res.status(422).json({
          error: `No template exists for eCTD section ${String(ectd_section)}. Nothing was drafted.`,
        });
      }
      await pool.query(
        `INSERT INTO drafting_tasks (task_id, project_id, ectd_section, document_title, template, status, draft_content, created_by_id)
         VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7)`,
        [taskId, String(project_id), String(ectd_section), String(document_title), templateName || null, generatedContent, (req as any).user?.id ?? null]
      );
      res.status(202).json({ task_id: taskId });
    } catch (error) {
      console.error('[drafting] task could not be recorded:', error instanceof Error ? error.message : String(error));
      res.status(503).json({ error: 'Drafting task could not be recorded' });
    }
  });

  // GET /api/v1/drafting/task_status/:task_id — the task, read within the organisation.
  router.get('/v1/drafting/task_status/:task_id', authMiddleware as any, async (req: Request, res: Response) => {
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const taskId = String(req.params.task_id);
    try {
      // tenant-isolation-safe: the task is read through its program, with the session's organisation as a predicate.
      const { rows } = await pool.query(
        `SELECT t.task_id, t.project_id, t.ectd_section, t.document_title, t.template, t.status, t.draft_content, t.created_at, t.updated_at
           FROM drafting_tasks t
           JOIN regulatory_programs p ON p.id::text = t.project_id
          WHERE t.task_id = $1 AND p.organization_id = $2
          LIMIT 1`,
        [taskId, organizationId]
      );
      const task = rows[0];
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
      res.json({
        id: task.task_id,
        project_id: task.project_id,
        ectd_section: task.ectd_section,
        document_title: task.document_title,
        template: task.template,
        status: task.status,
        draft_content: task.draft_content,
        created_at: iso(task.created_at),
        updated_at: iso(task.updated_at),
      });
    } catch (error) {
      console.error('[drafting] task status could not be read:', error instanceof Error ? error.message : String(error));
      res.status(503).json({ error: 'Drafting task could not be read' });
    }
  });

  // POST /api/workflow/progression/create
  //
  // DISABLED (501) on 2026-10-14. This answered any IND → NDA/BLA request with a
  // plan none of which was read from anything: three phases of "2-3 months",
  // "4-6 months" and "6-12 months"; module "reuse" of 85%, 65% and 70% with an
  // "overallReuseRate" of 73; "criticalGaps" such as "Comprehensive efficacy data
  // required"; a "totalEstimatedCost" of "$2.5M - $4.2M" broken into clinical,
  // regulatory, manufacturing and QA ranges; and a risk assessment rating the
  // programme's "Manufacturing Complexity" Low because of an "Established
  // manufacturing process" — for a submission id it never looked up. Every
  // caller received the same figures, with the source submission's id echoed
  // back as if they described it. The path is reachable in production (it is
  // claimed by a launch surface's API prefix).
  //
  // No client calls it (grep: client/src, server). There is no engine behind any
  // of these figures, so there is no narrower true version to keep: a reuse rate
  // needs a mapping of the actual source documents, a cost needs a costing model,
  // a risk rating needs an assessment. Saying so is the honest answer.
  router.post('/workflow/progression/create', (_req: Request, res: Response) => {
    res.status(501).json({
      success: false,
      error: {
        code: 'not_implemented',
        message:
          'Submission progression planning is not available. The previous response was a fixed ' +
          'plan — reuse percentages, costs, gaps, timeline and risk ratings — that did not read ' +
          'the source submission.',
      },
    });
  });

  return router;
}
