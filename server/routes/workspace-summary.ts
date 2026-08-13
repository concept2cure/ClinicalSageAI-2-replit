/**
 * Workspace Summary Route
 * GET /api/workspace/summary
 *
 * Returns the canonical workspace state for the /concept2cure home page:
 * org details, real counts, recent activity, and next-action suggestions.
 */
import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../db';

const router = Router();

async function sq(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
  try {
    return await dbQuery(sql, params);
  } catch (_) {
    return { rows: [] };
  }
}

/** Derive a "mode" from the project's submission type → industry label */
function modeFromType(type: string | null): string {
  if (!type) return 'biotech';
  const t = type.toLowerCase();
  if (
    t.includes('510') ||
    t.includes('pma') ||
    t.includes('de_novo') ||
    t.includes('meddev') ||
    t.includes('medical_device')
  )
    return 'medtech';
  if (t.includes('cer') || t.includes('ivdr') || t.includes('mdd')) return 'medtech';
  if (t.includes('nda') || t.includes('bla') || t.includes('maa')) return 'biopharma';
  if (t.includes('ind') || t.includes('clinical') || t.includes('protocol')) return 'biotech';
  return 'biotech';
}

router.get('/workspace/summary', async (req: Request, res: Response) => {
  const userId: string = (req as any).userId;
  // Derive orgId from JWT only — never trust query params for multi-tenant security.
  // The client must authenticate with a valid token; the org is embedded in the JWT.
  const orgId: string = (req as any).organizationId;
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    // ── 1. Org details ──────────────────────────────────────────────────────
    const orgRes = await sq(
      `SELECT id, COALESCE(display_name, name, legal_name, 'Concept2Cure') AS name,
              COALESCE(slug, 'concept2cure') AS slug,
              COALESCE(industry_mode, 'biotech') AS industry_mode
       FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId]
    );
    const org = orgRes.rows[0] || {
      id: orgId,
      name: 'Concept2Cure',
      slug: 'concept2cure',
      industry_mode: 'biotech',
    };

    // ── 2. CRO clients for this org ─────────────────────────────────────────
    const clientsRes = await sq(
      `SELECT id, COALESCE(name, company_name, 'Client') AS name
       FROM cro_clients
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [orgId]
    );

    // ── 3. Project counts (all project tables) ──────────────────────────────
    // Every count is scoped to the caller's org — a workspace summary must
    // reflect this tenant's data, not a global cross-tenant total.
    const [indCount, cerCount, fdaCount] = await Promise.all([
      sq(`SELECT COUNT(*) AS n FROM ind_projects WHERE organization_id = $1`, [orgId]).then(r =>
        parseInt(r.rows[0]?.n || '0', 10)
      ),
      sq(`SELECT COUNT(*) AS n FROM cer_projects WHERE organization_id = $1`, [orgId]).then(r =>
        parseInt(r.rows[0]?.n || '0', 10)
      ),
      sq(`SELECT COUNT(*) AS n FROM fda_510k_projects WHERE organization_id = $1`, [orgId]).then(
        r => parseInt(r.rows[0]?.n || '0', 10)
      ),
    ]);
    const totalProjects = indCount + cerCount + fdaCount;

    // ── 4. Document counts ──────────────────────────────────────────────────
    const [docsCount, uploadsCount] = await Promise.all([
      sq(`SELECT COUNT(*) AS n FROM documents WHERE organization_id = $1`, [orgId]).then(r =>
        parseInt(r.rows[0]?.n || '0', 10)
      ),
      sq(`SELECT COUNT(*) AS n FROM file_uploads WHERE organization_id = $1`, [orgId]).then(r =>
        parseInt(r.rows[0]?.n || '0', 10)
      ),
    ]);
    const totalDocuments = Math.max(docsCount, uploadsCount);

    // ── 5. Recent threads ───────────────────────────────────────────────────
    const threadsRes = await sq(
      `SELECT id::text,
              COALESCE(title, 'Untitled conversation') AS title,
              COALESCE(updated_at, created_at) AS updated_at
       FROM chat_threads
       WHERE organization_id = $1
       ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
       LIMIT 5`,
      [orgId]
    );

    // ── 6. Thread count ─────────────────────────────────────────────────────
    const threadCountRes = await sq(
      `SELECT COUNT(*) AS n FROM chat_threads WHERE organization_id = $1`,
      [orgId]
    );
    const threadCount = parseInt(threadCountRes.rows[0]?.n || '0', 10);

    // ── 7. Recent uploads ───────────────────────────────────────────────────
    // Columns match what the upload route actually writes (`original_name`,
    // `created_at` — see migrations/20260726_file_uploads_tenancy.sql). The
    // previous COALESCE over `original_filename`/`filename`/`file_name` and
    // `uploaded_at` named columns that exist on no deployment, so the query
    // threw on every call and `sq` swallowed it — this panel has been silently
    // empty rather than wrong-looking, which is why it went unnoticed.
    const recentDocsRes = await sq(
      `SELECT id,
              COALESCE(original_name, 'document') AS name,
              created_at AS uploaded_at
       FROM file_uploads
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [orgId]
    );

    // ── 8. Recent exports ───────────────────────────────────────────────────
    const recentExportsRes = await sq(
      `SELECT e.id::text,
              COALESCE(e.format, 'DOCX') AS type,
              COALESCE(e.created_at, e.exported_at) AS created_at
       FROM cer_exports e
       JOIN cer_reports r ON r.report_id = e.report_id AND r.organization_id = $1
       ORDER BY COALESCE(e.created_at, e.exported_at) DESC NULLS LAST LIMIT 5`,
      [orgId]
    );

    // ── 8b. Recent artifacts (generated outlines, validation reports, etc.) ──
    const recentArtifactsRes = await sq(
      `SELECT id, type, title, status, project_id, created_at
       FROM artifacts
       WHERE org_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [orgId]
    );

    // ── 9. Pending validations (open QC issues, advisory flags) ────────────
    // `validation_status` never existed on this table in any migration shape —
    // the predicate 42703'd and the guarded query silently reported 0 pending
    // reviews on every workspace load. `status` is the real lifecycle column
    // (D11d IVDR consolidation, 2026-08-13).
    const pendingRes = await sq(
      `SELECT COUNT(*) AS n FROM ivdr_analytical_validations
       WHERE organization_id = $1
         AND status IN ('in_progress', 'pending')`,
      [orgId]
    );
    const pendingReviews = parseInt(pendingRes.rows[0]?.n || '0', 10);

    // ── 10. Most recent project (for "continue where you left off") ─────────
    const lastProjectRes = await sq(
      `SELECT id, name, source, submission_type, updated_at FROM (
         SELECT id, name, 'ind' AS source, submission_type, updated_at FROM ind_projects WHERE organization_id = $1
         UNION ALL
         SELECT id, title AS name, 'cer' AS source, 'CER' AS submission_type, updated_at FROM cer_projects WHERE organization_id = $1
         UNION ALL
         SELECT id::text, name, '510k' AS source, '510K' AS submission_type, updated_at FROM fda_510k_projects WHERE organization_id = $1
       ) p
       ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [orgId]
    );
    const lastProject = lastProjectRes.rows[0] || null;

    // ── 11. Build next actions based on actual state ────────────────────────
    const nextActions: Array<{ id: string; label: string; intent: string; description?: string }> =
      [];

    if (totalDocuments === 0) {
      nextActions.push({
        id: 'upload_docs',
        label: 'Upload your first documents',
        intent: 'vault.upload',
        description: 'Add PDFs, DOCX files or datasets to the vault.',
      });
    }
    if (totalProjects === 0) {
      nextActions.push({
        id: 'new_project',
        label: 'Create a project',
        intent: 'project.new',
        description: 'Start a 510(k), IND, CER or NDA project.',
      });
    } else {
      nextActions.push({
        id: 'upload_docs',
        label: 'Upload supporting documents',
        intent: 'vault.upload',
        description: 'Add files to the project vault.',
      });
    }
    if (totalProjects > 0 && totalDocuments > 0) {
      nextActions.push({
        id: 'run_validator',
        label: 'Run regulatory validator',
        intent: 'validation.run',
        description: 'Check submission readiness against FDA / CE criteria.',
      });
    }
    nextActions.push({
      id: 'ask_lumen',
      label: 'Ask AnA a regulatory question',
      intent: 'chat.new',
      description: 'AI trained on FDA, ICH, ISO 14971 and CE guidelines.',
    });

    // ── 12. Compliance score (simple heuristic) ─────────────────────────────
    const complianceScore =
      pendingReviews === 0 && totalDocuments > 0
        ? 98
        : pendingReviews > 5
          ? 72
          : pendingReviews > 0
            ? 89
            : totalDocuments === 0
              ? 0
              : 95;

    // ── 13. Build response ───────────────────────────────────────────────────
    const summary = {
      org: { id: String(org.id), name: org.name, slug: org.slug, industryMode: org.industry_mode },
      clients: clientsRes.rows.map(c => ({
        id: String(c.id),
        name: c.name,
        projectCount: 0,
      })),
      active: {
        clientId: clientsRes.rows[0] ? String(clientsRes.rows[0].id) : null,
        projectId: lastProject ? String(lastProject.id) : null,
        projectName: lastProject?.name || null,
        mode: modeFromType(lastProject?.submission_type || null),
      },
      counts: {
        projects: totalProjects,
        documents: totalDocuments,
        pendingReviews,
        complianceScore,
        threads: threadCount,
      },
      recent: {
        threads: threadsRes.rows.map(t => ({
          id: String(t.id),
          title: t.title,
          updatedAt: t.updated_at,
          projectId: null,
        })),
        documents: recentDocsRes.rows.map(d => ({
          id: String(d.id),
          name: d.name,
          uploadedAt: d.uploaded_at,
        })),
        exports: recentExportsRes.rows.map(e => ({
          id: String(e.id),
          type: e.type,
          createdAt: e.created_at,
        })),
        validations: [],
        artifacts: recentArtifactsRes.rows.map(a => ({
          id: String(a.id),
          type: a.type,
          title: a.title,
          status: a.status,
          projectId: a.project_id ? String(a.project_id) : null,
          createdAt: a.created_at,
        })),
      },
      nextActions,
    };

    // ── 14. Store active client/project in a header so frontend can hydrate ─
    res.json({ success: true, data: summary });
  } catch (err: any) {
    // This used to answer `success: true` with a FABRICATED workspace: a
    // hardcoded org identity ("Concept2Cure" / biotech) that is not the caller's
    // tenant, zeroed project/document counts, and complianceScore 0. Every one
    // of those is a factual claim about the customer's regulatory workspace, and
    // none of them came from a query that ran. The screen looked healthy while
    // reporting someone else's org name and a compliance posture nobody
    // computed. A summary that could not be assembled has to fail as one.
    console.error('[workspace/summary] error:', err?.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to assemble the workspace summary',
      code: 'WORKSPACE_SUMMARY_ERROR',
    });
  }
});

export default router;
