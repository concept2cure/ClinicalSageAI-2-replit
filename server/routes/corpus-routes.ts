/**
 * Trial-corpus API routes.
 *
 * Exposes the corpus intelligence vertical so surfaces (and operators) can reach
 * it: read-only precedent benchmarking, deterministic CSR text extraction, and a
 * guarded ingestion trigger.
 *
 * Conventions follow server/routes/biostatPlatform.ts: a prefix-free default
 * router (mounted at `/api/corpus` by the bootstrap), zod input validation (400
 * on bad input), optional org context, and no internal leakage on error (500
 * with a short message; details go to the scoped logger).
 */

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { precedentBenchmarkReader } from '../services/corpus/precedent-benchmark-reader';
import { extractCsrEntities, validateCsrStructure } from '../services/csr-intelligence-library';
import { ingestCtgovToCorpus } from '../services/corpus';

const router = express.Router();
const log = createScopedLogger('corpus-routes');

async function resolveOrgId(req: Request): Promise<number | null> {
  const anyReq = req as Request & { user?: { organizationId?: number } };
  return anyReq.user?.organizationId ?? null;
}

const indicationPhaseSchema = z.object({
  indication: z.string().min(1),
  phase: z.string().min(1),
});

const extractSchema = z.object({
  text: z.string().min(1),
});

const ingestSchema = z.object({
  indication: z.string().min(1).optional(),
  intervention: z.string().min(1).optional(),
  sponsor: z.string().min(1).optional(),
  phase: z.string().min(1).optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

// ── Precedent benchmarking (read-only) ──────────────────────────────────────
// GET /api/corpus/benchmark?indication=...&phase=...
router.get('/benchmark', async (req: Request, res: Response) => {
  const parsed = indicationPhaseSchema.safeParse({
    indication: req.query.indication,
    phase: req.query.phase,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  try {
    const result = await precedentBenchmarkReader.benchmark(
      parsed.data.indication,
      parsed.data.phase
    );
    return res.json(result);
  } catch (err) {
    log.error('benchmark failed', err);
    return res.status(500).json({ error: 'Failed to compute benchmark' });
  }
});

// ── CSR text extraction (deterministic, stateless) ──────────────────────────
// POST /api/corpus/extract { text }
router.post('/extract', async (req: Request, res: Response) => {
  const parsed = extractSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  try {
    const extraction = extractCsrEntities(parsed.data.text);
    const validation = validateCsrStructure(parsed.data.text);
    return res.json({ extraction, validation });
  } catch (err) {
    log.error('extract failed', err);
    return res.status(500).json({ error: 'Failed to extract from text' });
  }
});

// ── Ingestion trigger (guarded write) ───────────────────────────────────────
// POST /api/corpus/ingest { indication?, intervention?, sponsor?, phase?, limit? }
// Requires at least one query field so it cannot trigger an unbounded pull.
router.post('/ingest', async (req: Request, res: Response) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const { indication, intervention, sponsor, phase } = parsed.data;
  if (!indication && !intervention && !sponsor && !phase) {
    return res
      .status(400)
      .json({ error: 'Provide at least one of: indication, intervention, sponsor, phase' });
  }
  try {
    const orgId = await resolveOrgId(req);
    const summary = await ingestCtgovToCorpus(parsed.data, orgId ?? undefined);
    return res.json(summary);
  } catch (err) {
    log.error('ingest failed', err);
    return res.status(500).json({ error: 'Failed to ingest from ClinicalTrials.gov' });
  }
});

// Mounted at /api/corpus by server/bootstrap/register-document-routes.ts
// (alongside the other domain routers), so the router itself is prefix-free.
export default router;
