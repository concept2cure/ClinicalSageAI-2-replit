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
  listCredentialCards, currentCredentialCardRole, mayManageCredentialCards, writeCredentialCard, CredentialCardRefusal, type CredentialCardChange,
} from '../services/connectors/connector-registry.js';
import { getUsageSummary } from '../services/usage-metering.js';
import { ai } from '../lib/unified-ai-client.js';
import { serverError } from '../lib/api-response';
import {
  readDataRoomProjectScope,
  retrieveDataRoomEvidence,
  RETRIEVAL_STATUS_MESSAGE,
  type RetrievalStatus,
} from '../services/data-room-retrieval';
import { ProgramReadAccessError, type ProgramAccessExecutor } from '../services/c2c/current-program-access';
import { resolveOrgId } from '../types/auth-request';
import { authedUserId } from '../utils/authedActor';
import { createScopedLogger } from '../utils/logger';
import { requestConnectable, requestPgClient } from '../db/requestDb';
import { verifyReauth } from './c2c/actions';
import { openSseStream } from '../utils/sse-stream';

const logger = createScopedLogger('deep-research');

const router = Router();

/**
 * The projects a generated document may draw Data Room evidence from: every
 * project the person can open (F1, 2026-11-05). It searched every atom in the
 * organization. Null, with the refusal sent, when the check refuses or cannot
 * run: that is an error, never a document "grounded" in nothing.
 */
async function documentEvidenceProjects(req: Request, res: Response, pool: ProgramAccessExecutor): Promise<number[] | null> {
  try {
    return await readDataRoomProjectScope(pool, { organizationId: resolveOrgId(req), userId: authedUserId(req) });
  } catch (error) {
    const failure = error instanceof ProgramReadAccessError ? error
      : new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was generated.');
    res.status(failure.status).json({ error: failure.message, code: failure.code });
    return null;
  }
}

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
    return serverError(res, logger, 'loading jobs', err);
  }
});

/**
 * GET /api/deep-research/jobs/:id — Get job status + results
 */
/**
 * Whether getJobStatus refused because no job with the id is the caller's. It
 * throws a plain Error whose message is exactly this (deep-research-orchestrator.ts).
 */
const isJobNotFound = (err: unknown, jobId: number): boolean =>
  err instanceof Error && err.message === `Job ${jobId} not found`;

router.get('/jobs/:id', async (req: Request, res: Response) => {
  const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
  if (!orgId) return res.status(400).json({ error: 'Organization context required' });
  const raw = String(req.params.id);
  if (!/^[1-9]\d*$/.test(raw)) return res.status(400).json({ error: 'Job id must be a positive integer' });
  const jobId = Number(raw);
  try {
    const job = await getJobStatus(jobId, Number(orgId));
    res.json(job);
  } catch (err) {
    // 2026-10-22: every error was a 404 carrying String(err), so a failed read
    // (with the driver's text) read as "no such job". 404 is for not found only.
    if (isJobNotFound(err, jobId)) return res.status(404).json({ error: 'Job not found' });
    return serverError(res, logger, 'loading the job', err);
  }
});

/**
 * POST /api/deep-research/jobs/:id/stop — Cancel a running job
 */
router.post('/jobs/:id/stop', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    await cancelJob(parseInt(String(req.params.id), 10), Number(orgId));
    res.json({ success: true });
  } catch (err) {
    return serverError(res, logger, 'stopping jobs', err);
  }
});

/**
 * GET /api/deep-research/jobs/:id/stream — SSE stream for progress
 */
router.get('/jobs/:id/stream', async (req: Request, res: Response) => {
  const jobId = parseInt(String(req.params.id), 10);
  const streamOrgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
  // Refused before the stream opens and before any read, as GET /jobs/:id is:
  // without an organisation there is no job to stream (D3, 2026-10-11).
  if (!streamOrgId) return res.status(400).json({ error: 'Organization context required' });

  // SSE headers, and a heartbeat between progress events, which a research
  // job can leave minutes apart (server/utils/sse-stream.ts).
  openSseStream(req, res);

  // Send initial status (org-scoped: a foreign-tenant job id reads as not found)
  try {
    const job = await getJobStatus(jobId, Number(streamOrgId));
    res.write(`data: ${JSON.stringify({ progress: job.progress, status: job.status })}\n\n`);

    if (job.status === 'complete' || job.status === 'failed') {
      res.write(`data: ${JSON.stringify({ progress: 100, status: job.status, done: true })}\n\n`);
      res.end();
      return;
    }
  } catch (err) {
    // 2026-10-22: every failure was streamed as "Job not found".
    if (!isJobNotFound(err, jobId)) logger.error('deep research job stream: the job could not be read', { jobId, error: err instanceof Error ? err.message : String(err) });
    res.write(`data: ${JSON.stringify({ error: isJobNotFound(err, jobId) ? 'Job not found' : 'The job could not be read' })}\n\n`);
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
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });
    const userId = authedUserId(req);
    const role = userId === null ? null : await currentCredentialCardRole(requestPgClient(req), Number(orgId), Number(userId));
    if (role === null) return res.status(403).json({ error: { code: 'CREDENTIAL_MEMBERSHIP_REQUIRED', message: 'Current membership of this organization is required.' } });
    const canManage = ['admin', 'owner'].includes(role);
    const [catalog, credentialCards] = await Promise.all([getConnectorCatalog(Number(orgId)),
      canManage ? listCredentialCards(Number(orgId), true, requestPgClient(req)) : Promise.resolve([])]);
    res.json({ organizationId: Number(orgId), canManage, connectors: catalog, credentialCards });
  } catch (err) {
    return serverError(res, logger, 'loading connectors', err);
  }
});

/**
 * POST /api/deep-research/connectors — Store connector credentials
 */
function credentialCaptureBody(body: unknown): body is CredentialCardChange & { reauth?: Parameters<typeof verifyReauth>[1] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['connectorId', 'action', 'credentials', 'scopes', 'expiresAt', 'reason', 'reauth'].includes(key))) return false;
  if (typeof input.connectorId !== 'string' || !['capture', 'rotate', 'revoke'].includes(String(input.action))) return false;
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10) return false;
  if (input.scopes !== undefined && (!Array.isArray(input.scopes) || input.scopes.some(scope => typeof scope !== 'string'))) return false;
  return input.expiresAt === undefined || input.expiresAt === null || typeof input.expiresAt === 'string';
}
router.post('/connectors', async (req: Request, res: Response) => {
  let client: Awaited<ReturnType<ReturnType<typeof requestConnectable>['connect']>> | undefined;
  let commitAttempted = false;
  let discardConnection: Error | undefined;
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });
    const userId = authedUserId(req);
    if (userId === null || !await mayManageCredentialCards(requestPgClient(req), Number(orgId), Number(userId))) {
      return res.status(403).json({ error: { code: 'CREDENTIAL_ADMIN_REQUIRED', message: 'Only this organization’s administrator can manage its credentials.' } });
    }
    const body = req.body;
    if (!credentialCaptureBody(body)) {
      return res.status(400).json({ error: { code: 'CREDENTIAL_CHANGE_INVALID', message: 'Choose a credential card and action, and provide its required fields and reason.' } });
    }
    const reauth = await verifyReauth(Number(userId), body.reauth);
    if (!reauth.ok) return res.status(401).json({ error: { code: 'REAUTH_REQUIRED', message: 'Confirm your password and second factor before changing credentials.' } });
    client = await requestConnectable(req).connect();
    await client.query('BEGIN');
    const credentialCard = await writeCredentialCard(client, Number(orgId), Number(userId), body as CredentialCardChange);
    commitAttempted = true;
    await client.query('COMMIT');
    return res.json({ success: true, organizationId: Number(orgId), credentialCard });
  } catch (error) {
    if (commitAttempted) discardConnection = new Error('Credential commit acknowledgement unavailable');
    if (client && !commitAttempted) await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof CredentialCardRefusal) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    // Neither an arbitrary provider/DB message nor the capture body is logged.
    logger.error('Credential change could not be confirmed', { commitAttempted });
    return res.status(503).json({ error: { code: 'CREDENTIAL_CHANGE_UNCONFIRMED', message: 'The credential change could not be confirmed. Re-read its status before trying again.' } });
  } finally {
    client?.release(discardConnection);
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
    return serverError(res, logger, 'loading usage', err);
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
        /* FDA regional Module 1: 1.1 is FORMS, 1.2 is the COVER LETTER
     (shared/regulatory/regional-module1.ts; gate: tests/regulatory/m1-placement-repo-wide.test.ts).
     The table of contents has no US Module 1 heading at all — the eCTD XML backbone IS the table
     of contents — so the row for it is gone rather than renumbered. */
        { number: '1.1', title: 'Forms' },
        { number: '1.2', title: 'Cover Letter' },
        { number: '1.3', title: 'Administrative Information' },
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
        /* FDA regional Module 1: 1.1 is FORMS, 1.2 is the COVER LETTER
     (shared/regulatory/regional-module1.ts; gate: tests/regulatory/m1-placement-repo-wide.test.ts).
     The table of contents has no US Module 1 heading at all — the eCTD XML backbone IS the table
     of contents — so the row for it is gone rather than renumbered. */
        { number: '1.1', title: 'Forms (FDA 1571, 1572, 3674)' },
        { number: '1.2', title: 'Cover Letter' },
        { number: '1.3', title: 'Administrative Information' },
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
    // Per section, each with its own outcome. One failure used to end retrieval
    // for every remaining section and was only logged, so an outage read as
    // "no sources" (services/data-room-retrieval.ts says why that matters).
    const { pool } = await import('../db.js');
    const projectIds = await documentEvidenceProjects(req, res, pool);
    if (!projectIds) return;
    const dataRoomEvidence = new Map<string, string>();
    const retrievalBySection = new Map<string, RetrievalStatus>();
    for (const tmpl of templates) {
      const searchQuery = `${tmpl.title} ${studyInfo.title} ${studyInfo.indication || ''}`.trim();
      const retrieval = await retrieveDataRoomEvidence(pool, searchQuery, {
        limit: 3,
        minSemanticScore: 0.65,
        projectIds,
      });
      retrievalBySection.set(tmpl.number, retrieval.status);
      if (retrieval.cause) {
        logger.warn('Data Room retrieval failed', { section: tmpl.number, cause: retrieval.cause });
      }
      if (retrieval.hits.length > 0) {
        const block = retrieval.hits.map((r, i) => {
          const content = r.content.length > 400 ? r.content.substring(0, 400) + '…' : r.content;
          return `[SRC-${i + 1}] "${r.title}"\n${content}`;
        }).join('\n\n');
        dataRoomEvidence.set(tmpl.number, block);
      }
    }
    const statuses = [...retrievalBySection.values()];
    const retrievalStatus: RetrievalStatus = statuses.includes('failed')
      ? 'failed'
      : statuses.includes('ok')
        ? 'ok'
        : 'empty';

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
            retrievalStatus: retrievalBySection.get(tmpl.number) ?? 'failed',
          };
        } catch {
          return {
            number: tmpl.number,
            title: tmpl.title,
            content: `[Section ${tmpl.number} — content generation pending]`,
            status: 'template_only',
            wordCount: 0,
            agency: agencies[0],
            sourcesUsed: false,
            retrievalStatus: retrievalBySection.get(tmpl.number) ?? 'failed',
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
        sectionsRetrievalFailed: statuses.filter(st => st === 'failed').length,
      },
      retrievalStatus,
      retrievalMessage: RETRIEVAL_STATUS_MESSAGE[retrievalStatus],
    });
  } catch (err) {
    return serverError(res, logger, 'generating the document', err);
  }
});

export default router;
