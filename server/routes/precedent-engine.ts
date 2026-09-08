/**
 * Regulatory Precedent Engine API Routes
 *
 * REST endpoints for the Precedent Engine:
 *   POST /api/precedent-engine/search         — Find closest precedents
 *   POST /api/precedent-engine/compare        — Compare against a precedent
 *   POST /api/precedent-engine/risk            — Analyze regulatory risks
 *   POST /api/precedent-engine/strategy        — Recommend submission strategy
 *   POST /api/precedent-engine/check-claim     — Real-time claim checking
 *   POST /api/precedent-engine/ingest          — Store a new precedent
 *   GET  /api/precedent-engine/health          — Service health check
 *
 * @module server/routes/precedent-engine
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { precedentEngine } from '../services/precedent-engine';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';
import { serverError } from '../lib/api-response';

const router = Router();
const log = createScopedLogger('precedent-routes');

// All precedent-engine routes require authentication
router.use(authMiddleware);

// ─── Validation Schemas ──────────────────────────────────────────────────────

const SearchSchema = z.object({
  submissionType: z.string().min(1),
  indication: z.string().optional(),
  deviceClass: z.string().optional(),
  productType: z.string().optional(),
  therapeuticArea: z.string().optional(),
  deviceName: z.string().optional(),
  productCode: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

const CompareSchema = z.object({
  precedentId: z.string().min(1),
  submissionType: z.string().min(1),
  deviceName: z.string().optional(),
  indication: z.string().optional(),
  trialDesign: z.string().optional(),
  sampleSize: z.number().int().optional(),
  primaryEndpoint: z.string().optional(),
  testingApproach: z.string().optional(),
  predicateDevice: z.string().optional(),
});

const RiskSchema = z.object({
  submissionType: z.string().min(1),
  therapeuticArea: z.string().optional(),
  indication: z.string().optional(),
  deviceName: z.string().optional(),
  productCode: z.string().optional(),
  deviceClass: z.string().optional(),
});

const ClaimCheckSchema = z.object({
  claim: z.string().min(1).max(2000),
  submissionType: z.string().min(1),
  therapeuticArea: z.string().optional(),
  indication: z.string().optional(),
  /* What the FDA 510(k) registry can be searched by. Without them a device
     claim check reaches the org corpus but never the registry. */
  productCode: z.string().optional(),
  deviceName: z.string().optional(),
});

const IngestSchema = z.object({
  submissionType: z.string().min(1),
  decisionOutcome: z.string().min(1),
  productType: z.string().optional(),
  deviceClass: z.string().optional(),
  therapeuticArea: z.string().optional(),
  indication: z.string().optional(),
  clearanceNumber: z.string().optional(),
  deviceName: z.string().optional(),
  applicant: z.string().optional(),
  decisionDate: z.string().optional(),
  clearanceType: z.string().optional(),
  predicateDevice: z.string().optional(),
  predicateKNumber: z.string().optional(),
  strategySummary: z.string().optional(),
  testingApproach: z.string().optional(),
  trialDesign: z.string().optional(),
  sampleSize: z.number().int().optional(),
  primaryEndpoint: z.string().optional(),
  endpointMet: z.boolean().optional(),
  fdaComments: z.string().optional(),
  fdaQuestions: z.array(z.string()).optional(),
  riskFactors: z.array(z.string()).optional(),
  sourceType: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/** Health check */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'precedent-engine', timestamp: new Date().toISOString() });
});

/** Search precedents */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const organizationId = (req as any).user?.organizationId;
    const results = await precedentEngine.search(parsed.data, organizationId);
    const offset = parsed.data.offset || 0;
    const limit = parsed.data.limit || 10;
    res.json({
      success: true,
      data: results,
      count: results.length,
      pagination: { offset, limit, hasMore: results.length === limit },
    });
  } catch (err: any) {
    return serverError(res, log, 'searching precedents', err);
  }
});

/** Compare submission against precedent */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const parsed = CompareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { precedentId, ...userContext } = parsed.data;
    const result = await precedentEngine.compare(userContext, precedentId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'comparing against a precedent', err);
  }
});

/** Regulatory risk analysis */
router.post('/risk', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const result = await precedentEngine.analyzeRisk(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'analysing precedent risk', err);
  }
});

/** Submission strategy recommendation */
router.post('/strategy', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const result = await precedentEngine.recommendStrategy(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'recommending a submission strategy', err);
  }
});

/** Real-time claim checking (authoring assistant) */
router.post('/check-claim', async (req: Request, res: Response) => {
  try {
    const parsed = ClaimCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const { claim, ...context } = parsed.data;
    const result = await precedentEngine.checkClaim(claim, context);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'checking the claim', err);
  }
});

/** Ingest a new precedent */
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const parsed = IngestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const id = await precedentEngine.ingestPrecedent({
      ...parsed.data,
      fdaQuestions: parsed.data.fdaQuestions || [],
      riskFactors: parsed.data.riskFactors || [],
      sourceType: parsed.data.sourceType || 'Manual',
      confidenceScore: parsed.data.confidenceScore ?? 1.0,
    } as any);

    res.status(201).json({ success: true, data: { id } });
  } catch (err: any) {
    return serverError(res, log, 'ingesting the precedent', err);
  }
});

/** CRL trigger pattern analysis */
router.post('/crl-triggers', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await precedentEngine.analyzeCRLTriggers(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'analysing CRL triggers', err);
  }
});

/** RTF trigger pattern analysis */
router.post('/rtf-triggers', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await precedentEngine.analyzeRTFTriggers(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'analysing RTF triggers', err);
  }
});

/** EMA Day 120/180 question patterns */
router.post('/ema-patterns', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await precedentEngine.analyzeEMAPatterns(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'analysing EMA question patterns', err);
  }
});

/** Advisory Committee risk analysis */
router.post('/advisory-committee', async (req: Request, res: Response) => {
  try {
    const parsed = RiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await precedentEngine.analyzeAdvisoryCommitteeRisk(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    return serverError(res, log, 'analysing advisory-committee risk', err);
  }
});

export default router;
