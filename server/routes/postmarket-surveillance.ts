/**
 * Post-market surveillance API — openFDA MAUDE adverse-event signal aggregation
 * and recall summaries. The POST aggregate/summarize endpoints are pure and
 * network-free; the GET endpoints fetch live openFDA data. Role-gated and
 * Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  aggregateSignals,
  summarizeRecalls,
  fetchMaudeEvents,
  fetchDeviceRecalls,
  type MaudeEvent,
  type DeviceRecall,
} from '../services/postmarket/openfda-surveillance';

const logger = createScopedLogger('postmarket-surveillance');
const router = Router();
const author = requireRole('regulatory-author');

function handle<T>(schema: z.ZodType<T>, compute: (input: T) => unknown) {
  return (req: Request, res: Response) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
    }
    try {
      return res.json({ result: compute(parsed.data) });
    } catch (err) {
      return res
        .status(400)
        .json({ error: { code: 'COMPUTATION', message: err instanceof Error ? err.message : 'Computation failed.' } });
    }
  };
}

// Pure: aggregate already-normalized MAUDE events into surveillance signals.
router.post(
  '/maude/aggregate',
  author,
  handle(
    z.object({
      events: z.array(
        z.object({
          reportNumber: z.string(),
          eventType: z.enum(['Death', 'Injury', 'Malfunction', 'Other']),
          dateReceived: z.string().nullable().optional(),
          productProblems: z.array(z.string()).optional(),
          manufacturer: z.string().nullable().optional(),
        })
      ),
      recentWindowDays: z.number().positive().optional(),
      baselineWindowDays: z.number().positive().optional(),
      signalFactor: z.number().positive().optional(),
      minRecentCount: z.number().nonnegative().optional(),
    }),
    input => {
      const events: MaudeEvent[] = input.events.map(e => ({
        reportNumber: e.reportNumber,
        eventType: e.eventType,
        dateReceived: e.dateReceived ? new Date(e.dateReceived) : null,
        productProblems: e.productProblems ?? [],
        manufacturer: e.manufacturer ?? null,
      }));
      return aggregateSignals(events, {
        recentWindowDays: input.recentWindowDays,
        baselineWindowDays: input.baselineWindowDays,
        signalFactor: input.signalFactor,
        minRecentCount: input.minRecentCount,
      });
    }
  )
);

// Pure: summarize already-normalized recalls.
router.post(
  '/recalls/summarize',
  author,
  handle(
    z.object({
      recalls: z.array(
        z.object({
          recallNumber: z.string(),
          classification: z.enum(['Class I', 'Class II', 'Class III', 'Unclassified']),
          reason: z.string().optional(),
          status: z.string().nullable().optional(),
          recallingFirm: z.string().nullable().optional(),
        })
      ),
    }),
    input => {
      const recalls: DeviceRecall[] = input.recalls.map(r => ({
        recallNumber: r.recallNumber,
        classification: r.classification,
        reason: r.reason ?? '',
        status: r.status ?? null,
        recallingFirm: r.recallingFirm ?? null,
      }));
      return summarizeRecalls(recalls);
    }
  )
);

// Live: fetch + aggregate MAUDE events from openFDA for a device search.
router.get('/maude', author, async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  if (!search) return res.status(400).json({ error: { code: 'VALIDATION', message: 'search query param required.' } });
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  try {
    const events = await fetchMaudeEvents(search, { limit });
    return res.json({ result: { events, signals: aggregateSignals(events) } });
  } catch (err) {
    logger.error('openFDA MAUDE fetch failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: { code: 'UPSTREAM', message: 'openFDA request failed.' } });
  }
});

// Live: fetch + summarize device recalls from openFDA for a device search.
router.get('/recalls', author, async (req: Request, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  if (!search) return res.status(400).json({ error: { code: 'VALIDATION', message: 'search query param required.' } });
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  try {
    const recalls = await fetchDeviceRecalls(search, { limit });
    return res.json({ result: { recalls, summary: summarizeRecalls(recalls) } });
  } catch (err) {
    logger.error('openFDA recall fetch failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: { code: 'UPSTREAM', message: 'openFDA request failed.' } });
  }
});

logger.info('Post-market surveillance routes initialised');

export default router;
