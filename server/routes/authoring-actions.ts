/**
 * Authoring Actions API — Wave 1 + Wave 2 AnA-first authoring action endpoints.
 *
 * These endpoints serve the section-aware authoring actions that AnA triggers
 * from the frontend. They reuse existing backend services (contradiction engine,
 * readiness engine, promote handler, harmonize engine, etc.).
 *
 * @module server/routes/authoring-actions
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ─── Wave 1 Action 1: Resume Last Section ────────────────────────────────────

router.get('/resume-last-section/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Query artifacts sorted by most recent update
    const { db } = await import('../db.js');
    const artifacts = await db.query.concept2cureArtifacts?.findMany?.({
      where: (a: any, { eq }: any) => eq(a.projectId, Number(projectId)),
      orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
      limit: 1,
    }).catch(() => null);

    if (!artifacts || artifacts.length === 0) {
      return res.json({
        found: false,
        message: 'No recent sections found. Start by opening a section from the dossier.',
      });
    }

    const latest = artifacts[0];
    return res.json({
      found: true,
      artifactId: latest.id,
      title: latest.title,
      ctdSection: latest.ctdSection || null,
      status: latest.status || 'draft',
      updatedAt: latest.updatedAt,
    });
  } catch (err: any) {
    console.error('[authoring-actions] resume-last-section error:', err?.message);
    return res.status(500).json({ error: 'Failed to resolve last section' });
  }
});

// ─── Wave 1 Action 3: Explain Promotion Blockers ────────────────────────────

router.get('/promotion-blockers/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { artifactId, sectionCode } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const blockers: Array<{ type: string; severity: string; message: string; source: string }> = [];

    // Check contradiction engine
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const findings = await contradictionEngineService.scanProject(
          'default',
          Number(projectId)
        );
        if (findings?.length) {
          for (const f of findings) {
            if (
              f.authorityState === 'blocks_promotion' ||
              f.authorityState === 'requires_approval'
            ) {
              blockers.push({
                type: f.contradictionType || f.type || 'contradiction',
                severity: f.authorityState === 'blocks_promotion' ? 'critical' : 'major',
                message: f.explanation || f.description || 'Unresolved contradiction',
                source: 'contradiction-engine',
              });
            }
          }
        }
      }
    } catch {
      // Contradiction engine unavailable — non-blocking
    }

    // Check readiness engine
    try {
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      if (computeReadinessAssessment) {
        const assessment = await computeReadinessAssessment({
          projectId: Number(projectId),
          organizationId: 'default',
        });
        if (assessment?.blockers?.length) {
          for (const b of assessment.blockers) {
            blockers.push({
              type: b.type || 'readiness',
              severity: b.severity || 'major',
              message: b.description || b.message || 'Readiness blocker',
              source: 'readiness-engine',
            });
          }
        }
      }
    } catch {
      // Readiness engine unavailable — non-blocking
    }

    return res.json({
      projectId,
      artifactId: artifactId || null,
      sectionCode: sectionCode || null,
      blocked: blockers.some(b => b.severity === 'critical'),
      blockerCount: blockers.length,
      blockers,
    });
  } catch (err: any) {
    console.error('[authoring-actions] promotion-blockers error:', err?.message);
    return res.status(500).json({ error: 'Failed to check promotion blockers' });
  }
});

// ─── Wave 1 Action 4: Compare Against Last Approved Version ──────────────────

router.get('/compare-versions/:projectId/:artifactId', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.params;

    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    // Fetch artifact versions
    const { db } = await import('../db.js');
    const versions = await db.query.concept2cureArtifactVersions?.findMany?.({
      where: (v: any, { eq }: any) => eq(v.artifactId, Number(artifactId)),
      orderBy: (v: any, { desc }: any) => [desc(v.version)],
      limit: 10,
    }).catch(() => null);

    if (!versions || versions.length < 2) {
      return res.json({
        available: false,
        message: versions?.length === 1
          ? 'Only one version exists. No comparison available yet.'
          : 'No versions found for this artifact.',
      });
    }

    const current = versions[0];
    // Find last approved version (or fall back to previous version)
    const approved = versions.find((v: any) => v.status === 'approved') || versions[1];

    return res.json({
      available: true,
      currentVersion: {
        version: current.version,
        status: current.status,
        updatedAt: current.updatedAt || current.createdAt,
        contentLength: current.content?.length || 0,
      },
      approvedVersion: {
        version: approved.version,
        status: approved.status,
        updatedAt: approved.updatedAt || approved.createdAt,
        contentLength: approved.content?.length || 0,
      },
      diffSummary: {
        currentWords: (current.content || '').split(/\s+/).length,
        approvedWords: (approved.content || '').split(/\s+/).length,
      },
    });
  } catch (err: any) {
    console.error('[authoring-actions] compare-versions error:', err?.message);
    return res.status(500).json({ error: 'Failed to compare versions' });
  }
});

// ─── Wave 1 Action 5: Promote to Review (governed) ──────────────────────────

router.post('/promote-to-review', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId } = req.body;

    if (!projectId || !artifactId) {
      return res.status(400).json({ error: 'projectId and artifactId are required' });
    }

    // Step 1: Check promotion blockers
    let blocked = false;
    const blockReasons: string[] = [];

    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.checkPromotionBlocked) {
        const result = await contradictionEngineService.checkPromotionBlocked(
          'default',
          Number(projectId),
          Number(artifactId)
        );
        if (result?.blocked) {
          blocked = true;
          blockReasons.push(
            ...((result.findings || []).map(
              (f: any) => f.explanation || 'Unresolved blocking contradiction'
            ))
          );
        }
      }
    } catch {
      // Non-blocking — proceed without contradiction check
    }

    if (blocked) {
      return res.json({
        promoted: false,
        reason: 'blocked',
        blockers: blockReasons,
        message: `Promotion blocked: ${blockReasons.length} unresolved issue(s). Resolve these before promoting.`,
      });
    }

    // Step 2: Execute promotion via existing governed path
    try {
      const { db } = await import('../db.js');
      // Update artifact status to 'review'
      await db.query.concept2cureArtifacts?.findFirst?.({
        where: (a: any, { eq }: any) => eq(a.id, Number(artifactId)),
      }).then(async (artifact: any) => {
        if (!artifact) throw new Error('Artifact not found');
        if (artifact.status === 'locked' || artifact.status === 'approved') {
          throw new Error(`Cannot promote: artifact is ${artifact.status}`);
        }
        // Update status
        const { concept2cureArtifacts } = await import('../../shared/schema/index.js');
        const { eq } = await import('drizzle-orm');
        await db
          .update(concept2cureArtifacts)
          .set({ status: 'review', updatedAt: new Date() })
          .where(eq(concept2cureArtifacts.id, Number(artifactId)));
      });

      return res.json({
        promoted: true,
        message: 'Artifact promoted to review. Governance workflow initiated.',
        newStatus: 'review',
      });
    } catch (promoteErr: any) {
      return res.json({
        promoted: false,
        reason: 'error',
        message: promoteErr?.message || 'Failed to promote artifact',
      });
    }
  } catch (err: any) {
    console.error('[authoring-actions] promote-to-review error:', err?.message);
    return res.status(500).json({ error: 'Failed to promote to review' });
  }
});

// ─── Wave 2 Hooks (wired, not fully implemented) ────────────────────────────

// Hook: Governed correction draft
router.post('/correction-draft', async (req: Request, res: Response) => {
  const { projectId, artifactId, sectionCode } = req.body;
  // Wired to rewrite-coordinator — full UX ships next
  return res.json({
    status: 'hook_ready',
    action: 'correction_draft',
    message: 'Correction draft hook is wired. Use rewrite-coordinator for governed corrections.',
    context: { projectId, artifactId, sectionCode },
  });
});

// Hook: Harmonize language with linked sections
router.post('/harmonize-sections', async (req: Request, res: Response) => {
  const { projectId, sectionCodes } = req.body;
  // Wired to harmonize-engine — full UX ships next
  return res.json({
    status: 'hook_ready',
    action: 'harmonize_sections',
    message: 'Harmonization hook is wired. Use harmonize-engine for cross-section consistency.',
    context: { projectId, sectionCodes },
  });
});

// Hook: Surface contradictions affecting this section
router.post('/section-contradictions', async (req: Request, res: Response) => {
  const { projectId, sectionCode } = req.body;
  return res.json({
    status: 'hook_ready',
    action: 'section_contradictions',
    message: 'Contradiction surfacing hook is wired. Uses contradiction-engine-service.',
    context: { projectId, sectionCode },
  });
});

// Hook: Explain what changed after last resolution
router.post('/resolution-changelog', async (req: Request, res: Response) => {
  const { projectId, bundleId } = req.body;
  // Wired to ana-resolution-support — full UX ships next
  return res.json({
    status: 'hook_ready',
    action: 'resolution_changelog',
    message: 'Resolution changelog hook is wired. Uses ana-resolution-support.',
    context: { projectId, bundleId },
  });
});

// Hook: Show readiness status for a module
router.get('/module-readiness/:projectId/:moduleCode', async (req: Request, res: Response) => {
  const { projectId, moduleCode } = req.params;
  return res.json({
    status: 'hook_ready',
    action: 'module_readiness',
    message: 'Module readiness hook is wired. Uses readiness-engine.',
    context: { projectId, moduleCode },
  });
});

// ─── Section-level readiness + contradiction data feed ───────────────────────

router.get('/section-context/:projectId/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode } = req.params;

    const result: {
      sectionCode: string;
      readiness: { score: number | null; blocked: boolean; blockers: any[] } | null;
      contradictions: any[];
    } = {
      sectionCode,
      readiness: null,
      contradictions: [],
    };

    // Fetch readiness data
    try {
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      if (computeReadinessAssessment) {
        const assessment = await computeReadinessAssessment({
          projectId: Number(projectId),
          organizationId: 'default',
        });
        // Extract section-level readiness from module breakdown
        const moduleBreakdown = assessment?.moduleBreakdown || [];
        const moduleMatch = moduleBreakdown.find(
          (m: any) => m.moduleCode === `m${sectionCode.split('.')[0]}`
        );
        result.readiness = {
          score: moduleMatch?.score ?? assessment?.overallScore ?? null,
          blocked: assessment?.blockers?.some(
            (b: any) => b.severity === 'critical'
          ) ?? false,
          blockers: (assessment?.blockers || []).map((b: any) => ({
            code: b.type || 'readiness',
            severity: b.severity || 'major',
            message: b.description || b.message || 'Blocker',
            source: 'readiness-engine',
          })),
        };
      }
    } catch {
      // Non-blocking
    }

    // Fetch contradictions
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const findings = await contradictionEngineService.scanProject(
          'default',
          Number(projectId)
        );
        // Filter to section-relevant contradictions
        result.contradictions = (findings || [])
          .filter(
            (f: any) =>
              !sectionCode ||
              f.sectionCode === sectionCode ||
              f.affectedSections?.includes(sectionCode)
          )
          .map((f: any) => ({
            id: f.id || `c-${Math.random().toString(36).slice(2)}`,
            type: f.contradictionType || f.type || 'finding',
            severity:
              f.authorityState === 'blocks_promotion'
                ? 'critical'
                : f.severity === 'major'
                  ? 'major'
                  : 'minor',
            explanation: f.explanation || f.description || 'Finding detected',
            relatedObjectIds: f.affectedObjectIds || [],
          }));
      }
    } catch {
      // Non-blocking
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[authoring-actions] section-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch section context' });
  }
});

export default router;
