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
import { z } from 'zod';
import { autoDraftModule3 } from '../../services/cmc/auto-draft-composer';
import { bridgeCompileToArtifact } from '../../services/module3-convergence-service';

const router = express.Router();

const CMC_SOURCE_TYPES = [
  'drug_substance',
  'drug_product',
  'specification',
  'method',
  'stability',
  'batch',
  'change_control',
  'comparability',
  'manufacturing_process',
  'characterization',
  'reference_standard',
  'container_closure',
  'excipient',
  'process_validation',
  'raw_material_spec',
  'impurity_profile',
  'dissolution_profile',
  'formulation_record',
] as const;

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
   * When true, each drafted section that has source coverage is written through
   * to a governed artifact via the existing convergence bridge (audited).
   * Defaults to false so the endpoint is safe to call as a dry-run/preview.
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

    // 2. Optionally write through to governed artifacts (reuses existing,
    //    audited bridge — no new persistence logic here).
    const persistedArtifacts: Array<{ sectionKey: string; artifactId: string; isNew: boolean }> = [];
    const persistErrors: Array<{ sectionKey: string; error: string }> = [];

    if (data.persist) {
      for (const section of sections) {
        // Only persist sections that actually have source coverage.
        if (section.lineage.length === 0) continue;
        try {
          const bridged = await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
            narrativeDraft: section.narrativeDraft,
            tables: section.tables,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
            lineage: section.lineage,
          });
          persistedArtifacts.push({ sectionKey: section.sectionKey, ...bridged });
        } catch (bridgeErr) {
          persistErrors.push({
            sectionKey: section.sectionKey,
            error: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr),
          });
        }
      }
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
        persisted: data.persist,
        persistedArtifacts,
        persistErrors,
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
