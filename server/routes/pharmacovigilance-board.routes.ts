/**
 * Pharmacovigilance Surveillance Board — display/aggregation read route.
 *
 * Backs the ui-v2 "Safety surveillance" surface (BiopharmaSpecialty →
 * Pharmacovigilance): two cards, "Active signals" and "Aggregate reports in
 * cycle". Neither card has a persisted display record, so this endpoint DERIVES
 * the display shape from real, org-scoped data:
 *
 *   • Signals — the SafetySignal table does NOT store disproportionality PRR or
 *     case counts, so we aggregate adverse_events by (suspect_product ×
 *     reaction_pt) into 2×2 contingency tables and run the existing
 *     disproportionality screen (runSignalScreen → computeDisproportionality:
 *     PRR / ROR / chi-squared / EBGM / EB05). product = suspect product,
 *     term = MedDRA PT, count = the 2×2 "a" cell (co-reports), prr = derived
 *     PRR, status = the screen's conventional signal flag (evaluating |
 *     monitoring).
 *
 *   • Aggregate reports — mapped from periodic_safety_reports via the existing
 *     getUpcomingReports() read (<=90-day, non-submitted "in cycle" reports).
 *
 * This module ONLY orchestrates existing service functions (getAdverseEvents,
 * getUpcomingReports) and the existing pure screen (runSignalScreen); it writes
 * no SQL of its own and inherits their fail-closed behaviour (empty lists when a
 * table is unprovisioned → the surface keeps its honest fixture). Display fields
 * with no real source are returned as documented nulls, never fabricated (see
 * HONESTY NOTES at the bottom).
 *
 * Style template: server/routes/pharmacovigilance-routes.ts (Router factory /
 * default export, org id from tenant/user context, scoped logger, honest error
 * shaping, { success, data } envelope).
 *
 * @module routes/pharmacovigilance-board.routes
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger.js';
import {
  getAdverseEvents,
  getUpcomingReports,
  type AdverseEvent,
  type PeriodicSafetyReport,
} from '../services/compliance/pharmacovigilanceService';
import { runSignalScreen, type SignalScreenInput } from '../services/compliance/pv-signal-screen';

const logger = createScopedLogger('pharmacovigilance-board-routes');

/**
 * Minimum co-report count (the 2×2 "a" cell) for a drug–event pair to appear on
 * the board. Grounded in the Evans PRR rule (n >= 3): below this the ratio is
 * not interpretable as a signal candidate and would be single-case noise.
 */
const MIN_CASES = 3;

/** Hard cap on rendered signal rows (this is a surveillance card, not a table). */
const MAX_ROWS = 25;

// ── Display-shape row types (mirror the surface's render contract) ──────────────

/** Matches PvSignal in BiopharmaSpecialty.tsx: { product, term, count, prr, owner, age, status }. */
interface PvSignalRow {
  product: string;
  term: string;
  count: number;
  prr: number;
  /** GAP: no signal owner/assignee exists in adverse_events or safety_signals. */
  owner: string | null;
  /** Days since the most recent contributing case (MAX report_date): data recency, not governance age. */
  age: string | null;
  status: string;
}

/** Matches PvAgg in BiopharmaSpecialty.tsx: { product, cycle, due, by, reviewers, status }. */
interface PvAggregateReportRow {
  /** GAP: periodic reports are project-scoped; the model carries no product label. */
  product: string | null;
  cycle: string;
  due: string;
  /** GAP: no author field on PeriodicSafetyReport. */
  by: string | null;
  /** GAP: no reviewer roster on PeriodicSafetyReport. */
  reviewers: string | null;
  status: string;
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

function formatAge(now: Date, last: Date): string {
  const days = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * PRR rounded to 1 dp. A non-finite value (an event reported only under this one
 * product → division by a zero background rate) is passed through unchanged
 * rather than replaced with a fabricated finite number.
 */
function roundPrr(prr: number): number {
  return Number.isFinite(prr) ? Math.round(prr * 10) / 10 : prr;
}

function mapReportStatus(status: PeriodicSafetyReport['status']): string {
  switch (status) {
    case 'draft':
      return 'drafting';
    case 'in_review':
      return 'review';
    case 'submitted':
      return 'submitted';
    default:
      return String(status);
  }
}

function formatDue(submittedTo: string[], dueDate: Date): string {
  const authorities = Array.isArray(submittedTo) && submittedTo.length > 0 ? submittedTo.join(', ') : '';
  const date = fmtDate(dueDate);
  return authorities ? `${authorities} · ${date}` : date;
}

/**
 * Derive the "Active signals" rows: aggregate adverse events by
 * (suspect_product × reaction_pt) into 2×2 tables and run the disproportionality
 * screen. The disproportionality base is the set of cases carrying BOTH a
 * suspect product and a MedDRA PT (the only cases for which the 2×2 is defined);
 * cases missing either field are excluded from the denominator.
 */
function deriveSignals(events: AdverseEvent[]): PvSignalRow[] {
  const perProduct = new Map<string, number>(); // a + b : usable cases for the product
  const perTerm = new Map<string, number>(); //    a + c : usable cases for the term
  const perPair = new Map<string, { product: string; event: string; a: number; last: Date }>();
  let total = 0; // N : all usable cases (both fields present)

  for (const event of events) {
    const product = event.suspectProduct;
    const term = event.reactionPt;
    if (!product || !term) continue;
    total += 1;
    perProduct.set(product, (perProduct.get(product) ?? 0) + 1);
    perTerm.set(term, (perTerm.get(term) ?? 0) + 1);
    const key = `${product} ${term}`;
    const reportDate = event.reportDate instanceof Date ? event.reportDate : new Date(event.reportDate);
    const current = perPair.get(key);
    if (current) {
      current.a += 1;
      if (reportDate.getTime() > current.last.getTime()) current.last = reportDate;
    } else {
      perPair.set(key, { product, event: term, a: 1, last: reportDate });
    }
  }

  if (total === 0) return [];

  const inputs: SignalScreenInput[] = [];
  const meta = new Map<string, { a: number; last: Date }>();

  for (const pair of Array.from(perPair.values())) {
    if (pair.a < MIN_CASES) continue;
    const a = pair.a;
    const b = (perProduct.get(pair.product) ?? 0) - a;
    const c = (perTerm.get(pair.event) ?? 0) - a;
    const d = total - a - b - c;
    inputs.push({ drug: pair.product, event: pair.event, counts: { a, b, c, d } });
    meta.set(`${pair.product} ${pair.event}`, { a, last: pair.last });
  }

  const screen = runSignalScreen(inputs);
  const now = new Date();

  return screen.rows.slice(0, MAX_ROWS).map((row): PvSignalRow => {
    const m = meta.get(`${row.drug} ${row.event}`);
    return {
      product: row.drug,
      term: row.event,
      count: m ? m.a : 0,
      prr: roundPrr(row.result.prr),
      owner: null,
      age: m ? formatAge(now, m.last) : null,
      status: row.result.signalDetected ? 'evaluating' : 'monitoring',
    };
  });
}

// ── Router factory ──────────────────────────────────────────────────────────────

export default function createPharmacovigilanceBoardRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): string {
    const orgId =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      (req as any).user?.organizationId;
    if (!orgId) {
      throw new Error('PV_NO_TENANT: Organization context required');
    }
    return String(orgId);
  }

  /**
   * GET /api/pharmacovigilance/board
   * Live surveillance board for the ui-v2 Pharmacovigilance surface.
   * Response: { success: true, data: { signals: PvSignalRow[], aggregateReports: PvAggregateReportRow[] } }
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);

      const [eventsSettled, reportsSettled] = await Promise.allSettled([
        getAdverseEvents(orgId),
        getUpcomingReports(orgId),
      ]);

      // A REJECTED read is a real DB failure — getAdverseEvents / getUpcomingReports
      // already map the legitimately-unprovisioned 42P01 case to [], so a rejection
      // is never "no data yet." Surfacing it (→ the outer catch's 500) is not
      // optional on THIS surface: the client's useLiveData then sets `error` and
      // the pharmacovigilance publisher reports the board as UNREADABLE. Coercing a
      // rejection to [] here published "no disproportionality signal" to the
      // assistant — a manufactured safety clearance from a read that failed. A
      // safety-surveillance board fails closed, and half a board (one read down) is
      // still unreadable, not a partial all-clear.
      if (eventsSettled.status === 'rejected') throw eventsSettled.reason;
      if (reportsSettled.status === 'rejected') throw reportsSettled.reason;
      const events = eventsSettled.value;
      const reports = reportsSettled.value;

      const signals = deriveSignals(events);

      const aggregateReports = reports.map((report): PvAggregateReportRow => ({
        product: null,
        cycle: `${report.reportType} ${fmtDate(report.periodStart)}–${fmtDate(report.periodEnd)}`.trim(),
        due: formatDue(report.submittedTo, report.dueDate),
        by: null,
        reviewers: null,
        status: mapReportStatus(report.status),
      }));

      return res.json({
        success: true,
        data: { signals, aggregateReports },
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('PV_NO_TENANT')) {
        return res.status(400).json({ success: false, error: 'Organization context required' });
      }
      logger.error('pv board error', { err: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ success: false, error: 'Failed to build pharmacovigilance surveillance board' });
    }
  });

  return router;
}
