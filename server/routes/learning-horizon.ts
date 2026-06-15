/**
 * Regulatory Horizon API — read-only window into AnA's continuous-learning loop.
 *
 *   GET /api/learning/horizon/summary        sources + last-scan totals
 *   GET /api/learning/horizon/sources        the watchlist (what AnA self-studies)
 *   GET /api/learning/horizon/cards?status=  harvested knowledge cards by status
 *   GET /api/learning/horizon/digest         the latest weekly no-touch digest
 *   GET /api/learning/horizon/ich-currency   corpus-maintenance worklist from the loop
 *
 * Read-only by design: promotion decisions are made by the policy engine during
 * the scan, and human sign-off of `pending` cards is a governed action handled
 * elsewhere. This surface lets the product owner (and AnA) see the live state.
 */

import { Router, type Request, type Response } from 'express';

import {
  HORIZON_SOURCES,
  horizonSourcesSummary,
} from '../services/learning/regulatory-horizon-sources.js';
import { getHorizonStore } from '../services/learning/horizon-store.js';
import { assessIchCurrency } from '../services/learning/ich-currency.js';
import { getLastHorizonResult } from '../jobs/regulatoryHorizonScan.js';
import type { CardStatus } from '../services/learning/knowledge-card.js';

const router = Router();

const VALID_STATUSES: CardStatus[] = ['pending', 'promoted', 'quarantined', 'superseded'];

const NOTE =
  'AnA self-studies these sources on a schedule. Auto-promotion is policy-gated; ' +
  'rule-bearing changes (new guidelines, withdrawals) always require human sign-off.';

function qstr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim() : '';
}

router.get('/summary', (_req: Request, res: Response) => {
  const last = getLastHorizonResult();
  res.json({
    sources: horizonSourcesSummary(),
    lastScan: last
      ? { generatedAt: last.digest.generatedAt, totals: last.digest.totals, ichActions: last.ichCurrency.actions.length }
      : null,
    note: NOTE,
  });
});

router.get('/sources', (_req: Request, res: Response) => {
  res.json({ count: HORIZON_SOURCES.length, sources: HORIZON_SOURCES, note: NOTE });
});

router.get('/cards', (req: Request, res: Response) => {
  const status = qstr(req.query.status);
  if (status && !VALID_STATUSES.includes(status as CardStatus)) {
    return res.status(422).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const store = getHorizonStore();
  const cards = status ? store.byStatus(status as CardStatus) : store.all();
  res.json({ count: cards.length, status: status || 'all', cards, note: NOTE });
});

router.get('/digest', (_req: Request, res: Response) => {
  const last = getLastHorizonResult();
  if (!last) return res.json({ available: false, note: 'No scan has run yet in this process.' });
  res.json({ available: true, digest: last.digest, note: NOTE });
});

router.get('/ich-currency', (_req: Request, res: Response) => {
  const store = getHorizonStore();
  const report = assessIchCurrency(store.all());
  res.json({ report, note: 'Worklist of updates to apply to the citable ICH corpus.' });
});

export default router;
