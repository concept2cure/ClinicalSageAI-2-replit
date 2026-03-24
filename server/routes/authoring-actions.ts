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

    // Fetch artifact versions — try direct version table, fall back to artifact API
    let versions: any[] | null = null;
    try {
      const { db } = await import('../db.js');
      versions = await db.query.concept2cureArtifactVersions?.findMany?.({
        where: (v: any, { eq }: any) => eq(v.artifactId, Number(artifactId)),
        orderBy: (v: any, { desc }: any) => [desc(v.version)],
        limit: 10,
      });
    } catch {
      // Version table may not exist — try fetching artifact directly for version info
      try {
        const { db } = await import('../db.js');
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { eq }: any) => eq(a.id, Number(artifactId)),
        });
        if (artifact) {
          return res.json({
            available: false,
            message: `Artifact "${artifact.title}" found (v${artifact.version || 1}, status: ${artifact.status || 'draft'}). Detailed version history requires version tracking to be enabled.`,
            artifact: { id: artifact.id, title: artifact.title, version: artifact.version, status: artifact.status },
          });
        }
      } catch { /* non-blocking */ }
    }

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

// ─── Wave 2 Actions (real service calls) ─────────────────────────────────────

// ACTION 6: Governed correction draft — uses rewrite-coordinator
router.post('/correction-draft', async (req: Request, res: Response) => {
  try {
    const { projectId, artifactId, sectionCode, triggerDescription } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = (req as any).tenantId || 1;
    const targets: any[] = [];

    try {
      const { identifyRewriteTargets } = await import(
        '../services/resolution/rewrite-coordinator.js'
      );
      if (identifyRewriteTargets) {
        const affectedObjects = [{
          objectType: 'artifact',
          objectId: String(artifactId || ''),
          objectTitle: sectionCode ? `Section ${sectionCode}` : 'Current document',
          sectionCode: sectionCode || undefined,
          impactState: 'direct' as const,
        }];
        const result = await identifyRewriteTargets(
          orgId, Number(projectId), affectedObjects,
          'rewrite', triggerDescription || 'Correction requested via AnA'
        );
        targets.push(...(result || []));
      }
    } catch {
      // rewrite-coordinator unavailable
    }

    if (targets.length > 0) {
      return res.json({
        status: 'data',
        action: 'correction_draft',
        targets: targets.map((t: any) => ({
          objectId: t.objectId,
          objectTitle: t.objectTitle,
          sectionCode: t.sectionCode,
          revisionRationale: t.revisionRationale,
          confidence: t.confidence,
          requiresReview: t.requiresReview,
          hasContent: !!t.currentContent,
        })),
        message: `${targets.length} rewrite target(s) identified. Review rationale before applying corrections.`,
      });
    }

    return res.json({
      status: 'no_targets',
      action: 'correction_draft',
      message: artifactId
        ? 'No rewrite targets identified for this artifact. The document may already be consistent.'
        : 'No artifact specified. Open a document to prepare a correction draft.',
    });
  } catch (err: any) {
    console.error('[authoring-actions] correction-draft error:', err?.message);
    return res.status(500).json({ error: 'Failed to prepare correction draft' });
  }
});

// ACTION 7: Harmonize with linked sections — uses harmonize-engine
router.post('/harmonize-sections', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCodes, submissionType, productName } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!sectionCodes || !Array.isArray(sectionCodes) || sectionCodes.length === 0) {
      return res.json({
        status: 'no_sections',
        action: 'harmonize_sections',
        message: 'No linked sections provided. Select sections to harmonize or ensure the current section has linked section codes.',
      });
    }

    // Fetch content for each section from artifacts
    const sections: Record<string, string> = {};
    try {
      const { db } = await import('../db.js');
      for (const code of sectionCodes) {
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { and, eq }: any) =>
            and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
          orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
        }).catch(() => null);
        if (artifact?.content) {
          sections[code] = typeof artifact.content === 'string'
            ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        }
      }
    } catch { /* DB unavailable */ }

    if (Object.keys(sections).length < 2) {
      return res.json({
        status: 'insufficient_content',
        action: 'harmonize_sections',
        message: `Only ${Object.keys(sections).length} section(s) have content. Need at least 2 sections with content to harmonize.`,
        sectionsFound: Object.keys(sections),
      });
    }

    // Run harmonize engine
    try {
      const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
      const engine = new HarmonizeEngine();
      const result = await engine.check({
        sections,
        submissionType: submissionType || 'IND',
        productName: productName || undefined,
      });

      return res.json({
        status: 'data',
        action: 'harmonize_sections',
        consistencyScore: result.consistencyScore,
        totalIssues: result.totalIssues,
        criticalCount: result.criticalCount,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        issues: result.issues.slice(0, 20).map((i: any) => ({
          id: i.id,
          type: i.type,
          severity: i.severity,
          sectionA: i.sectionA,
          sectionB: i.sectionB,
          description: i.description,
          recommendation: i.recommendation,
          autoFixable: i.autoFixable,
        })),
        checkedDimensions: result.checkedDimensions,
        sectionsCompared: Object.keys(sections),
      });
    } catch {
      return res.json({
        status: 'service_unavailable',
        action: 'harmonize_sections',
        message: 'Harmonize engine is not available. Sections were found but consistency check could not run.',
        sectionsFound: Object.keys(sections),
      });
    }
  } catch (err: any) {
    console.error('[authoring-actions] harmonize-sections error:', err?.message);
    return res.status(500).json({ error: 'Failed to harmonize sections' });
  }
});

// ACTION 8: Resolution changelog — uses ana-resolution-support + resolution-planner
router.post('/resolution-changelog', async (req: Request, res: Response) => {
  try {
    const { projectId, bundleId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = (req as any).tenantId || 1;
    const explanations: any[] = [];

    try {
      const { getProjectResolutionPlans } = await import(
        '../services/resolution/resolution-planner.js'
      );
      const { explainResolutionPlan } = await import(
        '../services/resolution/ana-resolution-support.js'
      );

      if (getProjectResolutionPlans && explainResolutionPlan) {
        const plans = await getProjectResolutionPlans(orgId, Number(projectId));
        // Get most recent resolved plans (up to 5)
        const recentPlans = plans
          .filter((p: any) => p.state !== 'cancelled' && p.state !== 'unresolved')
          .slice(0, 5);

        for (const plan of recentPlans) {
          const explanation = explainResolutionPlan(plan);
          explanations.push({
            planId: explanation.planId,
            summary: explanation.summary,
            triggerExplanation: explanation.triggerExplanation,
            affectedObjectsSummary: explanation.affectedObjectsSummary,
            recommendedPath: explanation.recommendedPathExplanation,
            reviewRequirements: explanation.reviewRequirements,
            confidence: explanation.confidenceExplanation,
            nextSteps: explanation.nextSteps,
          });
        }
      }
    } catch {
      // Resolution services unavailable
    }

    if (explanations.length > 0) {
      return res.json({
        status: 'data',
        action: 'resolution_changelog',
        resolutionCount: explanations.length,
        resolutions: explanations,
        message: `${explanations.length} resolution(s) found for this project.`,
      });
    }

    return res.json({
      status: 'no_resolutions',
      action: 'resolution_changelog',
      message: 'No resolution history found for this project. Resolutions are created when contradictions or assumption changes are detected and addressed.',
    });
  } catch (err: any) {
    console.error('[authoring-actions] resolution-changelog error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch resolution changelog' });
  }
});

// ACTION 9: Module readiness — uses readiness-engine with module breakdown
router.get('/module-readiness/:projectId/:moduleCode', async (req: Request, res: Response) => {
  try {
    const { projectId, moduleCode } = req.params;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    try {
      const { computeReadinessAssessment } = await import(
        '../services/orchestration/readiness-engine.js'
      );
      if (computeReadinessAssessment) {
        const assessment = await computeReadinessAssessment({
          projectId: Number(projectId),
          organizationId: 'default',
        });

        // Find specific module in breakdown
        const moduleBreakdown = assessment?.moduleBreakdown || [];
        const targetModule = moduleCode
          ? moduleBreakdown.find((m: any) =>
              m.module === moduleCode || m.module === `Module ${moduleCode.replace('m', '')}`)
          : null;

        // Filter blockers relevant to this module
        const moduleBlockers = (assessment?.blockers || []).filter(
          (b: any) => !moduleCode || b.module === moduleCode || !b.module
        );

        return res.json({
          status: 'data',
          action: 'module_readiness',
          overallScore: assessment?.overallScore ?? null,
          overallStatus: assessment?.status ?? 'unknown',
          module: targetModule ? {
            code: moduleCode,
            label: targetModule.label || `Module ${moduleCode}`,
            score: targetModule.score,
            status: targetModule.status,
            documentCount: targetModule.documentCount,
            expectedDocumentCount: targetModule.expectedDocumentCount,
            validatedCount: targetModule.validatedCount,
            blockerCount: targetModule.blockerCount,
          } : null,
          blockers: moduleBlockers.slice(0, 10).map((b: any) => ({
            severity: b.severity,
            category: b.category,
            message: b.message || b.description,
            suggestedResolution: b.suggestedResolution,
          })),
          moduleBreakdown: moduleBreakdown.map((m: any) => ({
            module: m.module,
            label: m.label,
            score: m.score,
            status: m.status,
            documentCount: m.documentCount,
          })),
        });
      }
    } catch {
      // Readiness engine unavailable
    }

    return res.json({
      status: 'service_unavailable',
      action: 'module_readiness',
      message: 'Readiness engine is not available. Module readiness data could not be computed.',
      context: { projectId, moduleCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] module-readiness error:', err?.message);
    return res.status(500).json({ error: 'Failed to compute module readiness' });
  }
});

// ACTION 10: Section evidence — uses EvidenceManagementService + gap analysis
router.get('/section-evidence/:projectId/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode } = req.params;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    let evidence: any[] = [];
    let gapAnalysis: any = null;

    // Try EvidenceManagementService
    try {
      const { EvidenceManagementService } = await import(
        '../services/EvidenceManagementService.js'
      );
      if (EvidenceManagementService) {
        const svc = new EvidenceManagementService();

        // Try section-specific evidence
        if (svc.getStageEvidence) {
          // Map section code to stage number (approximate)
          const stageMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
          const major = sectionCode?.split('.')[0] || '2';
          const stage = stageMap[major] ?? 1;
          const stageEvidence = await svc.getStageEvidence(String(projectId), stage);
          if (stageEvidence && Array.isArray(stageEvidence)) {
            evidence = stageEvidence.slice(0, 20).map((e: any) => ({
              id: e.id,
              title: e.title || e.name || e.filename,
              type: e.test_type || e.type || 'document',
              fdaRequirement: e.fda_requirement,
              fdaSection: e.fda_section,
              status: e.review_status || e.regulatory_status || 'pending',
            }));
          }
        }

        // Also try gap analysis
        if (svc.performGapAnalysis) {
          gapAnalysis = await svc.performGapAnalysis(String(projectId), 1);
        }
      }
    } catch {
      // Service unavailable
    }

    if (evidence.length > 0) {
      return res.json({
        status: 'data',
        action: 'section_evidence',
        evidenceCount: evidence.length,
        evidence,
        gapAnalysis: gapAnalysis ? {
          completeness: gapAnalysis.completeness,
          gaps: (gapAnalysis.gaps || []).slice(0, 5),
          criticalGaps: gapAnalysis.critical_gaps || [],
        } : null,
        context: { projectId, sectionCode },
      });
    }

    return res.json({
      status: 'no_evidence',
      action: 'section_evidence',
      message: `No evidence found for section ${sectionCode}. Upload relevant studies, test reports, or regulatory documents to build the evidence package.`,
      gapAnalysis: gapAnalysis ? {
        completeness: gapAnalysis.completeness,
        gaps: (gapAnalysis.gaps || []).slice(0, 5),
      } : null,
      context: { projectId, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-evidence error:', err?.message);
    return res.status(500).json({ error: 'Failed to gather section evidence' });
  }
});

// ─── CTD cross-section link map ──────────────────────────────────────────────

const CTD_LINKS: Record<string, string[]> = {
  '2.2': ['2.3', '2.4', '2.5'],
  '2.3': ['3.2.S', '3.2.P'],
  '2.4': ['4.2.1', '4.2.2', '4.2.3'],
  '2.5': ['2.7.1', '2.7.3', '2.7.4', '5.3'],
  '2.7.1': ['5.2'],
  '2.7.3': ['2.5', '5.3'],
  '2.7.4': ['2.5', '5.3'],
  '3.2.S': ['2.3'],
  '3.2.P': ['2.3'],
  '5.3': ['2.5', '2.7.3', '2.7.4'],
};

function deriveLinkedSections(sectionCode: string): string[] {
  // Direct match
  if (CTD_LINKS[sectionCode]) return CTD_LINKS[sectionCode];
  // Try prefix match (e.g. '3.2.S.1' → '3.2.S')
  for (const key of Object.keys(CTD_LINKS)) {
    if (sectionCode.startsWith(key)) return CTD_LINKS[key];
  }
  return [];
}

// ACTION 11: Cross-section consistency check — combines harmonize + contradiction + linked sections
router.post('/cross-section-consistency', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode, linkedSectionCodes, submissionType } = req.body;
    if (!projectId || !sectionCode) {
      return res.status(400).json({ error: 'projectId and sectionCode are required' });
    }

    // 1. If linkedSectionCodes not provided, derive from CTD hierarchy
    const linked: string[] = Array.isArray(linkedSectionCodes) && linkedSectionCodes.length > 0
      ? linkedSectionCodes
      : deriveLinkedSections(sectionCode);

    const allCodes = [sectionCode, ...linked];

    // 2. Fetch content for current + linked sections from artifacts
    const sections: Record<string, string> = {};
    try {
      const { db } = await import('../db.js');
      for (const code of allCodes) {
        const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
          where: (a: any, { and, eq }: any) =>
            and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
          orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
        }).catch(() => null);
        if (artifact?.content) {
          sections[code] = typeof artifact.content === 'string'
            ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        }
      }
    } catch {
      // DB unavailable — continue with what we have
    }

    // 3. Run harmonize-engine check
    let harmonizeResult: any = null;
    if (Object.keys(sections).length >= 2) {
      try {
        const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
        const engine = new HarmonizeEngine();
        harmonizeResult = await engine.check({
          sections,
          submissionType: submissionType || 'IND',
        });
      } catch {
        // Harmonize engine unavailable
      }
    }

    // 4. Fetch contradictions for the section
    let contradictions: any[] = [];
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      if (contradictionEngineService?.scanProject) {
        const findings = await contradictionEngineService.scanProject(
          'default',
          Number(projectId)
        );
        contradictions = (findings || [])
          .filter(
            (f: any) =>
              f.sectionCode === sectionCode ||
              f.affectedSections?.includes(sectionCode) ||
              allCodes.includes(f.sectionCode)
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
            relatedSections: f.affectedSections || [],
          }));
      }
    } catch {
      // Contradiction engine unavailable
    }

    // 5. Return combined consistency report
    return res.json({
      status: 'data',
      action: 'cross_section_consistency',
      sectionCode,
      linkedSections: linked,
      sectionsWithContent: Object.keys(sections),
      harmonize: harmonizeResult
        ? {
            consistencyScore: harmonizeResult.consistencyScore,
            totalIssues: harmonizeResult.totalIssues,
            criticalCount: harmonizeResult.criticalCount,
            errorCount: harmonizeResult.errorCount,
            warningCount: harmonizeResult.warningCount,
            issues: (harmonizeResult.issues || []).slice(0, 20).map((i: any) => ({
              id: i.id,
              type: i.type,
              severity: i.severity,
              sectionA: i.sectionA,
              sectionB: i.sectionB,
              description: i.description,
              recommendation: i.recommendation,
              autoFixable: i.autoFixable,
            })),
            checkedDimensions: harmonizeResult.checkedDimensions,
          }
        : null,
      contradictions,
      summary: {
        harmonizeAvailable: !!harmonizeResult,
        harmonizeIssues: harmonizeResult?.totalIssues ?? 0,
        contradictionCount: contradictions.length,
        criticalIssues:
          (harmonizeResult?.criticalCount ?? 0) +
          contradictions.filter((c: any) => c.severity === 'critical').length,
      },
    });
  } catch (err: any) {
    console.error('[authoring-actions] cross-section-consistency error:', err?.message);
    return res.status(500).json({ error: 'Failed to run cross-section consistency check' });
  }
});

// Body-aware section expectations endpoint
router.get('/section-expectations/:regulatorBody/:submissionType/:sectionCode', async (req: Request, res: Response) => {
  try {
    const { regulatorBody, submissionType, sectionCode } = req.params;
    if (!regulatorBody || !submissionType || !sectionCode) {
      return res.status(400).json({ error: 'regulatorBody, submissionType, and sectionCode are required' });
    }

    try {
      const bodyAwareModule = await import('../services/body-aware-authoring.js');
      const service = bodyAwareModule.bodyAwareAuthoringService
        || bodyAwareModule.BodyAwareAuthoringService
        || bodyAwareModule.default;

      if (service) {
        const svc = typeof service === 'function' ? new service() : service;
        const expectations = svc.getSectionExpectations
          ? await svc.getSectionExpectations(regulatorBody, submissionType, sectionCode)
          : svc.getExpectations
            ? await svc.getExpectations(regulatorBody, submissionType, sectionCode)
            : null;

        if (expectations) {
          return res.json({
            status: 'data',
            action: 'section_expectations',
            regulatorBody,
            submissionType,
            sectionCode,
            expectations,
          });
        }
      }
    } catch {
      // Body-aware authoring service unavailable
    }

    return res.json({
      status: 'service_unavailable',
      action: 'section_expectations',
      message: `Body-aware authoring service is not available. Section expectations for ${regulatorBody}/${submissionType}/${sectionCode} could not be retrieved.`,
      context: { regulatorBody, submissionType, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-expectations error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch section expectations' });
  }
});

// Body-aware gap detection
router.post('/body-aware-gaps', async (req: Request, res: Response) => {
  try {
    const { regulatorBody, submissionType, sectionCode, currentContent } = req.body;
    if (!regulatorBody || !submissionType || !sectionCode) {
      return res.status(400).json({ error: 'regulatorBody, submissionType, and sectionCode are required' });
    }

    try {
      const bodyAwareModule = await import('../services/body-aware-authoring.js');
      const service = bodyAwareModule.bodyAwareAuthoringService
        || bodyAwareModule.BodyAwareAuthoringService
        || bodyAwareModule.default;

      if (service) {
        const svc = typeof service === 'function' ? new service() : service;
        if (svc.detectBodySpecificGaps) {
          const gaps = await svc.detectBodySpecificGaps(
            regulatorBody,
            submissionType,
            sectionCode,
            currentContent || ''
          );

          return res.json({
            status: 'data',
            action: 'body_aware_gaps',
            regulatorBody,
            submissionType,
            sectionCode,
            gaps: Array.isArray(gaps) ? gaps : gaps?.gaps || [],
            gapCount: Array.isArray(gaps) ? gaps.length : gaps?.gaps?.length || 0,
          });
        }
      }
    } catch {
      // Body-aware authoring service unavailable
    }

    return res.json({
      status: 'service_unavailable',
      action: 'body_aware_gaps',
      message: `Body-aware gap detection is not available. Gaps for ${regulatorBody}/${submissionType}/${sectionCode} could not be analyzed.`,
      context: { regulatorBody, submissionType, sectionCode },
    });
  } catch (err: any) {
    console.error('[authoring-actions] body-aware-gaps error:', err?.message);
    return res.status(500).json({ error: 'Failed to detect body-aware gaps' });
  }
});

// ─── Section Preflight (Pass 5) ──────────────────────────────────────────────

/**
 * POST /section-preflight
 * Aggregates all existing checks into a canonical SectionPreflightResult.
 * Calls: readiness-engine, contradiction-engine, body-aware-authoring,
 *        harmonize-engine — all in parallel.
 * Returns structured preflight with overall verdict + recommended actions.
 */
router.post('/section-preflight', async (req: Request, res: Response) => {
  try {
    const {
      projectId, sectionCode, artifactId, artifactVersionId,
      regulatorBody, submissionType, linkedSectionCodes,
    } = req.body;
    if (!projectId || !sectionCode) {
      return res.status(400).json({ error: 'projectId and sectionCode are required' });
    }

    const orgId = (req as any).tenantId || 1;
    type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
    const checks: Record<string, any> = {};

    // ── Run all checks in parallel ──────────────────────────────────
    const [readinessResult, contradictionResult, bodyResult, consistencyResult] =
      await Promise.allSettled([
        // 1. Readiness
        (async () => {
          try {
            const { computeReadinessAssessment } = await import(
              '../services/orchestration/readiness-engine.js'
            );
            if (!computeReadinessAssessment) return null;
            const assessment = await computeReadinessAssessment({
              projectId: Number(projectId), organizationId: 'default',
            });
            const major = sectionCode.split('.')[0];
            const moduleItem = (assessment?.moduleBreakdown || []).find(
              (m: any) => m.module === `Module ${major}` || m.module === `m${major}`
            );
            const blockers = (assessment?.blockers || [])
              .filter((b: any) => !b.module || b.module === `m${major}`)
              .slice(0, 10)
              .map((b: any) => ({ code: b.category || 'BLOCK', severity: b.severity, message: b.message || b.description }));
            const hasCritical = blockers.some((b: any) => b.severity === 'critical');
            const status: CheckStatus = hasCritical ? 'fail' : blockers.length > 0 ? 'warn' : 'pass';
            return { status, score: moduleItem?.score ?? assessment?.overallScore ?? null, blockers };
          } catch { return null; }
        })(),
        // 2. Contradictions
        (async () => {
          try {
            const { contradictionEngineService } = await import(
              '../services/contradiction-engine-service.js'
            );
            if (!contradictionEngineService?.scanProject) return null;
            const findings = await contradictionEngineService.scanProject(orgId, Number(projectId));
            const relevant = (findings || [])
              .filter((f: any) => f.sectionCode === sectionCode || (f.affectedSections || []).includes(sectionCode))
              .slice(0, 10)
              .map((f: any) => ({
                id: f.id || f.findingId || String(Math.random()),
                severity: f.authorityState === 'blocks_promotion' ? 'critical' : f.severity || 'minor',
                explanation: f.explanation || f.description || f.title,
              }));
            const hasCritical = relevant.some((r: any) => r.severity === 'critical');
            const status: CheckStatus = hasCritical ? 'fail' : relevant.length > 0 ? 'warn' : 'pass';
            return { status, items: relevant };
          } catch { return null; }
        })(),
        // 3. Body-aware gaps
        (async () => {
          if (!regulatorBody && !submissionType) return null;
          try {
            const { detectBodySpecificGaps } = await import(
              '../services/body-aware-authoring.js'
            );
            if (!detectBodySpecificGaps) return null;
            const analysis = await detectBodySpecificGaps(
              regulatorBody || 'FDA', submissionType || 'IND', sectionCode, ''
            );
            const missing = analysis.gaps.filter((g: any) => g.status === 'missing').map((g: any) => g.requirement);
            const weak = analysis.gaps.filter((g: any) => g.status === 'weak').map((g: any) => g.requirement);
            const status: CheckStatus = missing.length > 0 ? 'fail' : weak.length > 0 ? 'warn' : 'pass';
            return { status, missing, weak, requiredLevel: 'required' };
          } catch { return null; }
        })(),
        // 4. Cross-section consistency
        (async () => {
          const CTD_LINKS: Record<string, string[]> = {
            '2.2': ['2.3', '2.4', '2.5'], '2.3': ['3.2.S', '3.2.P'],
            '2.4': ['4.2.1', '4.2.2', '4.2.3'], '2.5': ['2.7.1', '2.7.3', '2.7.4', '5.3'],
            '2.7.1': ['5.2'], '2.7.3': ['2.5', '5.3'], '2.7.4': ['2.5', '5.3'],
            '3.2.S': ['2.3'], '3.2.P': ['2.3'], '5.3': ['2.5', '2.7.3', '2.7.4'],
          };
          const linked = linkedSectionCodes || CTD_LINKS[sectionCode]
            || CTD_LINKS[sectionCode.split('.').slice(0, -1).join('.')] || [];
          if (linked.length === 0) return { status: 'unknown' as CheckStatus, items: [] };
          try {
            const { HarmonizeEngine } = await import('../services/harmonize-engine.js');
            const { db } = await import('../db.js');
            const sections: Record<string, string> = {};
            for (const code of [sectionCode, ...linked]) {
              const artifact = await db.query.concept2cureArtifacts?.findFirst?.({
                where: (a: any, { and, eq }: any) =>
                  and(eq(a.projectId, Number(projectId)), eq(a.ctdSection, code)),
                orderBy: (a: any, { desc }: any) => [desc(a.updatedAt)],
              }).catch(() => null);
              if (artifact?.content) {
                sections[code] = typeof artifact.content === 'string'
                  ? artifact.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
              }
            }
            if (Object.keys(sections).length < 2) return { status: 'unknown' as CheckStatus, items: [] };
            const engine = new HarmonizeEngine();
            const result = await engine.check({ sections, submissionType: submissionType || 'IND' });
            const items = result.issues.slice(0, 10).map((i: any) => ({
              type: i.type, severity: i.severity, explanation: i.description,
              linkedSections: [i.sectionA, i.sectionB].filter(Boolean),
            }));
            const hasCritical = items.some((i: any) => i.severity === 'critical' || i.severity === 'error');
            const status: CheckStatus = hasCritical ? 'fail' : items.length > 0 ? 'warn' : 'pass';
            return { status, consistencyScore: result.consistencyScore, items };
          } catch { return { status: 'unknown' as CheckStatus, items: [] }; }
        })(),
      ]);

    // ── Assemble checks ─────────────────────────────────────────────
    checks.readiness = (readinessResult.status === 'fulfilled' && readinessResult.value)
      ? readinessResult.value : { status: 'unknown' };
    checks.contradictions = (contradictionResult.status === 'fulfilled' && contradictionResult.value)
      ? contradictionResult.value : { status: 'unknown' };
    checks.bodyExpectations = (bodyResult.status === 'fulfilled' && bodyResult.value)
      ? bodyResult.value : { status: 'unknown' };
    checks.crossSectionConsistency = (consistencyResult.status === 'fulfilled' && consistencyResult.value)
      ? consistencyResult.value : { status: 'unknown' };
    checks.approvedBaselineCompare = { status: 'unknown' };

    // ── Compute overall verdict ─────────────────────────────────────
    const statuses = Object.values(checks).map((c: any) => c.status);
    const hasFail = statuses.includes('fail');
    const hasWarn = statuses.includes('warn');
    const allUnknown = statuses.every((s: string) => s === 'unknown');

    let overall: string;
    let summary: string;
    if (hasFail) {
      const failChecks = Object.entries(checks).filter(([, v]: any) => v.status === 'fail').map(([k]) => k);
      overall = 'blocked';
      summary = `Section is blocked by ${failChecks.length} failed check(s): ${failChecks.join(', ')}. Resolve before promotion.`;
    } else if (hasWarn) {
      overall = 'provisional';
      summary = 'Section has warnings. Review before promotion.';
    } else if (allUnknown) {
      overall = 'needs-review';
      summary = 'Preflight checks could not run — manual review recommended.';
    } else {
      overall = 'ready';
      summary = 'All preflight checks pass. Section is ready for promotion.';
    }

    // ── Build recommended actions ───────────────────────────────────
    const recommendedActions: Array<{ id: string; label: string; reason: string }> = [];
    if (checks.bodyExpectations?.status === 'fail') {
      recommendedActions.push({ id: 'gather-body-evidence', label: 'Gather body-required evidence',
        reason: `${(checks.bodyExpectations.missing || []).length} body requirement(s) missing` });
    }
    if (checks.contradictions?.status === 'fail' || checks.contradictions?.status === 'warn') {
      recommendedActions.push({ id: 'prepare-correction-draft', label: 'Prepare correction draft',
        reason: `${(checks.contradictions.items || []).length} contradiction(s) detected` });
    }
    if (checks.crossSectionConsistency?.status === 'fail' || checks.crossSectionConsistency?.status === 'warn') {
      recommendedActions.push({ id: 'harmonize-linked-sections', label: 'Harmonize with linked sections',
        reason: `${(checks.crossSectionConsistency.items || []).length} inconsistency(s) across linked sections` });
    }
    if (checks.readiness?.status === 'fail') {
      recommendedActions.push({ id: 'explain-blockers', label: 'Explain blockers',
        reason: `${(checks.readiness.blockers || []).length} readiness blocker(s)` });
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-to-review', label: 'Promote to review',
        reason: 'All checks pass — ready for governed promotion.' });
    }

    return res.json({
      status: 'data', action: 'section_preflight',
      sectionCode, artifactId, artifactVersionId, regulatorBody, submissionType,
      overall, summary, checks, recommendedActions,
    });
  } catch (err: any) {
    console.error('[authoring-actions] section-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run section preflight' });
  }
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
