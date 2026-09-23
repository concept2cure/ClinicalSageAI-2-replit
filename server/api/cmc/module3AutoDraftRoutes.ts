/**
 * Module 3 Auto-Draft API Routes
 *
 * Bridges uploaded/extracted CMC documents to a drafted Module 3 in one shot.
 * Closes the GA gap "CMC / Module 3 ... lacks auto-draft-from-uploads"
 * (GA_GAP_AUDIT_2026-06-10.md:40).
 *
 * Endpoint:
 *  POST /auto-draft/:projectId — map extracted documents → CanonicalSource[] →
 *    compose Module 3 → (optionally) bridge drafted sections to governed
 *    artifacts. Org-scoped, audited via the existing bridge provenance events.
 *
 * Mounted at /api/cmc/module3 ⇒ POST /api/cmc/module3/auto-draft/:projectId
 */

import express from 'express';
import { CMC_SOURCE_TYPES } from '../../services/module3Composer';
import { z } from 'zod';
import { autoDraftModule3 } from '../../services/cmc/auto-draft-composer';

const router = express.Router();

/* The composer's own list — a hand copy here lacked qc_result and drifted. */

const extractedDocumentSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum(CMC_SOURCE_TYPES).nullable().optional(),
  ctdSection: z.string().nullable().optional(),
  payload: z.record(z.any()).nullable().optional(),
  sourceHash: z.string().nullable().optional(),
});

const autoDraftSchema = z.object({
  documents: z.array(extractedDocumentSchema).min(1),
  /**
   * REMOVED 2026-09-08 — accepted, and refused.
   *
   * `persist: true` walked caller-supplied JSON through the convergence bridge,
   * which UPDATEs the section's governed artifact with `content = $1,
   * version = version + 1` and metadata stamped `compiledFrom: 'module3-os'`
   * with `sourceObjectIds` taken from that same request body. No canonical
   * source object, no section row, no lineage, no compile. So any authenticated
   * caller in the org could overwrite an approved section's governed artifact
   * with typed prose that claims to have been compiled from records that do not
   * exist — through the endpoint whose own docstring calls the dry-run "safe".
   *
   * A governed artifact comes from the canonical spine or it does not exist:
   * services/cmc/module3-compile.ts composes from cmc_source_objects, writes
   * the section row, its lineage and its provenance event, and only then
   * bridges. This endpoint is a PREVIEW of what uploads would draft — useful,
   * and never a writer. The field is still accepted so an old caller gets a
   * stated refusal rather than a silent no-op.
   */
  persist: z.boolean().optional().default(false),
});

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10,
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

// ── POST /auto-draft/:projectId ────────────────────────────────────────────────

router.post('/auto-draft/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectIdRaw = req.params.projectId;
    const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : projectIdRaw ?? '';
    const data = autoDraftSchema.parse(req.body);

    // 1. Bridge: extracted documents → CanonicalSource[] → composed Module 3.
    const { sections, coverage } = autoDraftModule3(data.documents);

    /* No write path. See the note on `persist` above: this endpoint composes a
       PREVIEW from documents in the request body, and a preview may not become
       a governed artifact — that is what the compile route is for, from
       canonical sources with lineage and provenance. A caller that asks to
       persist is told plainly, rather than being handed a success it did not
       get. */
    if (data.persist) {
      return res.status(400).json({
        success: false,
        error:
          'This endpoint drafts a PREVIEW from the documents you sent; it cannot write a governed artifact. ' +
          'Record the documents as canonical sources, then compile the project ' +
          '(POST /api/cmc/module3-os/compile/:projectId), which writes each section with its lineage and provenance.',
      });
    }

    return res.json({
      success: true,
      data: {
        projectId,
        coverage,
        sections: sections.map((s) => ({
          sectionKey: s.sectionKey,
          sectionPath: s.sectionPath,
          completeness: s.completeness,
          missingInputs: s.missingInputs,
          narrativeDraft: s.narrativeDraft,
          tables: s.tables,
          sourceCount: s.lineage.length,
        })),
        /* Always false: this endpoint does not persist. Kept in the shape so an
           existing reader sees the answer rather than an absent field. */
        persisted: false,
        persistedArtifacts: [] as Array<{ sectionKey: string; artifactId: string; isNew: boolean }>,
        persistErrors: [] as Array<{ sectionKey: string; error: string }>,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid auto-draft payload', details: error.errors });
    }
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Auto-draft failed',
    });
  }
});

export default router;
