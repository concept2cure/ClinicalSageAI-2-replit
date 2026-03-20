/**
 * eCTD Submission Agent API Routes
 *
 * Endpoints for managing eCTD submissions to regulatory agency gateways.
 *
 * @module server/routes/ectd-submission-agent.routes
 * @compliance ICH M8 v4.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ectdSubmissionAgent } from '../services/ectd-submission-agent';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number {
  const orgId =
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    (req as any).organizationId ||
    (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const prepareSchema = z.object({
  projectId: z.number().optional(),
  submissionType: z.enum(['initial', 'amendment', 'supplement', 'annual_report']),
  applicationType: z.enum(['IND', 'NDA', 'BLA', 'ANDA', 'MAA', 'CTD']).optional(),
  applicationNumber: z.string().optional(),
  sequenceNumber: z.string().optional(),
  agency: z.string().min(1),
  center: z.string().optional(),
  applicantName: z.string().optional(),
  drugName: z.string().optional(),
  indication: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addDocumentSchema = z.object({
  module: z.enum(['m1', 'm2', 'm3', 'm4', 'm5']),
  sectionCode: z.string().min(1),
  sectionTitle: z.string().optional(),
  documentPath: z.string().min(1),
  fileName: z.string().min(1),
  fileSizeBytes: z.number().optional(),
  content: z.string().optional(),
  lifecycleOperation: z.enum(['new', 'replace', 'append', 'delete']).optional(),
  replacedDocumentId: z.number().optional(),
  documentType: z.enum(['pdf', 'xml', 'xpt', 'svg']).optional(),
  pdfACompliant: z.boolean().optional(),
  pageCount: z.number().optional(),
  wordCount: z.number().optional(),
  language: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const amendSchema = z.object({
  projectId: z.number().optional(),
  center: z.string().optional(),
  applicantName: z.string().optional(),
  drugName: z.string().optional(),
  indication: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /prepare — Create a draft submission
router.post('/prepare', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const parsed = prepareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }
    const submission = await ectdSubmissionAgent.prepareSubmission(orgId, parsed.data);
    return res.json({ data: submission });
  } catch (err) {
    console.error('[ectd-submission-agent] prepare error:', err);
    return res.status(500).json({ error: 'Failed to prepare submission' });
  }
});

// POST /:id/documents — Add document to submission
router.post('/:id/documents', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const submissionId = parseInt(req.params.id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Valid submission ID required' });

    const parsed = addDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }
    const doc = await ectdSubmissionAgent.addDocument(orgId, submissionId, parsed.data);
    return res.json({ data: doc });
  } catch (err) {
    console.error('[ectd-submission-agent] addDocument error:', err);
    return res.status(500).json({ error: 'Failed to add document' });
  }
});

// POST /:id/validate — Run pre-submission validation
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const submissionId = parseInt(req.params.id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Valid submission ID required' });

    const result = await ectdSubmissionAgent.validateSubmission(orgId, submissionId);
    return res.json({ data: result });
  } catch (err) {
    console.error('[ectd-submission-agent] validate error:', err);
    return res.status(500).json({ error: 'Failed to validate submission' });
  }
});

// POST /:id/submit — Submit to agency gateway
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const submissionId = parseInt(req.params.id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Valid submission ID required' });

    const result = await ectdSubmissionAgent.submitToGateway(orgId, submissionId);
    return res.json({ data: result });
  } catch (err) {
    console.error('[ectd-submission-agent] submit error:', err);
    return res.status(500).json({ error: 'Failed to submit to gateway' });
  }
});

// GET /:id — Get submission detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const submissionId = parseInt(req.params.id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Valid submission ID required' });

    const submission = await ectdSubmissionAgent.getSubmission(orgId, submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    return res.json({ data: submission });
  } catch (err) {
    console.error('[ectd-submission-agent] getSubmission error:', err);
    return res.status(500).json({ error: 'Failed to retrieve submission' });
  }
});

// GET / — List submissions with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const filters = {
      status: req.query.status as string | undefined,
      agency: req.query.agency as string | undefined,
      applicationType: req.query.applicationType as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };
    const submissions = await ectdSubmissionAgent.listSubmissions(orgId, filters);
    return res.json({ data: submissions });
  } catch (err) {
    console.error('[ectd-submission-agent] listSubmissions error:', err);
    return res.status(500).json({ error: 'Failed to list submissions' });
  }
});

// GET /:id/status — Get submission status with history
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const submissionId = parseInt(req.params.id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Valid submission ID required' });

    const statusInfo = await ectdSubmissionAgent.getSubmissionStatus(orgId, submissionId);
    return res.json({ data: statusInfo });
  } catch (err) {
    console.error('[ectd-submission-agent] getStatus error:', err);
    return res.status(500).json({ error: 'Failed to retrieve submission status' });
  }
});

// POST /:id/amend — Create amendment linked to parent
router.post('/:id/amend', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const parentId = parseInt(req.params.id, 10);
    if (isNaN(parentId)) return res.status(400).json({ error: 'Valid parent submission ID required' });

    const parsed = amendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }
    const amendment = await ectdSubmissionAgent.createAmendment(orgId, parentId, parsed.data);
    return res.json({ data: amendment });
  } catch (err) {
    console.error('[ectd-submission-agent] amend error:', err);
    return res.status(500).json({ error: 'Failed to create amendment' });
  }
});

export default router;
