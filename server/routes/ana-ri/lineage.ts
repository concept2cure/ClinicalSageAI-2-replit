/**
 * AnA document lineage & decision dossier routes.
 *
 * Exposes the per-document convergence dossier — full data + decision lineage,
 * every iteration, AnA's reasoning, and the audit trail — assembled by
 * {@link buildDocumentLineageDossier}. Two representations of the same dossier:
 *
 *   GET /api/ana-ri/documents/:artifactId/lineage-dossier      → JSON
 *   GET /api/ana-ri/documents/:artifactId/lineage-dossier.xml  → XML metadata
 *
 * Both are tenant-scoped: the artifact must belong to the caller's org (a
 * missing org context is 401; an artifact the tenant can't see is 404). The XML
 * form is the "every document obtains its lineage as structured metadata"
 * representation and reuses the AnALedger serializer.
 *
 * @module server/routes/ana-ri/lineage
 */
import type { Request, Response, Router } from 'express';
import { extractRequestContext } from './shared.js';
import { buildDocumentLineageDossier } from '../../services/ana/lineage-dossier.js';
import { serializeDocumentLineageDossierXml } from '../../services/ana/lineage-dossier-xml.js';

export function mountLineageRoutes(router: Router): void {
  /**
   * XML representation — registered before the JSON path so the `.xml` suffix
   * is matched as its own literal route.
   */
  router.get(
    '/documents/:artifactId/lineage-dossier.xml',
    async (req: Request, res: Response) => {
      const { orgId } = extractRequestContext(req);
      if (!orgId) {
        return res.status(401).json({ error: 'Organization context required' });
      }
      const artifactId = String(req.params.artifactId);
      try {
        const dossier = await buildDocumentLineageDossier(artifactId, orgId);
        if (!dossier) {
          return res.status(404).json({ error: 'Document not found' });
        }
        const xml = serializeDocumentLineageDossierXml(dossier);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="lineage-dossier-${artifactId}.xml"`,
        );
        return res.status(200).send(xml);
      } catch (err: any) {
        console.error('[AnA lineage-dossier.xml] failed:', err?.message);
        return res.status(500).json({ error: 'Failed to assemble lineage dossier' });
      }
    },
  );

  /** JSON representation — the structured dossier for the frontend view. */
  router.get(
    '/documents/:artifactId/lineage-dossier',
    async (req: Request, res: Response) => {
      const { orgId } = extractRequestContext(req);
      if (!orgId) {
        return res.status(401).json({ error: 'Organization context required' });
      }
      const artifactId = String(req.params.artifactId);
      try {
        const dossier = await buildDocumentLineageDossier(artifactId, orgId);
        if (!dossier) {
          return res.status(404).json({ error: 'Document not found' });
        }
        return res.status(200).json(dossier);
      } catch (err: any) {
        console.error('[AnA lineage-dossier] failed:', err?.message);
        return res.status(500).json({ error: 'Failed to assemble lineage dossier' });
      }
    },
  );
}
