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

    const orgId = (req as any).tenantId || (req as any).organizationId || 1;

    // Step 1: Governance boundary evaluation (includes contradiction + readiness gates)
    let blocked = false;
    const blockReasons: string[] = [];
    let boundaryTransition: any = null;

    try {
      const { GovernanceBoundaryService } = await import(
        '../services/governance-boundary-service.js'
      );
      const boundaryService = GovernanceBoundaryService.getInstance();
      const transitionResult = await boundaryService.evaluateTransition({
        organizationId: Number(orgId),
        projectId: Number(projectId),
        artifactId: Number(artifactId),
        fromBoundary: 'advisory',
        toBoundary: 'governed_draft',
        actorId: (req as any).userId ? Number((req as any).userId) : undefined,
        actorRole: (req as any).userRole || undefined,
      });

      boundaryTransition = transitionResult.transition;

      if (!transitionResult.allowed) {
        blocked = true;
        blockReasons.push(...transitionResult.blockedReasons);
      }
    } catch {
      // Governance boundary service unavailable — fall back to direct contradiction check
      try {
        const { contradictionEngineService } = await import(
          '../services/contradiction-engine-service.js'
        );
        if (contradictionEngineService?.checkPromotionBlocked) {
          const result = await contradictionEngineService.checkPromotionBlocked(
            orgId,
            Number(projectId),
            Number(artifactId)
          );
          if (result?.blocked) {
            blocked = true;
            blockReasons.push(
              ...((result.blockingFindings || result.findings || []).map(
                (f: any) => f.title || f.explanation || 'Unresolved blocking contradiction'
              ))
            );
          }
        }
      } catch {
        // Non-blocking — proceed without contradiction check
      }
    }

    // ── Record blocked promotion as a formal decision ──────────────
    if (blocked) {
      let blockedDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        blockedDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          kind: 'promotion-decision',
          governedAction: 'promote-to-review',
          artifactId: String(artifactId),
          summary: `Promotion blocked: ${blockReasons.length} unresolved issue(s)`,
          rationale: blockReasons.join('; '),
          sourceSignals: blockReasons.map(r => ({
            kind: 'contradiction' as const, summary: r, severity: 'critical' as const,
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
        // Receipt for the blocked promotion
        if (blockedDecision) {
          decisionLifecycleService.createReceipt({
            decisionId: blockedDecision.id,
            projectId: String(projectId),
            recommendation: {
              summary: 'Promote artifact to review',
              actionIds: ['promote-to-review'],
              rationale: 'Promotion requested but blocked by unresolved issues',
            },
            confirmation: { accepted: false, rejectionReason: 'Blocked by contradictions' },
            execution: { executed: false, error: 'Blocked by unresolved contradictions' },
            affectedObjects: [{ objectType: 'artifact', objectId: String(artifactId), previousState: 'draft', newState: 'draft', changeDescription: 'Promotion blocked' }],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        promoted: false,
        reason: 'blocked',
        blockers: blockReasons,
        message: `Promotion blocked: ${blockReasons.length} unresolved issue(s). Resolve these before promoting.`,
        decisionId: blockedDecision?.id || null,
        authority: blockedDecision?.authority || null,
      });
    }

    // Step 2: Authority check
    let authorityCheck: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      authorityCheck = decisionLifecycleService.checkAuthority(
        'promote-to-review',
        (req as any).userRole || undefined
      );
    } catch { /* non-blocking */ }

    // Step 3: Execute promotion via existing governed path
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

      // ── Record successful promotion decision + receipt ──────────
      let promotionDecision: any = null;
      let promotionReceipt: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        promotionDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          kind: 'promotion-decision',
          governedAction: 'promote-to-review',
          artifactId: String(artifactId),
          summary: 'Artifact promoted to review',
          rationale: 'No blocking contradictions. Preflight passed or skipped.',
          sourceSignals: [{ kind: 'user-request' as const, summary: 'User confirmed promotion' }],
          createdByType: 'human',
          createdById: (req as any).userId || undefined,
        });
        // Transition to confirmed → executed
        if (promotionDecision) {
          decisionLifecycleService.transitionDecision(promotionDecision.id, 'confirmed', {
            actorId: (req as any).userId,
          });
          decisionLifecycleService.transitionDecision(promotionDecision.id, 'executed', {
            actorId: (req as any).userId,
          });
          promotionReceipt = decisionLifecycleService.createReceipt({
            decisionId: promotionDecision.id,
            projectId: String(projectId),
            recommendation: {
              summary: 'Promote artifact to review',
              actionIds: ['promote-to-review'],
              rationale: 'Artifact passed preflight or user overrode warnings',
            },
            confirmation: {
              accepted: true,
              confirmedById: (req as any).userId || undefined,
            },
            execution: {
              executed: true,
              executedById: (req as any).userId || undefined,
              executionMethod: 'status-transition:draft→review',
            },
            affectedObjects: [{
              objectType: 'artifact',
              objectId: String(artifactId),
              previousState: 'draft',
              newState: 'review',
              changeDescription: 'Artifact status changed from draft to review',
            }],
            pendingApprovals: authorityCheck?.authority?.requiresReviewerApproval
              ? [{ requiredRole: 'reviewer', reason: 'Artifact needs reviewer sign-off', status: 'pending' as const }]
              : [],
          });
        }
      } catch { /* non-blocking */ }

      return res.json({
        promoted: true,
        message: 'Artifact promoted to review. Governance workflow initiated.',
        newStatus: 'review',
        decisionId: promotionDecision?.id || null,
        receiptId: promotionReceipt?.id || null,
        authority: promotionDecision?.authority || null,
        pendingApprovals: promotionReceipt?.pendingApprovals || [],
        boundaryTransitionId: boundaryTransition?.id || null,
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
      // ── Record correction decision (non-blocking) ───────────────
      let correctionDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        correctionDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          kind: 'correction-decision',
          governedAction: 'prepare-correction-draft',
          artifactId: artifactId ? String(artifactId) : undefined,
          sectionCode,
          summary: `${targets.length} correction target(s) identified`,
          rationale: triggerDescription || 'Correction requested via AnA',
          sourceSignals: targets.map((t: any) => ({
            kind: 'user-request' as const,
            summary: t.revisionRationale || 'Correction target identified',
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
      } catch { /* non-blocking */ }

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
        decisionId: correctionDecision?.id || null,
        authority: correctionDecision?.authority || null,
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

      // ── Record harmonization decision (non-blocking) ─────────────
      let harmonizeDecision: any = null;
      try {
        const { decisionLifecycleService } = await import(
          '../services/decision-lifecycle-service.js'
        );
        harmonizeDecision = decisionLifecycleService.recordGovernedActionDecision({
          projectId: String(projectId),
          kind: 'harmonization-decision',
          governedAction: 'prepare-harmonization-suggestion',
          summary: `Harmonization: ${result.totalIssues} issue(s), score ${result.consistencyScore}%`,
          rationale: `Checked ${Object.keys(sections).length} sections: ${Object.keys(sections).join(', ')}`,
          sourceSignals: result.issues.slice(0, 5).map((i: any) => ({
            kind: 'cross-section-inconsistency' as const,
            summary: i.description || 'Inconsistency detected',
            severity: i.severity === 'critical' ? 'critical' as const : i.severity === 'error' ? 'major' as const : 'minor' as const,
          })),
          createdByType: 'ana',
          createdById: (req as any).userId || undefined,
        });
      } catch { /* non-blocking */ }

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
        decisionId: harmonizeDecision?.id || null,
        authority: harmonizeDecision?.authority || null,
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

// ─── Module + Dossier Preflight (Pass 6) ─────────────────────────────────────

/**
 * Helper: fetch all artifacts for a project, grouped by CTD module.
 * Returns Map<moduleCode, Array<{ctdSection, id, status}>>
 */
async function fetchProjectArtifactsByModule(projectId: number): Promise<Map<string, Array<{ ctdSection: string; id: string; status: string }>>> {
  const result = new Map<string, Array<{ ctdSection: string; id: string; status: string }>>();
  try {
    const { db } = await import('../db.js');
    const artifacts = await db.query.concept2cureArtifacts?.findMany?.({
      where: (a: any, { eq }: any) => eq(a.projectId, projectId),
    }).catch(() => []) || [];
    for (const art of artifacts) {
      if (!art.ctdSection) continue;
      const major = art.ctdSection.split('.')[0];
      const moduleCode = `m${major}`;
      if (!result.has(moduleCode)) result.set(moduleCode, []);
      result.get(moduleCode)!.push({
        ctdSection: art.ctdSection,
        id: String(art.id),
        status: art.status || 'draft',
      });
    }
  } catch { /* DB unavailable */ }
  return result;
}

/**
 * POST /module-preflight
 * Aggregates section preflights for all sections in a module.
 */
router.post('/module-preflight', async (req: Request, res: Response) => {
  try {
    const { projectId, moduleCode, regulatorBody, submissionType } = req.body;
    if (!projectId || !moduleCode) {
      return res.status(400).json({ error: 'projectId and moduleCode are required' });
    }

    // Find all sections in this module
    const artifactMap = await fetchProjectArtifactsByModule(Number(projectId));
    const moduleSections = artifactMap.get(moduleCode) || [];

    if (moduleSections.length === 0) {
      return res.json({
        status: 'data', action: 'module_preflight', moduleCode,
        regulatorBody, submissionType,
        overall: 'needs-review',
        summary: `No sections found for ${moduleCode}. Add documents to this module first.`,
        sectionResults: [], counts: { total: 0, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 },
        majorBlockers: [{ moduleCode, kind: 'missing-section', severity: 'major', message: `No sections found in ${moduleCode}` }],
        recommendedActions: [],
      });
    }

    // Run section preflights in parallel (reuse the internal logic)
    const CTD_LINKS: Record<string, string[]> = {
      '2.2': ['2.3', '2.4', '2.5'], '2.3': ['3.2.S', '3.2.P'],
      '2.4': ['4.2.1', '4.2.2', '4.2.3'], '2.5': ['2.7.1', '2.7.3', '2.7.4', '5.3'],
      '2.7.1': ['5.2'], '2.7.3': ['2.5', '5.3'], '2.7.4': ['2.5', '5.3'],
      '3.2.S': ['2.3'], '3.2.P': ['2.3'], '5.3': ['2.5', '2.7.3', '2.7.4'],
    };

    const sectionResults: any[] = [];
    const sectionPreflightPromises = moduleSections.map(async (sec) => {
      try {
        // Internal fetch to our own section-preflight endpoint
        const linked = CTD_LINKS[sec.ctdSection] || CTD_LINKS[sec.ctdSection.split('.').slice(0, -1).join('.')] || [];
        const mockReq = {
          body: {
            projectId, sectionCode: sec.ctdSection,
            artifactId: sec.id, regulatorBody, submissionType,
            linkedSectionCodes: linked,
          },
          tenantId: (req as any).tenantId || 1,
        };
        // Inline the section preflight logic instead of HTTP call
        // Use simplified check aggregation
        const orgId = (req as any).tenantId || 1;
        type CS = 'pass' | 'warn' | 'fail' | 'unknown';
        const checks: Record<string, any> = {};

        // Readiness
        try {
          const { computeReadinessAssessment } = await import('../services/orchestration/readiness-engine.js');
          if (computeReadinessAssessment) {
            const assessment = await computeReadinessAssessment({ projectId: Number(projectId), organizationId: 'default' });
            const major = sec.ctdSection.split('.')[0];
            const blockers = (assessment?.blockers || [])
              .filter((b: any) => !b.module || b.module === `m${major}`)
              .slice(0, 5).map((b: any) => ({ code: b.category || 'BLOCK', severity: b.severity, message: b.message || b.description }));
            checks.readiness = { status: blockers.some((b: any) => b.severity === 'critical') ? 'fail' : blockers.length ? 'warn' : 'pass', blockers };
          }
        } catch { checks.readiness = { status: 'unknown' }; }

        // Contradictions
        try {
          const { contradictionEngineService } = await import('../services/contradiction-engine-service.js');
          if (contradictionEngineService?.scanProject) {
            const findings = await contradictionEngineService.scanProject(orgId, Number(projectId));
            const items = (findings || [])
              .filter((f: any) => f.sectionCode === sec.ctdSection || (f.affectedSections || []).includes(sec.ctdSection))
              .slice(0, 5).map((f: any) => ({
                id: f.id || String(Math.random()), severity: f.authorityState === 'blocks_promotion' ? 'critical' : f.severity || 'minor',
                explanation: f.explanation || f.description || f.title,
              }));
            checks.contradictions = { status: items.some((i: any) => i.severity === 'critical') ? 'fail' : items.length ? 'warn' : 'pass', items };
          }
        } catch { checks.contradictions = { status: 'unknown' }; }

        // Body gaps (lightweight)
        if (regulatorBody || submissionType) {
          try {
            const { detectBodySpecificGaps } = await import('../services/body-aware-authoring.js');
            if (detectBodySpecificGaps) {
              const analysis = await detectBodySpecificGaps(regulatorBody || 'FDA', submissionType || 'IND', sec.ctdSection, '');
              const missing = analysis.gaps.filter((g: any) => g.status === 'missing').map((g: any) => g.requirement);
              checks.bodyExpectations = { status: missing.length ? 'fail' : 'pass', missing };
            }
          } catch { checks.bodyExpectations = { status: 'unknown' }; }
        } else { checks.bodyExpectations = { status: 'unknown' }; }

        checks.crossSectionConsistency = { status: 'unknown' };
        checks.approvedBaselineCompare = { status: 'unknown' };

        const statuses = Object.values(checks).map((c: any) => c.status);
        const hasFail = statuses.includes('fail');
        const hasWarn = statuses.includes('warn');
        const allUnknown = statuses.every((s: string) => s === 'unknown');

        let overall: string;
        if (hasFail) overall = 'blocked';
        else if (hasWarn) overall = 'provisional';
        else if (allUnknown) overall = 'needs-review';
        else overall = 'ready';

        return {
          sectionCode: sec.ctdSection, artifactId: sec.id, overall,
          summary: overall === 'blocked' ? 'Blocked' : overall === 'provisional' ? 'Warnings' : overall === 'ready' ? 'Ready' : 'Needs review',
          checks, recommendedActions: [],
        };
      } catch {
        return { sectionCode: sec.ctdSection, artifactId: sec.id, overall: 'needs-review', summary: 'Check unavailable', checks: {}, recommendedActions: [] };
      }
    });

    const results = await Promise.allSettled(sectionPreflightPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') sectionResults.push(r.value);
    }

    // Aggregate
    const counts = { total: sectionResults.length, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 };
    for (const sr of sectionResults) {
      if (sr.overall === 'ready') counts.ready++;
      else if (sr.overall === 'blocked') counts.blocked++;
      else if (sr.overall === 'provisional') counts.provisional++;
      else if (sr.overall === 'needs-reapproval') counts.needsReapproval++;
      else counts.needsReview++;
    }

    const majorBlockers: any[] = [];
    for (const sr of sectionResults) {
      if (sr.overall !== 'blocked') continue;
      for (const [checkName, check] of Object.entries(sr.checks || {})) {
        const c = check as any;
        if (c.status !== 'fail') continue;
        const kindMap: Record<string, string> = {
          bodyExpectations: 'body-gap', contradictions: 'contradiction',
          crossSectionConsistency: 'cross-section-inconsistency',
          readiness: 'readiness-blocker', approvedBaselineCompare: 'approved-baseline-conflict',
        };
        majorBlockers.push({
          sectionCode: sr.sectionCode, kind: kindMap[checkName] || 'readiness-blocker',
          severity: 'critical', message: `${checkName} failed in §${sr.sectionCode}`,
        });
      }
    }

    let overall: string;
    let summary: string;
    if (counts.blocked > 0) {
      overall = 'blocked';
      summary = `Module ${moduleCode} is blocked — ${counts.blocked} of ${counts.total} section(s) blocked.`;
    } else if (counts.provisional > 0) {
      overall = 'provisional';
      summary = `Module ${moduleCode} is provisional — ${counts.provisional} section(s) have warnings.`;
    } else if (counts.ready === counts.total && counts.total > 0) {
      overall = 'ready';
      summary = `Module ${moduleCode} is ready — all ${counts.total} section(s) pass preflight.`;
    } else {
      overall = 'needs-review';
      summary = `Module ${moduleCode} needs review — ${counts.needsReview} section(s) could not be checked.`;
    }

    const recommendedActions: any[] = [];
    if (counts.blocked > 0) {
      const worst = sectionResults.find((s: any) => s.overall === 'blocked');
      if (worst) {
        recommendedActions.push({ id: 'open-blocked-section', label: `Open blocked §${worst.sectionCode}`,
          reason: `Section ${worst.sectionCode} is blocked`, targetSectionCode: worst.sectionCode });
        recommendedActions.push({ id: 'run-section-preflight', label: `Run preflight on §${worst.sectionCode}`,
          reason: 'Get detailed check results', targetSectionCode: worst.sectionCode });
      }
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-module-when-clean', label: `All sections ready in ${moduleCode}`,
        reason: 'All preflight checks pass.' });
    }

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      for (const blocker of majorBlockers) {
        signals.push({ kind: blocker.kind || 'readiness-blocker', summary: blocker.message, severity: blocker.severity });
      }
      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        kind: 'module-preflight-judgment',
        moduleCode, regulatorBody, submissionType,
        workflowStage: 'dossier',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch { /* non-blocking */ }

    // ── Decision-aware gating enrichment ─────────────────────────
    let decisionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        String(projectId), { moduleCode }
      );
    } catch { /* non-blocking */ }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        (req as any).tenantId || 1, Number(projectId),
        { moduleCode, regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data', action: 'module_preflight', moduleCode,
      regulatorBody, submissionType, overall, summary,
      sectionResults, counts, majorBlockers, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      decisionAwareStatus: decisionAwareStatus || null,
      contradictionContext: contradictionContext || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] module-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run module preflight' });
  }
});

/**
 * POST /dossier-preflight
 * Aggregates module preflights across all modules in a project/dossier.
 */
router.post('/dossier-preflight', async (req: Request, res: Response) => {
  try {
    const { projectId, regulatorBody, submissionType } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const artifactMap = await fetchProjectArtifactsByModule(Number(projectId));
    const moduleCodes = Array.from(artifactMap.keys()).sort();

    if (moduleCodes.length === 0) {
      return res.json({
        status: 'data', action: 'dossier_preflight',
        regulatorBody, submissionType,
        overall: 'needs-review',
        summary: 'No modules found in this project. Add documents first.',
        moduleResults: [],
        counts: { totalModules: 0, readyModules: 0, blockedModules: 0, provisionalModules: 0, needsReviewModules: 0, needsReapprovalModules: 0 },
        majorBlockers: [{ kind: 'missing-section', severity: 'major', message: 'No modules or sections found' }],
        recommendedActions: [],
      });
    }

    // Run module preflights by making internal calls
    const moduleResults: any[] = [];
    for (const mc of moduleCodes) {
      try {
        // Reuse internal logic — aggregate sections for this module
        const sections = artifactMap.get(mc) || [];
        const counts = { total: sections.length, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 };

        // Simplified per-section check: use artifact status as proxy + readiness
        for (const sec of sections) {
          if (sec.status === 'locked' || sec.status === 'approved') counts.ready++;
          else if (sec.status === 'review') counts.provisional++;
          else counts.needsReview++; // draft = needs-review
        }

        let modOverall: string;
        if (counts.blocked > 0) modOverall = 'blocked';
        else if (counts.provisional > 0) modOverall = 'provisional';
        else if (counts.ready === counts.total && counts.total > 0) modOverall = 'ready';
        else modOverall = 'needs-review';

        moduleResults.push({
          moduleCode: mc, overall: modOverall,
          summary: `${mc}: ${counts.ready}/${counts.total} ready`,
          sectionResults: sections.map(s => ({ sectionCode: s.ctdSection, artifactId: s.id, overall: s.status === 'approved' || s.status === 'locked' ? 'ready' : s.status === 'review' ? 'provisional' : 'needs-review' })),
          counts, majorBlockers: [], recommendedActions: [],
        });
      } catch {
        moduleResults.push({ moduleCode: mc, overall: 'needs-review', summary: `${mc}: check unavailable`, sectionResults: [], counts: { total: 0, ready: 0, blocked: 0, provisional: 0, needsReview: 0, needsReapproval: 0 }, majorBlockers: [], recommendedActions: [] });
      }
    }

    // Run real readiness engine for enrichment
    let readinessBlockers: any[] = [];
    try {
      const { computeReadinessAssessment } = await import('../services/orchestration/readiness-engine.js');
      if (computeReadinessAssessment) {
        const assessment = await computeReadinessAssessment({ projectId: Number(projectId), organizationId: 'default' });
        readinessBlockers = (assessment?.blockers || []).filter((b: any) => b.severity === 'critical' || b.severity === 'major')
          .slice(0, 10).map((b: any) => ({
            kind: 'readiness-blocker', severity: b.severity,
            message: b.message || b.description, moduleCode: b.module,
          }));
      }
    } catch { /* readiness unavailable */ }

    // Aggregate dossier counts
    const dCounts = { totalModules: moduleResults.length, readyModules: 0, blockedModules: 0, provisionalModules: 0, needsReviewModules: 0, needsReapprovalModules: 0 };
    for (const mr of moduleResults) {
      if (mr.overall === 'ready') dCounts.readyModules++;
      else if (mr.overall === 'blocked') dCounts.blockedModules++;
      else if (mr.overall === 'provisional') dCounts.provisionalModules++;
      else if (mr.overall === 'needs-reapproval') dCounts.needsReapprovalModules++;
      else dCounts.needsReviewModules++;
    }

    const majorBlockers = [...readinessBlockers];
    for (const mr of moduleResults) {
      if (mr.overall === 'blocked') {
        majorBlockers.push({ moduleCode: mr.moduleCode, kind: 'readiness-blocker', severity: 'critical', message: `Module ${mr.moduleCode} is blocked` });
      }
    }

    let overall: string;
    let summary: string;
    if (dCounts.blockedModules > 0) {
      overall = 'blocked';
      summary = `Dossier blocked — ${dCounts.blockedModules} of ${dCounts.totalModules} module(s) blocked.`;
    } else if (dCounts.provisionalModules > 0) {
      overall = 'provisional';
      summary = `Dossier provisional — ${dCounts.provisionalModules} module(s) have warnings.`;
    } else if (dCounts.readyModules === dCounts.totalModules && dCounts.totalModules > 0) {
      overall = 'ready';
      summary = `Dossier ready — all ${dCounts.totalModules} module(s) pass.`;
    } else {
      overall = 'needs-review';
      summary = `Dossier needs review — ${dCounts.needsReviewModules} module(s) need attention.`;
    }

    const recommendedActions: any[] = [];
    if (dCounts.blockedModules > 0) {
      const worst = moduleResults.find((m: any) => m.overall === 'blocked');
      if (worst) {
        recommendedActions.push({ id: 'open-blocked-module', label: `Open blocked ${worst.moduleCode}`,
          reason: `${worst.moduleCode} is blocked`, targetModuleCode: worst.moduleCode });
        recommendedActions.push({ id: 'run-module-preflight', label: `Run preflight on ${worst.moduleCode}`,
          reason: 'Get detailed module results', targetModuleCode: worst.moduleCode });
      }
    }
    if (overall === 'ready') {
      recommendedActions.push({ id: 'promote-dossier-when-clean', label: 'Dossier ready for submission assembly',
        reason: 'All modules pass preflight.' });
    }

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      for (const blocker of majorBlockers) {
        signals.push({ kind: blocker.kind || 'readiness-blocker', summary: blocker.message, severity: blocker.severity });
      }
      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        kind: 'dossier-preflight-judgment',
        regulatorBody, submissionType,
        workflowStage: 'submissions',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch { /* non-blocking */ }

    // ── Decision-aware gating enrichment ─────────────────────────
    let decisionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        String(projectId), {}
      );
    } catch { /* non-blocking */ }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        (req as any).tenantId || 1, Number(projectId),
        { regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data', action: 'dossier_preflight',
      regulatorBody, submissionType, overall, summary,
      moduleResults, counts: dCounts, majorBlockers, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      decisionAwareStatus: decisionAwareStatus || null,
      contradictionContext: contradictionContext || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] dossier-preflight error:', err?.message);
    return res.status(500).json({ error: 'Failed to run dossier preflight' });
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

    // ── Record formal decision (non-blocking) ─────────────────────
    let decisionRecord: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const signals: Array<{ kind: string; id?: string; summary: string; severity?: string }> = [];
      if (checks.contradictions?.items?.length) {
        for (const item of checks.contradictions.items) {
          signals.push({ kind: 'contradiction', id: item.id, summary: item.explanation, severity: item.severity });
        }
      }
      if (checks.bodyExpectations?.missing?.length) {
        signals.push({ kind: 'body-gap', summary: `${checks.bodyExpectations.missing.length} body requirement(s) missing`, severity: 'major' });
      }
      if (checks.crossSectionConsistency?.items?.length) {
        for (const item of checks.crossSectionConsistency.items) {
          signals.push({ kind: 'cross-section-inconsistency', summary: item.explanation, severity: item.severity });
        }
      }
      if (checks.readiness?.blockers?.length) {
        for (const b of checks.readiness.blockers) {
          signals.push({ kind: 'readiness-blocker', summary: b.message, severity: b.severity });
        }
      }

      decisionRecord = decisionLifecycleService.recordPreflightDecision({
        projectId: String(projectId),
        kind: 'section-preflight-judgment',
        sectionCode, artifactId, artifactVersionId,
        regulatorBody, submissionType,
        workflowStage: 'section-workspace',
        overall, summary,
        sourceSignals: signals as any,
        recommendedActionIds: recommendedActions.map((a: any) => a.id),
        createdById: (req as any).userId || undefined,
      });
    } catch {
      // Decision recording is non-blocking
    }

    // ── Pass 8: Contradiction context enrichment ─────────────────
    let contradictionContext: any = null;
    try {
      const { contradictionEngineService } = await import(
        '../services/contradiction-engine-service.js'
      );
      contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        orgId, Number(projectId),
        { sectionCode, regulatorBody, submissionType }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data', action: 'section_preflight',
      sectionCode, artifactId, artifactVersionId, regulatorBody, submissionType,
      overall, summary, checks, recommendedActions,
      decisionId: decisionRecord?.id || null,
      decisionStatus: decisionRecord?.status || null,
      authority: decisionRecord?.authority || null,
      contradictionContext: contradictionContext || null,
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

// ─── Decision Architecture API ───────────────────────────────────────────────

/**
 * GET /decisions/:projectId
 * Retrieve formal decision records for a project, optionally filtered.
 */
router.get('/decisions/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { kind, status, sectionCode, moduleCode, limit } = req.query;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const decisions = decisionLifecycleService.getProjectDecisions(
      projectId,
      {
        kind: kind as any || undefined,
        status: status as any || undefined,
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        limit: limit ? Number(limit) : 20,
      }
    );

    return res.json({
      projectId,
      count: decisions.length,
      decisions: decisions.map(d => ({
        id: d.id,
        kind: d.kind,
        status: d.status,
        summary: d.summary,
        rationale: d.rationale,
        authority: d.authority,
        sectionCode: d.sectionCode,
        moduleCode: d.moduleCode,
        artifactId: d.artifactId,
        createdByType: d.createdByType,
        createdAt: d.createdAt,
        sourceSignalCount: d.sourceSignals.length,
        hasReceipt: !!d.linkedReceiptId,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] decisions error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

/**
 * GET /decision/:decisionId
 * Retrieve a single decision + its receipt.
 */
router.get('/decision/:decisionId', async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const decision = decisionLifecycleService.getDecision(decisionId);
    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    const receipt = decisionLifecycleService.getReceiptForDecision(decisionId);

    return res.json({
      decision,
      receipt: receipt || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision detail error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decision' });
  }
});

/**
 * POST /decision/:decisionId/confirm
 * Confirm or reject a recommended decision.
 */
router.post('/decision/:decisionId/confirm', async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;
    const { accepted, reason } = req.body;
    const userId = (req as any).userId || 'unknown';
    const userRole = (req as any).userRole || undefined;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const newStatus = accepted ? 'confirmed' : 'rejected';
    const result = decisionLifecycleService.transitionDecision(
      decisionId,
      newStatus as any,
      { actorId: userId, actorRole: userRole, reason }
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({
      success: true,
      decision: result.decision,
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision confirm error:', err?.message);
    return res.status(500).json({ error: 'Failed to confirm decision' });
  }
});

/**
 * GET /decision-context/:projectId
 * Get decision context for AnA explanation grounding.
 */
router.get('/decision-context/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { sectionCode, moduleCode, limit } = req.query;

    const { decisionLifecycleService } = await import(
      '../services/decision-lifecycle-service.js'
    );

    const context = decisionLifecycleService.getDecisionContext(
      projectId,
      {
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        limit: limit ? Number(limit) : 10,
      }
    );

    return res.json({
      projectId,
      count: context.length,
      items: context.map(({ decision, receipt }) => ({
        decision: {
          id: decision.id,
          kind: decision.kind,
          status: decision.status,
          summary: decision.summary,
          rationale: decision.rationale,
          authority: decision.authority,
          sourceSignals: decision.sourceSignals,
          recommendedActionIds: decision.recommendedActionIds,
          createdByType: decision.createdByType,
          createdAt: decision.createdAt,
        },
        receipt: receipt ? {
          id: receipt.id,
          recommendation: receipt.recommendation,
          confirmation: receipt.confirmation,
          execution: receipt.execution,
          affectedObjects: receipt.affectedObjects,
          pendingApprovals: receipt.pendingApprovals,
          provisionalItems: receipt.provisionalItems,
        } : null,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] decision-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch decision context' });
  }
});

/**
 * GET /authority-map
 * Return the full authority boundary map for UI display.
 */
router.get('/authority-map', async (_req: Request, res: Response) => {
  try {
    const { AUTHORITY_BOUNDARY_MAP } = await import(
      '../../shared/types/decision-architecture.js'
    );
    return res.json({
      entries: AUTHORITY_BOUNDARY_MAP.map((e: any) => ({
        action: e.action,
        level: e.authority.level,
        requiresHumanConfirmation: e.authority.requiresHumanConfirmation,
        requiresReviewerApproval: e.authority.requiresReviewerApproval,
        requiresEscalation: e.authority.requiresEscalation,
        allowedActorRoles: e.authority.allowedActorRoles,
        description: e.description,
      })),
    });
  } catch (err: any) {
    console.error('[authoring-actions] authority-map error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch authority map' });
  }
});

// ─── Pass 8: Cross-Artifact Contradiction + Overlay Context ──────────────────

/**
 * POST /contradiction-scan
 * Full cross-artifact contradiction scan with overlay application.
 * Returns structured findings with severity, authority, consequence paths,
 * and regulator/body overlay context.
 */
router.post('/contradiction-scan', async (req: Request, res: Response) => {
  try {
    const { projectId, regulatorBody, submissionType } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const orgId = (req as any).tenantId || 1;

    // Run full scan (Pass 8 extended)
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const scanResult = await contradictionEngineService.scanProjectFull(
      orgId, Number(projectId),
      { regulatorBody, submissionType }
    );

    // Apply overlay rules
    let overlayCount = 0;
    let overlayConsequences: any[] = [];
    if (regulatorBody) {
      try {
        const { regulatorOverlayEngine } = await import(
          '../services/regulator-overlay-engine.js'
        );
        const overlayResult = await regulatorOverlayEngine.applyOverlaysToFindings(
          scanResult.findings
        );
        overlayCount = overlayResult.overlayCount;
        overlayConsequences = overlayResult.overlayConsequences;
      } catch { /* overlay engine unavailable */ }
    }

    // Build consequence paths for each finding
    let consequencePathsByFinding: Record<string, any[]> = {};
    try {
      const { contradictionConsequenceService } = await import(
        '../services/contradiction-consequence-service.js'
      );
      for (const finding of scanResult.findings.slice(0, 20)) {
        const paths = await contradictionConsequenceService.getAvailableConsequencePaths(finding);
        if (paths.length > 0) {
          consequencePathsByFinding[finding.id] = paths.map(p => ({
            id: p.id,
            actionType: p.actionType,
            label: p.label,
            description: p.description,
            authorityLevel: p.authorityLevel,
            requiresConfirmation: p.requiresConfirmation,
            requiresApproval: p.requiresApproval,
            requiresEscalation: p.requiresEscalation,
            autoRecommended: p.autoRecommended,
          }));
        }
      }
    } catch { /* consequence service unavailable */ }

    // Link to decisions
    let linkedDecisionIds: string[] = [];
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      const context = decisionLifecycleService.getContradictionDecisionContext(
        String(projectId), { limit: 20 }
      );
      linkedDecisionIds = context
        .filter(c => c.isContradictionDecision)
        .map(c => c.decision.id);
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data',
      action: 'contradiction_scan',
      projectId,
      regulatorBody: regulatorBody || null,
      submissionType: submissionType || null,
      summary: scanResult.summary,
      detectionMethods: scanResult.detectionMethods,
      findings: scanResult.findings.map(f => ({
        id: f.id,
        contradictionType: f.contradictionType,
        severity: f.severity,
        confidenceLevel: f.confidenceLevel,
        confidenceScore: f.confidenceScore,
        title: f.title,
        description: f.description,
        objectAType: f.objectAType,
        objectAId: f.objectAId,
        objectALabel: f.objectALabel,
        objectBType: f.objectBType,
        objectBId: f.objectBId,
        objectBLabel: f.objectBLabel,
        authorityState: f.authorityState,
        reviewState: f.reviewState,
        consequenceType: f.consequenceType,
        consequenceExecuted: f.consequenceExecuted,
        sourceClassification: f.sourceClassification,
        deterministicRule: f.deterministicRule,
        llmRole: f.llmRole,
        regulatorBody: f.regulatorBody,
        overlayRuleId: f.overlayRuleId,
        regulatorSeverityOverride: f.regulatorSeverityOverride,
        truthHierarchyLevel: f.truthHierarchyLevel,
        consequencePaths: consequencePathsByFinding[f.id] || [],
      })),
      overlay: {
        overlayCount,
        consequences: overlayConsequences,
      },
      linkedDecisionIds,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-scan error:', err?.message);
    return res.status(500).json({ error: 'Failed to run contradiction scan' });
  }
});

/**
 * POST /contradiction-consequence
 * Execute a consequence path for a contradiction finding.
 */
router.post('/contradiction-consequence', async (req: Request, res: Response) => {
  try {
    const { findingId, consequenceType } = req.body;
    if (!findingId || !consequenceType) {
      return res.status(400).json({ error: 'findingId and consequenceType are required' });
    }

    const orgId = (req as any).tenantId || 1;
    const userId = (req as any).userId || 'system';
    const userRole = (req as any).userRole || undefined;

    // Fetch the finding
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const finding = await contradictionEngineService.getFinding(findingId, orgId);
    if (!finding) {
      return res.status(404).json({ error: 'Finding not found' });
    }

    // Execute consequence
    const { contradictionConsequenceService } = await import(
      '../services/contradiction-consequence-service.js'
    );
    const result = await contradictionConsequenceService.executeConsequence(
      finding, consequenceType, userId,
      { projectId: finding.projectId ?? undefined, organizationId: orgId, actorRole: userRole }
    );

    return res.json({
      status: result.success ? 'executed' : 'failed',
      action: 'contradiction_consequence',
      findingId,
      consequenceType,
      consequenceObjectId: result.consequenceObjectId,
      consequenceObjectType: result.consequenceObjectType,
      decisionId: result.decision?.id || null,
      receiptId: result.receipt?.id || null,
      error: result.error || null,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-consequence error:', err?.message);
    return res.status(500).json({ error: 'Failed to execute contradiction consequence' });
  }
});

/**
 * GET /contradiction-context/:projectId
 * Contradiction-enriched context for AnA and UI surfaces.
 * Includes contradiction findings, overlay state, decision links.
 */
router.get('/contradiction-context/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { sectionCode, moduleCode, regulatorBody, submissionType } = req.query;
    const orgId = (req as any).tenantId || 1;

    // Build enriched contradiction context
    const { contradictionEngineService } = await import(
      '../services/contradiction-engine-service.js'
    );
    const context = await contradictionEngineService.buildPreflightContradictionContext(
      orgId, Number(projectId),
      {
        sectionCode: sectionCode as string || undefined,
        moduleCode: moduleCode as string || undefined,
        regulatorBody: regulatorBody as string || undefined,
        submissionType: submissionType as string || undefined,
      }
    );

    // Also get contradiction-aware decision status
    let contradictionAwareStatus: any = null;
    try {
      const { decisionLifecycleService } = await import(
        '../services/decision-lifecycle-service.js'
      );
      contradictionAwareStatus = await decisionLifecycleService.computeContradictionAwareStatus(
        projectId,
        {
          moduleCode: moduleCode as string || undefined,
          regulatorBody: regulatorBody as string || undefined,
          submissionType: submissionType as string || undefined,
        }
      );
    } catch { /* non-blocking */ }

    return res.json({
      status: 'data',
      action: 'contradiction_context',
      projectId,
      context,
      contradictionAwareStatus,
    });
  } catch (err: any) {
    console.error('[authoring-actions] contradiction-context error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch contradiction context' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WAVE 3 ACTIONS — Contradiction → Resolution Bridge (Pass 10)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /plan-contradiction-resolution
 * Plan (but don't execute) resolution for a specific contradiction.
 * Returns authority check, recommended path, affected objects.
 */
router.post('/plan-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, finding, overlayRules } = req.body;
    if (!projectId || !findingId || !finding) {
      return res.status(400).json({ error: 'projectId, findingId, and finding are required' });
    }

    const orgId = (req as any).tenantId || (req as any).organizationId || 1;
    const userId = (req as any).userId || 0;

    const { planContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await planContradictionResolution(
      Number(orgId), Number(userId), Number(projectId),
      findingId, finding, overlayRules
    );

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'plan_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] plan-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to plan contradiction resolution' });
  }
});

/**
 * POST /execute-contradiction-resolution
 * Execute a contradiction resolution (full orchestration with authority + overlay awareness).
 * Creates decision record + receipt. Triggers preflight refresh.
 */
router.post('/execute-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, finding, overlayRules } = req.body;
    if (!projectId || !findingId || !finding) {
      return res.status(400).json({ error: 'projectId, findingId, and finding are required' });
    }

    const orgId = (req as any).tenantId || (req as any).organizationId || 1;
    const userId = (req as any).userId || 0;
    const actorRole = (req as any).userRole || undefined;

    const { executeContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await executeContradictionResolution(
      Number(orgId), Number(userId), Number(projectId),
      findingId, finding, overlayRules, actorRole
    );

    return res.json({
      status: result.success ? 'data' : 'blocked',
      action: 'execute_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] execute-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to execute contradiction resolution' });
  }
});

/**
 * POST /explain-contradiction-resolution
 * Explain a contradiction resolution plan (structured, no LLM).
 */
router.post('/explain-contradiction-resolution', async (req: Request, res: Response) => {
  try {
    const { projectId, findingId, finding, overlayRules } = req.body;
    if (!projectId || !findingId || !finding) {
      return res.status(400).json({ error: 'projectId, findingId, and finding are required' });
    }

    const orgId = (req as any).tenantId || (req as any).organizationId || 1;

    const { explainContradictionResolution } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await explainContradictionResolution(
      Number(orgId), Number(projectId), findingId, finding, overlayRules
    );

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'explain_contradiction_resolution',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] explain-contradiction-resolution error:', err?.message);
    return res.status(500).json({ error: 'Failed to explain contradiction resolution' });
  }
});

/**
 * GET /project-resolution-status/:projectId
 * Get resolution status for a project (plans + bundles summary).
 */
router.get('/project-resolution-status/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const orgId = (req as any).tenantId || (req as any).organizationId || 1;

    const { getProjectResolutionStatus } = await import(
      '../services/resolution/contradiction-resolution-bridge.js'
    );
    const result = await getProjectResolutionStatus(Number(orgId), projectId);

    return res.json({
      status: result.success ? 'data' : 'error',
      action: 'project_resolution_status',
      ...result,
    });
  } catch (err: any) {
    console.error('[authoring-actions] project-resolution-status error:', err?.message);
    return res.status(500).json({ error: 'Failed to get project resolution status' });
  }
});

/**
 * POST /seed-overlay-rules
 * Seed the default regulator overlay rules for an organization.
 * Idempotent — safe to call multiple times.
 */
router.post('/seed-overlay-rules', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantId || 1;

    const { regulatorOverlayEngine } = await import(
      '../services/regulator-overlay-engine.js'
    );
    const result = await regulatorOverlayEngine.ensureSeedRules(orgId);

    return res.json({
      status: 'data',
      action: 'seed_overlay_rules',
      seeded: result.seeded,
      skipped: result.skipped,
      totalAvailable: regulatorOverlayEngine.getSeedRules().length,
    });
  } catch (err: any) {
    console.error('[authoring-actions] seed-overlay-rules error:', err?.message);
    return res.status(500).json({ error: 'Failed to seed overlay rules' });
  }
});

export default router;
