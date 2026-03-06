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
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('precedent-routes');

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

    const results = await precedentEngine.search(parsed.data);
    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (err: any) {
    log.error(`Search failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
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
    log.error(`Compare failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
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
    log.error(`Risk analysis failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
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
    log.error(`Strategy recommendation failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
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
    log.error(`Claim check failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
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
    log.error(`Ingest failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
