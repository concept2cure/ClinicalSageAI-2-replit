/**
 * Market-access payer/HTA position service — the REAL write + read path over
 * `market_access_positions` (migration 20260801_market_access_store.sql).
 *
 * This is what makes the v2 MarketAccess surface real rather than demo-ware: a live
 * tenant tracks payer/HTA positions (createMarketAccessPosition, via POST
 * /api/market-access), they persist here org-scoped and soft-delete aware, and GET
 * /api/market-access reads them back as the flat position rows the surface renders —
 * no seed-only c2c_market_access blob, no fixture.
 *
 * Raw-SQL + tenant-scoped, mirroring cmc/cmc-change-control-service.ts. The route
 * layer writes the Part 11 audit entry.
 *
 * @module server/services/market-access/market-access-service
 */
import { pool } from '../../db';

// Runtime validation set for the position status — the surface's coverage KPIs
// ("Covered", "In HTA review") and pill tones key off exactly this vocab, so an
// unknown status is rejected rather than silently rendered as an idle pill.
export const MARKET_ACCESS_STATUSES = ['covered', 'partial', 'review', 'planned', 'denied'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MarketAccessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketAccessValidationError';
  }
}

/** The stored payer/HTA position row (decision_date read back as 'YYYY-MM-DD' text). */
export interface MarketAccessPositionRow {
  id: string;
  organization_id: number;
  program: string;
  market: string;
  payer: string;
  mechanism: string | null;
  code: string | null;
  status: string;
  decision_date: string | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMarketAccessPositionInput {
  program: string;
  market: string;
  payer: string;
  mechanism?: string | null;
  code?: string | null;
  status?: string | null;
  decisionDate?: string | null;
  note?: string | null;
  createdBy?: number | null;
}

const SELECT_COLS = `id, organization_id, program, market, payer, mechanism, code, status,
  decision_date::text AS decision_date, note, created_by, created_at, updated_at`;

/** Track a payer/HTA position. Validates the required identity fields + status vocab. */
export async function createMarketAccessPosition(
  orgId: number,
  input: CreateMarketAccessPositionInput,
): Promise<MarketAccessPositionRow> {
  if (!input.program || input.program.trim() === '') {
    throw new MarketAccessValidationError('program is required.');
  }
  if (!input.market || input.market.trim() === '') {
    throw new MarketAccessValidationError('market is required.');
  }
  if (!input.payer || input.payer.trim() === '') {
    throw new MarketAccessValidationError('payer is required.');
  }
  let status = 'planned';
  if (input.status != null && input.status !== '') {
    if (!(MARKET_ACCESS_STATUSES as readonly string[]).includes(input.status)) {
      throw new MarketAccessValidationError(`status must be one of: ${MARKET_ACCESS_STATUSES.join(', ')}.`);
    }
    status = input.status;
  }
  if (input.decisionDate != null && input.decisionDate !== '' && !ISO_DATE.test(input.decisionDate)) {
    throw new MarketAccessValidationError('decisionDate must be an ISO date (YYYY-MM-DD).');
  }

  const { rows } = await pool.query<MarketAccessPositionRow>(
    `INSERT INTO market_access_positions (
       organization_id, program, market, payer, mechanism, code, status, decision_date, note, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${SELECT_COLS}`,
    [
      orgId, input.program, input.market, input.payer,
      input.mechanism ?? null, input.code ?? null, status,
      input.decisionDate || null, input.note ?? null, input.createdBy ?? null,
    ],
  );
  return rows[0];
}

/** List the org's payer/HTA positions, newest first (soft-deleted excluded). */
export async function listMarketAccessPositions(orgId: number): Promise<MarketAccessPositionRow[]> {
  const { rows } = await pool.query<MarketAccessPositionRow>(
    `SELECT ${SELECT_COLS} FROM market_access_positions
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id`,
    [orgId],
  );
  return rows;
}

/** Get one payer/HTA position (tenant-scoped). */
export async function getMarketAccessPosition(orgId: number, id: string): Promise<MarketAccessPositionRow | null> {
  const { rows } = await pool.query<MarketAccessPositionRow>(
    `SELECT ${SELECT_COLS} FROM market_access_positions
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

/** Soft-delete a payer/HTA position (keeps the row for the audit trail). */
export async function deleteMarketAccessPosition(orgId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE market_access_positions SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}
