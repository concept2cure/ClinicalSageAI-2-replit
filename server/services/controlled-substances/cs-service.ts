/**
 * Controlled Substances service (Capability C2C-15)
 *
 * Tenant-scoped transaction functions over dea_registrations /
 * controlled_substances / cs_transactions. Recording a transaction reconciles
 * the perpetual balance (rejecting any subtraction that would go negative) and
 * writes the running balance_after — all inside the caller's transaction with
 * the governed-action ledger.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/controlled-substances/cs-service
 */

import { pool } from '../../db';
import { reconcileBalance } from './cs-logic';
import type { DeaSchedule, BusinessActivity, CsTransactionType } from '../../../shared/schema/controlled-substances';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class CsError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'CsError';
  }
}

// ─── Registrations ───────────────────────────────────────────────────────────

export interface RegistrationInput {
  registrantName: string;
  deaNumber: string;
  businessActivity: BusinessActivity;
  schedules: string[];
  expirationDate?: string | null;
}

export async function createRegistrationTx(client: Queryable, orgId: number, userId: number, input: RegistrationInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO dea_registrations (organization_id, registrant_name, dea_number, business_activity, schedules, expiration_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id`,
    [orgId, input.registrantName, input.deaNumber, input.businessActivity, input.schedules.map((s) => s.toUpperCase()), input.expirationDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Substances ──────────────────────────────────────────────────────────────

export interface SubstanceInput {
  substanceName: string;
  deaSchedule: DeaSchedule;
  unit?: string;
  deaRegistrationId?: number | null;
}

export async function createSubstanceTx(client: Queryable, orgId: number, userId: number, input: SubstanceInput): Promise<{ id: number }> {
  if (input.deaRegistrationId != null) {
    const r = await client.query(`SELECT id FROM dea_registrations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.deaRegistrationId, orgId]);
    if (r.rows.length === 0) throw new CsError('NOT_FOUND', 'DEA registration not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO controlled_substances (organization_id, dea_registration_id, substance_name, dea_schedule, unit, current_balance, created_by)
     VALUES ($1,$2,$3,$4,$5,0,$6) RETURNING id`,
    [orgId, input.deaRegistrationId ?? null, input.substanceName, input.deaSchedule, input.unit ?? 'g', userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Transactions (perpetual inventory) ──────────────────────────────────────

export interface TransactionInput {
  transactionType: CsTransactionType;
  quantity: number;
  transactionDate?: string | null;
  witnessedBy?: string | null;
  reference?: string | null;
}

/**
 * Record a controlled-substance transaction. Reads the current balance under the
 * row lock, reconciles (rejecting a negative result), writes the ledger row with
 * the running balance, and updates the substance balance — all atomically.
 */
export async function recordTransactionTx(client: Queryable, orgId: number, userId: number, substanceId: number, input: TransactionInput): Promise<{ id: number; balanceAfter: number }> {
  const sub = await client.query(
    `SELECT id, current_balance FROM controlled_substances WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [substanceId, orgId],
  );
  if (sub.rows.length === 0) throw new CsError('NOT_FOUND', 'Substance not found for this organization.');
  const current = Number(sub.rows[0].current_balance);
  const recon = reconcileBalance(current, input.transactionType, input.quantity);
  if (!recon.ok) throw new CsError('INVALID_STATE', recon.error ?? 'Balance reconciliation failed.');

  const { rows } = await client.query(
    `INSERT INTO cs_transactions (organization_id, substance_id, transaction_type, quantity, balance_after, transaction_date, witnessed_by, reference, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, substanceId, input.transactionType, input.quantity, recon.newBalance, input.transactionDate ?? new Date().toISOString().slice(0, 10), input.witnessedBy ?? null, input.reference ?? null, userId],
  );
  await client.query(`UPDATE controlled_substances SET current_balance = $3, updated_at = now() WHERE id = $1 AND organization_id = $2`, [substanceId, orgId, recon.newBalance]);
  return { id: Number(rows[0].id), balanceAfter: recon.newBalance };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listRegistrations(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, registrant_name, dea_number, business_activity, schedules, expiration_date, status FROM dea_registrations WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [orgId],
  );
  return rows;
}

export async function listSubstances(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, dea_registration_id, substance_name, dea_schedule, unit, current_balance FROM controlled_substances WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY substance_name`,
    [orgId],
  );
  return rows;
}

export async function listTransactions(orgId: number, substanceId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, transaction_type, quantity, balance_after, transaction_date, witnessed_by, reference FROM cs_transactions
      WHERE substance_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id DESC`,
    [substanceId, orgId],
  );
  return rows;
}

export async function getRecordkeepingContext(orgId: number, substanceId: number): Promise<{ schedule: DeaSchedule; hasActiveRegistration: boolean }> {
  const { rows } = await pool.query(
    `SELECT s.dea_schedule, r.status AS reg_status
       FROM controlled_substances s LEFT JOIN dea_registrations r ON r.id = s.dea_registration_id AND r.deleted_at IS NULL
      WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL LIMIT 1`,
    [substanceId, orgId],
  );
  if (rows.length === 0) throw new CsError('NOT_FOUND', 'Substance not found for this organization.');
  return { schedule: rows[0].dea_schedule, hasActiveRegistration: rows[0].reg_status === 'active' };
}
