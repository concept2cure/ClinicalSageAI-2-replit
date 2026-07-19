/**
 * Batch Draft API Routes
 *
 * Read-model backing the ui-v2 `BatchDraft` surface (parallel eCTD section
 * drafting). The surface renders a dossier "spine" of draftable document
 * leaves; the user selects several and drafts them in parallel. THIS endpoint
 * serves only the read side — the persisted spine. The drafting itself is a
 * separate streaming POST action (window.C2C_AUTHORING.batchDraft) and
 * acceptance is a governed POST (window.C2C_AUTHORING.saveSection); neither is
 * part of this module.
 *
 * Source of truth: `coauthor_documents` (shared/schema coauthorDocuments) — the
 * canonical eCTD Co-Author document table already served by
 * server/routes/coauthor.ts. Each row is one leaf in the dossier spine. Field
 * mapping (surface LeafSection field ← column):
 *   id      ← id                    (serial PK, stable unique leaf key)
 *   num     ← module_number         ('—' when the row carries no eCTD number,
 *                                     mirroring the fixture's numberless leaves)
 *   title   ← title
 *   status  ← status                (draft | in-progress | review | approved |
 *                                     finalized — the REAL stored lifecycle
 *                                     state; NOT remapped to the fixture words)
 *   pct     ← completion_percentage (null when never computed — not fabricated)
 *   preview ← content               (plain-text excerpt of the stored HTML;
 *                                     null when the document has no content)
 *
 * Honest gaps (returned as documented nulls — never fabricated):
 *   • program  — coauthor_documents has no program/application entity, so the
 *                spine header program is null; the surface already falls back to
 *                'Active dossier'.
 *   • standard — the 'eCTD' | 'multi' label is not persisted per document; null
 *                (the surface omits it when absent).
 *   • The spine is returned as a FLAT list of leaves (no folder hierarchy); the
 *     surface flattens the tree before use (bdFlatten), so nothing is lost.
 *
 * Tenant isolation: organization id comes from the authenticated request
 * context only (never the client body) and the table is queried through the
 * request-scoped Drizzle client (requestDb) so RLS session vars apply. The
 * mount adds `authenticateToken`.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * server/routes/source-tracer-routes.ts (Router factory default export, org id
 * from req context, scoped logger, honest error shaping, fail-closed on a
 * missing table).
 *
 * @module routes/batch-draft-routes
 */

import { Router, Request, Response } from 'express';
import { asc, eq } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import { coauthorDocuments } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('batch-draft-routes');

// Defensive upper bound on spine size (a spine is the whole document
// architecture; realistic dossiers are well under this).
const MAX_LEAVES = 1000;

// ─── Display shape (mirrors client BatchDraft LeafSection / DossierSpine) ────────

interface BatchDraftLeaf {
  /** Stable unique leaf id (coauthor_documents.id) — used for React keys. */
  id: string;
  /** Display/section number (e.g. '3.2.S.4.1'); '—' when the row has none. */
  num: string;
  title: string;
  /** Real stored lifecycle state; NOT remapped to the fixture vocabulary. */
  status: string;
  /** Completion percentage, or null when never computed (not fabricated). */
  pct: number | null;
  /** Plain-text excerpt of the stored document HTML, or null when empty. */
  preview: string | null;
}

interface BatchDraftSpine {
  /** No program entity is persisted — null; surface falls back to 'Active dossier'. */
  program: string | null;
  /** 'eCTD' | 'multi' label is not persisted — null. */
  standard: string | null;
  /** Flat list of draftable document leaves (surface flattens before use). */
  tree: BatchDraftLeaf[];
}

// ─── Derivation helpers (honest: yield a value ONLY when one is really present) ─

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Produce a short plain-text preview from the stored TipTap HTML content.
 * Strips tags, decodes a handful of common entities, collapses whitespace, and
 * truncates. Returns null when the document carries no usable text — never a
 * placeholder or fabricated summary.
 */
function derivePreview(content: string | null): string | null {
  if (!content) return null;
  let text = content.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, m => HTML_ENTITIES[m] ?? ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text;
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createBatchDraftRoutes(): Router {
  const router = Router();

  /**
   * Resolve the tenant organization id from trusted authenticated context.
   * coauthor_documents.organization_id is an integer, so this returns a number
   * (mirrors server/routes/source-tracer-routes.ts).
   */
  function getOrganizationId(req: Request): number {
    const trusted =
      (req as any).user?.organizationId ??
      (req as any).user?.tenantId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).tenantId;
    const orgId = parseInt(String(trusted), 10);
    if (isNaN(orgId) || orgId <= 0) {
      throw new Error('BD_NO_TENANT: authenticated organization context required');
    }
    return orgId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/batch-draft/spine
  // The org's persisted eCTD document spine — every draftable leaf with its real
  // status, completion percentage, and a content-derived preview. The surface
  // filters this to the "still to draft" set and drives parallel drafting via a
  // separate streaming POST (window.C2C_AUTHORING.batchDraft).
  // ═══════════════════════════════════════════════════════════════════════════
  router.get('/spine', async (req: Request, res: Response) => {
    let organizationId: number;
    try {
      organizationId = getOrganizationId(req);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unauthorized',
      });
    }

    try {
      const db = requestDb(req);
      const rows = await db
        .select({
          id: coauthorDocuments.id,
          moduleNumber: coauthorDocuments.moduleNumber,
          title: coauthorDocuments.title,
          status: coauthorDocuments.status,
          completionPercentage: coauthorDocuments.completionPercentage,
          content: coauthorDocuments.content,
        })
        .from(coauthorDocuments)
        .where(eq(coauthorDocuments.organizationId, organizationId))
        .orderBy(asc(coauthorDocuments.moduleNumber), asc(coauthorDocuments.title))
        .limit(MAX_LEAVES);

      const tree: BatchDraftLeaf[] = rows.map(r => ({
        id: String(r.id),
        num: r.moduleNumber ?? '—',
        title: r.title,
        status: r.status,
        pct: r.completionPercentage ?? null,
        preview: derivePreview(r.content),
      }));

      const spine: BatchDraftSpine = {
        program: null,
        standard: null,
        tree,
      };

      return res.json({ success: true, data: spine });
    } catch (error: any) {
      // Fail-closed if the co-author document table has not been migrated yet
      // (42P01 undefined_table / 42703 undefined_column) — never fabricate.
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('coauthor_documents not available; returning 503', { code: error.code });
        return res.status(503).json({
          success: false,
          error: 'COAUTHOR_DOCUMENTS_TABLE_MISSING',
        });
      }
      logger.error('batch draft spine error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load batch draft spine' });
    }
  });

  return router;
}
