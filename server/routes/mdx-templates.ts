/**
 * MDX Templates surface route.
 *
 *   GET /api/mdx/templates   — template library + framework registry
 *
 * Backs the kit Templates surface (client useTemplates). Returns the kit
 * payload shape { templates, frameworks } from the real document_templates
 * table, tenant-scoped. Empty-safe on a missing/empty table.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-templates');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Map a document_templates.category/module to a kit framework id. */
function toFramework(category: string | null, module: string | null): string {
  const v = `${category ?? ''} ${module ?? ''}`.toLowerCase();
  if (v.includes('510') || v.includes('estar')) return 'k510';
  if (v.includes('pma')) return 'pma';
  if (v.includes('cer') || v.includes('mdr')) return 'cer';
  if (v.includes('ind') || v.includes('nda') || v.includes('ectd')) return 'ind';
  return category ?? 'other';
}

interface TplRow {
  id: number | string; name: string | null; category: string | null;
  module: string | null; type: string | null; version: string | null;
  status: string | null; download_count: number | null;
  created_by_id: number | null; updated_at: Date | string | null;
}

const FRAMEWORK_LABELS: Record<string, string> = {
  k510: '510(k)', pma: 'PMA', cer: 'CER', ind: 'IND / eCTD',
};

router.get('/templates', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query<TplRow>(
      `SELECT id, name, category, module, type, version, status,
              download_count, created_by_id, updated_at
         FROM document_templates
        WHERE organization_id = $1 OR is_public = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 500`,
      [orgId],
    );

    const templates = rows.map((r) => ({
      id: `tpl-${r.id}`,
      framework: toFramework(r.category, r.module),
      type: r.type ?? r.category ?? '',
      title: r.name ?? '',
      ver: r.version ?? 'v1',
      status: r.status ?? 'draft',
      completion: 0,
      owner: r.created_by_id != null ? `u-${r.created_by_id}` : '',
      reviewers: [] as string[],
      lastEdit: r.updated_at ? new Date(r.updated_at).toISOString() : '',
      sections: 0,
      sectionsComplete: 0,
      uses: r.download_count ?? 0,
      editor: '',
      esigRequired: false,
      esigState: 'na',
    }));

    // Frameworks present in the live library, labelled where known.
    const fwCounts = new Map<string, number>();
    for (const t of templates) fwCounts.set(t.framework, (fwCounts.get(t.framework) ?? 0) + 1);
    const frameworks = [...fwCounts.keys()].map((id) => ({
      id,
      label: FRAMEWORK_LABELS[id] ?? id,
      desc: '',
    }));

    return ok(res, { templates, frameworks }, { count: templates.length });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') return ok(res, { templates: [], frameworks: [] }, { count: 0 });
    return serverError(res, log, 'templates', err);
  }
});

export default router;
