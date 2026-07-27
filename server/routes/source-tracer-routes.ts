/**
 * Source Tracer API Routes — RECORDED source lineage per authored section.
 *
 * Read-model backing the ui-v2 `SourceTracer` surface (Provenance / 21 CFR
 * Part 11). Serves the sections that carry recorded canonical-source citations
 * (`authoring_citations`, source = 'cre_evidence_source'), each with the cited
 * source's standing against its content TODAY — computed from the checksum
 * captured at cite time versus the source's checksum now.
 *
 * ── Why this no longer reads `source_citations` ────────────────────────────
 * The previous read-model aggregated a sentence-level table that never had DDL
 * anywhere in the repository, so this endpoint had returned 503 against every
 * deployed database — the surface has never once shown live data. Worse, the
 * table could not simply be created: its writer inserted
 * `concept2cure_artifacts` ids into `document_id` while this reader joined
 * `documents.id`, two unrelated serial sequences. Standing the table up would
 * have made the surface render one document's sentences under another
 * document's title. On a provenance surface, confidently wrong beats absent as
 * the worst available outcome, so the whole sentence-level path was retired
 * rather than given a schema.
 *
 * What is served instead is the platform's actual provenance: citations a
 * person recorded (via the authoring Sources rail / cite-source API), carrying
 * the source's content identity at the moment of citation. Nothing is inferred
 * from text similarity, and no confidence score is reported because nothing is
 * being guessed. "Never present inferred matches as locked source lineage."
 *
 * Tenant isolation: the organization id is taken from the authenticated request
 * context (never from the client body). The mount adds `authenticateToken`.
 * Fail-closed: where the authoring tables are not provisioned (42P01/42703) the
 * endpoint returns 503, never an empty success.
 *
 * @module routes/source-tracer-routes
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('source-tracer-routes');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function createSourceTracerRoutes(): Router {
  const router = Router();

  /** Resolve the tenant organization id from trusted authenticated context. */
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
  // Every authored section with recorded source citations, grouped per section.
  // Optional ?documentId=<uuid> narrows to one authoring document.
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

    // Optional single-document filter. Authoring document ids are UUIDs; reject
    // anything else here rather than letting Postgres raise 22P02.
    let documentFilter: string | null = null;
    if (req.query.documentId !== undefined) {
      const raw = String(req.query.documentId);
      if (!UUID_RE.test(raw)) {
        return res.status(400).json({ success: false, error: 'documentId must be a UUID' });
      }
      documentFilter = raw;
    }

    try {
      const { listCitedSections } = await import(
        '../services/clinical-regulatory-evidence/source-usage.service.js'
      );
      const cited = await listCitedSections(organizationId, { documentId: documentFilter });

      // Shape for the surface: one card per section, its recorded sources with
      // their standing. `state` comes from the service (current / changed /
      // unverified / unresolved) — the client renders it, never computes it.
      const sections = cited.map((s) => ({
        id: s.sectionId,
        doc: s.documentTitle ?? 'Untitled document',
        sec: s.sectionCode ?? '—',
        sectionTitle: s.sectionTitle,
        module: s.module,
        status: s.documentStatus ?? 'draft',
        sources: s.sources.map((u) => ({
          citationId: u.citationId,
          state: u.state,
          citedAt: u.citedAt,
          citationText: u.citationText,
          citedChecksum: u.citedChecksum,
          sourceId: u.source?.id ?? null,
          sourceTitle: u.source?.title ?? null,
          currentChecksum: u.source?.checksum ?? null,
          extractionStatus: u.source?.extractionStatus ?? null,
          mimeType: u.source?.mimeType ?? null,
        })),
      }));

      return res.json({ success: true, data: { sections, total: sections.length } });
    } catch (error: any) {
      // Fail-closed if the authoring/citation tables are not provisioned
      // (42P01 undefined_table / 42703 undefined_column) — never fabricate.
      if (error?.code === '42P01' || error?.code === '42703') {
        logger.warn('citation store not available; returning 503', { code: error.code });
        return res.status(503).json({
          success: false,
          error: 'CITATION_STORE_MISSING',
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
