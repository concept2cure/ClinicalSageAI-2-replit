/**
 * Source Tracer API Routes
 *
 * Read-model backing the ui-v2 `SourceTracer` surface (Provenance / 21 CFR Part 11).
 * Aggregates sentence-level source citations (source_citations) joined to their
 * parent regulatory documents into per-document "sections", each carrying the
 * typed source + confidence of every traced sentence.
 *
 * This is a pure read / aggregate endpoint. It performs NO citation verification —
 * live PubMed / CrossRef existence checks remain the responsibility of the
 * existing POST /api/citations/verify endpoint (server/routes/citations.ts),
 * which the surface calls separately. This endpoint never asserts a verification
 * outcome.
 *
 * Tenant isolation: the organization id is taken from the authenticated request
 * context (never from the client body). The mount adds `authenticateToken`.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts (Router factory
 * default export, org id resolved from req context, scoped logger, honest error
 * shaping, fail-closed on a missing table).
 *
 * @module routes/source-tracer-routes
 */

import { Router, Request, Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import { sourceCitations, documents } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('source-tracer-routes');

// ─── Display shape (mirrors client SourceTracer StSection / StSentence) ─────────

interface StSentence {
  idx: number;
  sourceType: string;
  conf: number;
  text: string;
  sourceTitle: string;
  sourceId: string;
  sourceUrl: string | null;
  pmid?: string;
  doi?: string;
}

interface StSection {
  id: string;
  doc: string;
  sec: string;
  module: string | null;
  status: string;
  model: string | null;
  sentences: StSentence[];
}

// ─── Derivation helpers (honest: yield a value ONLY when one is really present) ─

/**
 * Extract a PubMed identifier when the stored source genuinely carries one — a
 * pubmed.ncbi.nlm.nih.gov URL, an explicit "PMID: nnnn" tag, or a bare numeric
 * sourceId. Returns undefined otherwise; never fabricated.
 */
function derivePmid(sourceId: string, sourceUrl: string | null): string | undefined {
  const url = sourceUrl ?? '';
  const urlMatch = url.match(/(?:pubmed\.ncbi\.nlm\.nih\.gov|\/pubmed)\/(\d{1,9})/i);
  if (urlMatch) return urlMatch[1];
  const tagged = sourceId.match(/\bPMID[:\s]*(\d{1,9})\b/i);
  if (tagged) return tagged[1];
  const bare = sourceId.trim();
  if (/^\d{1,9}$/.test(bare)) return bare;
  return undefined;
}

/**
 * Extract a DOI when the stored source genuinely carries one — a doi.org URL or
 * a 10.xxxx/… token in the sourceId. Returns undefined otherwise.
 */
function deriveDoi(sourceId: string, sourceUrl: string | null): string | undefined {
  const url = sourceUrl ?? '';
  const urlMatch = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s"'<>]+)/i);
  if (urlMatch) return urlMatch[1];
  const idMatch = sourceId.match(/(10\.\d{4,9}\/[^\s"'<>]+)/);
  if (idMatch) return idMatch[1];
  return undefined;
}

/**
 * Recover the generating model / agent label ONLY if the document metadata
 * stored one. Never fabricated — the surface treats this as an optional
 * annotation and renders nothing when it is null.
 */
function deriveModel(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, unknown>;
    for (const key of ['model', 'aiModel', 'generatedBy', 'generator']) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

// ─── Router Factory ─────────────────────────────────────────────────────────────

export default function createSourceTracerRoutes(): Router {
  const router = Router();

  /**
   * Resolve the tenant organization id from trusted authenticated context.
   * source_citations.organization_id and documents.organization_id are integers,
   * so this returns a number (mirrors server/routes/sourceLinks.ts).
   */
  function getOrganizationId(req: Request): number {
    const trusted =
      (req as any).user?.organizationId ??
      (req as any).user?.tenantId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).tenantId;
    const orgId = parseInt(String(trusted), 10);
    if (isNaN(orgId) || orgId <= 0) {
      throw new Error('ST_NO_TENANT: authenticated organization context required');
    }
    return orgId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/source-tracer/sections
  // Every traced document section for the org, with sentence-level provenance.
  // Optional ?documentId=<int> narrows to a single document.
  // ═══════════════════════════════════════════════════════════════════════════
  router.get('/sections', async (req: Request, res: Response) => {
    let organizationId: number;
    try {
      organizationId = getOrganizationId(req);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unauthorized',
      });
    }

    // Optional single-document filter
    let documentFilter: number | null = null;
    if (req.query.documentId !== undefined) {
      const parsed = parseInt(String(req.query.documentId), 10);
      if (isNaN(parsed)) {
        return res.status(400).json({ success: false, error: 'documentId must be an integer' });
      }
      documentFilter = parsed;
    }

    try {
      const db = requestDb(req);
      const conditions = [
        eq(sourceCitations.organizationId, organizationId),
        eq(documents.organizationId, organizationId),
      ];
      if (documentFilter !== null) {
        conditions.push(eq(sourceCitations.documentId, documentFilter));
      }

      const rows = await db
        .select({
          documentId: sourceCitations.documentId,
          sentenceIndex: sourceCitations.sentenceIndex,
          sentenceText: sourceCitations.sentenceText,
          sourceType: sourceCitations.sourceType,
          sourceId: sourceCitations.sourceId,
          sourceTitle: sourceCitations.sourceTitle,
          sourceUrl: sourceCitations.sourceUrl,
          confidence: sourceCitations.confidence,
          docTitle: documents.title,
          docCode: documents.documentCode,
          docModule: documents.module,
          docStatus: documents.status,
          docMetadata: documents.metadata,
        })
        .from(sourceCitations)
        .innerJoin(documents, eq(sourceCitations.documentId, documents.id))
        .where(and(...conditions))
        .orderBy(asc(sourceCitations.documentId), asc(sourceCitations.sentenceIndex));

      // Group citations into per-document sections (one section card per document).
      // section_id on source_citations is an unresolvable bare integer (no sections
      // reference table), so sub-document grouping is intentionally collapsed here.
      const byDocument = new Map<number, StSection>();
      for (const r of rows) {
        let section = byDocument.get(r.documentId);
        if (!section) {
          section = {
            id: String(r.documentId),
            doc: r.docTitle,
            sec: r.docCode,
            module: r.docModule ?? null,
            status: r.docStatus,
            model: deriveModel(r.docMetadata),
            sentences: [],
          };
          byDocument.set(r.documentId, section);
        }
        const pmid = derivePmid(r.sourceId, r.sourceUrl);
        const doi = deriveDoi(r.sourceId, r.sourceUrl);
        section.sentences.push({
          idx: r.sentenceIndex,
          sourceType: r.sourceType,
          conf: r.confidence,
          text: r.sentenceText,
          sourceTitle: r.sourceTitle,
          sourceId: r.sourceId,
          sourceUrl: r.sourceUrl ?? null,
          ...(pmid ? { pmid } : {}),
          ...(doi ? { doi } : {}),
        });
      }

      const sections = Array.from(byDocument.values());
      return res.json({
        success: true,
        data: { sections, total: sections.length },
      });
    } catch (error: any) {
      // Fail-closed if the provenance table has not been migrated yet
      // (42P01 undefined_table / 42703 undefined_column) — never fabricate.
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('source_citations not available; returning 503', { code: error.code });
        return res.status(503).json({
          success: false,
          error: 'SOURCE_CITATIONS_TABLE_MISSING',
        });
      }
      logger.error('source tracer sections error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load source tracer sections' });
    }
  });

  return router;
}
