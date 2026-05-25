/**
 * @fileoverview Citation Verification API
 *
 * POST /api/citations/verify — verify that cited references actually exist
 * against PubMed and CrossRef. Backs CER / regulatory-writing citation checks
 * with real lookups instead of heuristic assertions.
 *
 * Mounted (auth-gated) by server/bootstrap/register-clinical-intel-routes.ts.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyCitations } from '../services/citation-verification-service';
import { createScopedLogger } from '../utils/logger.js';

const router = Router();
const log = createScopedLogger('citations-routes');

const citationSchema = z
  .object({
    id: z.string().max(200).optional(),
    raw: z.string().max(2000).optional(),
    title: z.string().max(1000).optional(),
    authors: z.string().max(1000).optional(),
    journal: z.string().max(500).optional(),
    year: z.number().int().min(1800).max(2200).optional(),
    doi: z.string().max(300).optional(),
    pmid: z.string().max(20).optional(),
  })
  .refine(c => c.raw || c.title || c.doi || c.pmid, {
    message: 'Each citation needs at least one of: raw, title, doi, pmid',
  });

const verifyBodySchema = z.object({
  citations: z.array(citationSchema).min(1).max(50),
});

router.post('/verify', async (req: Request, res: Response) => {
  const parsed = verifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  try {
    const results = await verifyCitations(parsed.data.citations);
    const summary = {
      total: results.length,
      verified: results.filter(r => r.status === 'verified').length,
      notFound: results.filter(r => r.status === 'not_found').length,
      unverifiable: results.filter(r => r.status === 'unverifiable').length,
      error: results.filter(r => r.status === 'error').length,
    };
    res.json({ data: { results, summary } });
  } catch (err) {
    log.error('Citation verification request failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Citation verification failed' });
  }
});

export default router;
