/**
 * @fileoverview AnA Research API Routes
 * @module server/routes/deep-research
 *
 * REST + SSE endpoints for deep research jobs, connector management,
 * and usage tracking.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { loadLicense, requireTier } from '../services/license-manager.js';
import {
  launchResearchJob,
  getJobStatus,
  listJobs,
  cancelJob,
  onJobProgress,
} from '../services/deep-research-orchestrator.js';
import {
  getConnectorCatalog,
  storeCredentials,
} from '../services/connectors/connector-registry.js';
import { getUsageSummary } from '../services/usage-metering.js';
import { ai } from '../lib/unified-ai-client.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);
router.use(loadLicense());

// ═══════════════════════════════════════════════════════════════════════════════
// RESEARCH JOBS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/deep-research/jobs — Launch a new deep research job
 */
router.post('/jobs', requireTier('standard'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const orgId = user?.organizationId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { query, connectorIds, projectId, depth } = req.body;

    if (!query?.indication) {
      return res.status(400).json({ error: 'query.indication is required' });
    }

    const job = await launchResearchJob({
      organizationId: Number(orgId),
      userId: Number(user?.id || user?.userId),
      projectId: projectId || null,
      query,
      connectorIds: connectorIds || ['clinical_trials_gov', 'pubmed'],
      depth: depth || 'standard',
    });

    res.status(201).json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('quota') || message.includes('tier') ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/deep-research/jobs — List jobs for current org
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const jobs = await listJobs(Number(orgId), limit);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/deep-research/jobs/:id — Get job status + results
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const job = await getJobStatus(parseInt(req.params.id, 10));
    res.json(job);
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

/**
 * POST /api/deep-research/jobs/:id/stop — Cancel a running job
 */
router.post('/jobs/:id/stop', async (req: Request, res: Response) => {
  try {
    await cancelJob(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/deep-research/jobs/:id/stream — SSE stream for progress
 */
router.get('/jobs/:id/stream', async (req: Request, res: Response) => {
  const jobId = parseInt(req.params.id, 10);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial status
  try {
    const job = await getJobStatus(jobId);
    res.write(`data: ${JSON.stringify({ progress: job.progress, status: job.status })}\n\n`);

    if (job.status === 'complete' || job.status === 'failed') {
      res.write(`data: ${JSON.stringify({ progress: 100, status: job.status, done: true })}\n\n`);
      res.end();
      return;
    }
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    res.end();
    return;
  }

  // Register for progress updates
  onJobProgress(jobId, (progress, status, data) => {
    try {
      res.write(`data: ${JSON.stringify({ progress, status, ...data })}\n\n`);
      if (status === 'complete' || status === 'failed') {
        res.end();
      }
    } catch {
      // Client disconnected
    }
  });

  // Clean up on disconnect
  req.on('close', () => {
    // Progress callback will be cleaned up by orchestrator
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/deep-research/connectors — List available connectors + status
 */
router.get('/connectors', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const catalog = await getConnectorCatalog(Number(orgId));
    res.json({ connectors: catalog });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/deep-research/connectors — Store connector credentials
 */
router.post('/connectors', requireTier('professional'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { connectorId, credentials } = req.body;
    if (!connectorId || !credentials) {
      return res.status(400).json({ error: 'connectorId and credentials are required' });
    }

    await storeCredentials(Number(orgId), connectorId, credentials);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/deep-research/usage — Usage/credits for billing period
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const summary = await getUsageSummary(Number(orgId));
    res.json({ usage: summary });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT GENERATION (FullDocumentBuilder)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/deep-research/document/generate — Generate a regulatory document
 * Used by FullDocumentBuilder to create CSR, CTD, and other submissions.
 */
router.post('/document/generate', requireTier('standard'), async (req: Request, res: Response) => {
  const generationStartMs = Date.now();
  try {
    const { documentType, targetAgencies, studyInfo } = req.body;

    if (!documentType || !studyInfo?.title) {
      return res.status(400).json({ error: 'documentType and studyInfo.title are required' });
    }

    const agencies = targetAgencies || ['FDA'];

    // Define section templates per document type
    const sectionTemplates: Record<string, Array<{ number: string; title: string }>> = {
      csr: [
        { number: '1', title: 'Title Page' },
        { number: '2', title: 'Synopsis' },
        { number: '5', title: 'Ethics' },
        { number: '6', title: 'Investigators and Study Administrative Structure' },
        { number: '7', title: 'Introduction' },
        { number: '8', title: 'Study Objectives' },
        { number: '9', title: 'Investigational Plan' },
        { number: '10', title: 'Study Patients' },
        { number: '11', title: 'Efficacy Evaluation' },
        { number: '12', title: 'Safety Evaluation' },
        { number: '13', title: 'Discussion and Overall Conclusions' },
      ],
      ctd_full: [
        { number: '1.1', title: 'Cover Letter' },
        { number: '1.2', title: 'Administrative Information' },
        { number: '2.2', title: 'Introduction (Quality Overall Summary)' },
        { number: '2.3', title: 'Quality Overall Summary' },
        { number: '2.4', title: 'Nonclinical Overview' },
        { number: '2.5', title: 'Clinical Overview' },
        { number: '2.6', title: 'Nonclinical Written and Tabulated Summaries' },
        { number: '2.7', title: 'Clinical Summary' },
        { number: '3.2.S', title: 'Drug Substance' },
        { number: '3.2.P', title: 'Drug Product' },
        { number: '5.3.5', title: 'Reports of Controlled Clinical Studies' },
      ],
      ctd_module2: [
        { number: '2.2', title: 'Introduction' },
        { number: '2.3', title: 'Quality Overall Summary' },
        { number: '2.4', title: 'Nonclinical Overview' },
        { number: '2.5', title: 'Clinical Overview' },
        { number: '2.6', title: 'Nonclinical Summaries' },
        { number: '2.7.1', title: 'Summary of Biopharmaceutic Studies' },
        { number: '2.7.2', title: 'Summary of Clinical Pharmacology Studies' },
        { number: '2.7.3', title: 'Summary of Clinical Efficacy' },
        { number: '2.7.4', title: 'Summary of Clinical Safety' },
      ],
      ctd_module3: [
        { number: '3.2.S.1', title: 'General Information — Drug Substance' },
        { number: '3.2.S.2', title: 'Manufacture' },
        { number: '3.2.S.3', title: 'Characterization' },
        { number: '3.2.S.4', title: 'Control of Drug Substance' },
        { number: '3.2.S.7', title: 'Stability' },
        { number: '3.2.P.1', title: 'Description and Composition — Drug Product' },
        { number: '3.2.P.2', title: 'Pharmaceutical Development' },
        { number: '3.2.P.3', title: 'Manufacture' },
        { number: '3.2.P.5', title: 'Control of Drug Product' },
        { number: '3.2.P.8', title: 'Stability' },
      ],
      ctd_module4: [
        { number: '4.2.1.1', title: 'Primary Pharmacodynamics' },
        { number: '4.2.1.2', title: 'Secondary Pharmacodynamics' },
        { number: '4.2.1.3', title: 'Safety Pharmacology' },
        { number: '4.2.2', title: 'Pharmacokinetics (ADME)' },
        { number: '4.2.3.1', title: 'Single-Dose Toxicity' },
        { number: '4.2.3.2', title: 'Repeat-Dose Toxicity' },
        { number: '4.2.3.3', title: 'Genotoxicity' },
        { number: '4.2.3.5', title: 'Reproductive and Developmental Toxicity' },
      ],
      ctd_module5: [
        { number: '5.1', title: 'Table of Contents' },
        { number: '5.2', title: 'Tabular Listing of All Clinical Studies' },
        { number: '5.3.1', title: 'Reports of Biopharmaceutic Studies' },
        { number: '5.3.3', title: 'Reports of Human PK Studies' },
        { number: '5.3.5', title: 'Reports of Efficacy and Safety Studies' },
        { number: '5.3.6', title: 'Reports of Post-Marketing Experience' },
      ],
      ind_full: [
        { number: '1.1', title: 'Cover Letter' },
        { number: '1.2', title: 'FDA Form 1571' },
        { number: '1.3', title: 'FDA Form 1572' },
        { number: '2.2', title: 'Introduction' },
        { number: '2.3', title: 'Quality Overall Summary' },
        { number: '2.4', title: 'Nonclinical Overview' },
        { number: '2.5', title: 'Clinical Overview' },
        { number: '3.2.S', title: 'Drug Substance' },
        { number: '3.2.P', title: 'Drug Product' },
        { number: '4.2.1', title: 'Pharmacology' },
        { number: '4.2.2', title: 'Pharmacokinetics' },
        { number: '4.2.3', title: 'Toxicology' },
        { number: '5.3', title: 'Clinical Study Reports' },
        { number: '5.4', title: 'Literature References' },
      ],
    };

    const templates = sectionTemplates[documentType] || sectionTemplates.csr;

    // ── Retrieve Data Room evidence for richer generation context ──────
    let dataRoomEvidence = new Map<string, string>();
    try {
      const { pool } = await import('../db.js');
      const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
      const embeddingService = getEmbeddingService(pool);
      // Retrieve evidence once for the study, indexed by section relevance
      for (const tmpl of templates) {
        const searchQuery = `${tmpl.title} ${studyInfo.title} ${studyInfo.indication || ''}`.trim();
        const results = await embeddingService.searchHybrid(searchQuery, 3, 0.65);
        if (results.length > 0) {
          const block = results.map((r: any, i: number) => {
            const content = r.content.length > 400 ? r.content.substring(0, 400) + '…' : r.content;
            return `[SRC-${i + 1}] "${r.title}"\n${content}`;
          }).join('\n\n');
          dataRoomEvidence.set(tmpl.number, block);
        }
      }
    } catch (e: any) {
      console.warn('[DeepResearch] Data Room retrieval failed (non-fatal):', e.message);
    }

    // Generate content for each section using Claude
    const sections = await Promise.all(
      templates.map(async (tmpl) => {
        try {
          const moduleNum = tmpl.number.split('.')[0];
          const sectionGuidance = moduleNum === '1' ? 'This is an administrative section. Use formal letter/form language. Include all required identifiers.'
            : moduleNum === '2' ? 'This is a CTD summary section. Provide a comprehensive yet concise overview. Reference the detailed data in Modules 3-5.'
            : moduleNum === '3' ? 'This is a Quality/CMC section. Use precise scientific language. Reference ICH Q guidelines. Include specifications, methods, and acceptance criteria.'
            : moduleNum === '4' ? 'This is a Nonclinical section. Reference ICH M3(R2) and S guidelines. Describe study design, results, and conclusions.'
            : 'This is a Clinical section. Follow ICH E3 structure. Present data systematically with statistical context.';

          // Inject Data Room evidence if available for this section
          const sectionEvidence = dataRoomEvidence.get(tmpl.number);
          const evidenceInstruction = sectionEvidence
            ? `\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n${sectionEvidence}\n--- END EVIDENCE ---\n\nWhen your content relies on evidence above, cite it inline using [SRC-n]. Do NOT fabricate citations.`
            : '';

          const result = await ai.chat(
            [
              {
                role: 'system',
                content: `You are an experienced regulatory medical writer at a top-tier CRO, generating Section ${tmpl.number} (${tmpl.title}) for a ${documentType.toUpperCase()} document targeting ${agencies.join(', ')}.

Writing standards:
- Follow ICH E3/CTD conventions strictly
- Use third-person passive voice and formal regulatory language
- Include bracketed placeholders [like this] for data points that need to be filled in
- Cross-reference other CTD sections where appropriate (e.g., "See Section 2.7.4 for detailed safety data")
- Use hedging language appropriately ("was observed", "appeared to", "is considered")
- Never use promotional language, unsupported claims, or superlatives
- Structure with clear subheadings where the section warrants them

${sectionGuidance}${evidenceInstruction}

Output 300-600 words of publication-ready regulatory prose. Include proper CTD-style subheadings as H3 tags.`,
              },
              {
                role: 'user',
                content: `Generate Section ${tmpl.number}: ${tmpl.title}

Study Information:
- Title: ${studyInfo.title}
- Protocol: ${studyInfo.protocolNumber || studyInfo.protocol || '[Protocol Number]'}
- Phase: ${studyInfo.phase || '[Phase]'}
- Indication: ${studyInfo.indication || '[Indication]'}
- Sponsor: ${studyInfo.sponsor || '[Sponsor]'}
- Investigational Product: ${studyInfo.investigationalProduct || studyInfo.product || '[Product Name]'}
- Study Design: ${studyInfo.studyDesign || studyInfo.design || '[Study Design]'}
- Primary Endpoint: ${studyInfo.primaryEndpoint || '[Primary Endpoint]'}
- Secondary Endpoints: ${Array.isArray(studyInfo.secondaryEndpoints) ? studyInfo.secondaryEndpoints.join(', ') : studyInfo.secondaryEndpoints || '[Secondary Endpoints]'}
- Sample Size: ${studyInfo.sampleSize || '[N]'}
- Treatment Duration: ${studyInfo.treatmentDuration || studyInfo.duration || '[Duration]'}

Generate the section content with proper regulatory structure and cross-references to related CTD sections.`,
              },
            ],
            { taskType: 'regulatory_review', temperature: 0.3, maxTokens: 3000, callerModule: 'document-builder' }
          );

          const content = result.content || '';
          return {
            number: tmpl.number,
            title: tmpl.title,
            content,
            status: content.length > 50 ? 'drafted' : 'template_only',
            wordCount: content.split(/\s+/).length,
            agency: agencies[0],
            sourcesUsed: dataRoomEvidence.has(tmpl.number) ? true : false,
          };
        } catch {
          return {
            number: tmpl.number,
            title: tmpl.title,
            content: `[Section ${tmpl.number} — content generation pending]`,
            status: 'template_only',
            wordCount: 0,
            agency: agencies[0],
          };
        }
      })
    );

    // Run basic validation checks per agency
    const validationResults: Array<{ sectionNumber: string; agency: string; status: string; message: string }> = [];
    for (const agency of agencies) {
      for (const section of sections) {
        if (section.status === 'drafted' && section.wordCount < 50) {
          validationResults.push({
            sectionNumber: section.number,
            agency,
            status: 'warning',
            message: `Section ${section.number} has fewer than 50 words — may need expansion for ${agency} submission.`,
          });
        } else if (section.status === 'drafted') {
          validationResults.push({
            sectionNumber: section.number,
            agency,
            status: 'pass',
            message: `Section ${section.number} meets minimum content requirements.`,
          });
        } else {
          validationResults.push({
            sectionNumber: section.number,
            agency,
            status: 'fail',
            message: `Section ${section.number} requires manual content — template only.`,
          });
        }
      }
    }

    const totalLatencyMs = Date.now() - generationStartMs;
    const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
    const draftedCount = sections.filter(s => s.status === 'drafted').length;
    const sourcedCount = sections.filter(s => s.sourcesUsed).length;

    res.json({
      sections,
      validationResults,
      metrics: {
        totalLatencyMs,
        totalWordCount,
        sectionsGenerated: draftedCount,
        sectionsTotal: sections.length,
        sectionsWithSources: sourcedCount,
        avgMsPerSection: draftedCount > 0 ? Math.round(totalLatencyMs / draftedCount) : 0,
        wordsPerMinute: totalLatencyMs > 0 ? Math.round((totalWordCount / (totalLatencyMs / 60000))) : 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Document generation error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
