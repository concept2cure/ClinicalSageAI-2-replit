/**
 * Controlled Substances deterministic logic (Capability C2C-15)
 *
 * Pure, DB-free, LLM-free: the DEA schedule catalog, perpetual-inventory balance
 * reconciliation, registration expiry, and the recordkeeping gate. Grounded in
 * the Controlled Substances Act and 21 CFR 1300-series; each finding cites it.
 *
 * @module server/services/controlled-substances/cs-logic
 */

import type { DeaSchedule, CsTransactionType } from '../../../shared/schema/controlled-substances';

/** DEA schedules with recordkeeping notes and citations. */
export const DEA_SCHEDULES: Array<{
  schedule: DeaSchedule;
  description: string;
  citation: string;
  /** Schedule I/II require the stricter ordering + perpetual records. */
  requiresPerpetualInventory: boolean;
  requiresForm222: boolean;
}> = [
  { schedule: 'I', description: 'No accepted medical use; high abuse potential (research only).', citation: '21 CFR 1308.11', requiresPerpetualInventory: true, requiresForm222: true },
  { schedule: 'II', description: 'High abuse potential; accepted medical use with severe restrictions.', citation: '21 CFR 1308.12', requiresPerpetualInventory: true, requiresForm222: true },
  { schedule: 'III', description: 'Moderate-to-low physical dependence potential.', citation: '21 CFR 1308.13', requiresPerpetualInventory: false, requiresForm222: false },
  { schedule: 'IV', description: 'Low abuse potential.', citation: '21 CFR 1308.14', requiresPerpetualInventory: false, requiresForm222: false },
  { schedule: 'V', description: 'Lowest abuse potential.', citation: '21 CFR 1308.15', requiresPerpetualInventory: false, requiresForm222: false },
];

const SCHED = new Map(DEA_SCHEDULES.map((s) => [s.schedule, s]));

/** Transactions that ADD to inventory (others subtract). */
const ADDITIVE: CsTransactionType[] = ['receipt', 'adjustment'];

export interface BalanceResult {
  newBalance: number;
  ok: boolean;
  error?: string;
}

/**
 * Reconcile a transaction against the current balance. Receipts and positive
 * adjustments add; dispense/use/disposal/transfer subtract. A subtraction may
 * not drive the balance negative (you cannot dispense more than you hold) — a
 * core perpetual-inventory invariant (21 CFR 1304.21). Pure.
 *
 * `adjustment` may be signed (negative quantity reduces). All others use the
 * absolute quantity.
 */
export function reconcileBalance(currentBalance: number, type: CsTransactionType, quantity: number): BalanceResult {
  if (!Number.isFinite(quantity)) return { newBalance: currentBalance, ok: false, error: 'Quantity must be a finite number.' };
  let delta: number;
  if (type === 'adjustment') {
    delta = quantity; // signed
  } else if (ADDITIVE.includes(type)) {
    delta = Math.abs(quantity);
  } else {
    delta = -Math.abs(quantity);
  }
  const newBalance = Number((currentBalance + delta).toFixed(4));
  if (newBalance < 0) {
    return { newBalance: currentBalance, ok: false, error: `Transaction would drive the balance negative (have ${currentBalance}, change ${delta}).` };
  }
  return { newBalance, ok: true };
}

export type RegistrationExpiryStatus = 'active' | 'expiring_soon' | 'expired' | 'unknown';

/** DEA registrations are renewed periodically (commonly every 3 years). Pure. */
export function registrationExpiryStatus(expirationDate: string | null, today: string): RegistrationExpiryStatus {
  if (!expirationDate) return 'unknown';
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(expirationDate);
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!e || !t) return 'unknown';
  const exp = Date.UTC(Number(e[1]), Number(e[2]) - 1, Number(e[3]));
  const now = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
  if (now > exp) return 'expired';
  const days = Math.floor((exp - now) / 86_400_000);
  return days <= 60 ? 'expiring_soon' : 'active';
}

export type CsFindingSeverity = 'critical' | 'major' | 'minor';
export type CsRiskLevel = 'high' | 'medium' | 'low';

export interface CsFinding {
  severity: CsFindingSeverity;
  message: string;
  basis: string;
}

export interface RecordkeepingInput {
  schedule: DeaSchedule;
  transactionType: CsTransactionType;
  witnessedBy?: string | null;
  hasActiveRegistration: boolean;
}

/**
 * Recordkeeping gate for a transaction. A current DEA registration is required;
 * disposals/destructions of any schedule require a witness (21 CFR 1304); the
 * citation for the schedule's recordkeeping tier is attached. Pure.
 */
export function evaluateRecordkeeping(p: RecordkeepingInput): { findings: CsFinding[]; riskLevel: CsRiskLevel } {
  const findings: CsFinding[] = [];
  if (!p.hasActiveRegistration) {
    findings.push({ severity: 'critical', message: 'No active DEA registration covers this activity.', basis: '21 CFR 1301.11' });
  }
  if (p.transactionType === 'disposal' && (!p.witnessedBy || p.witnessedBy.trim().length === 0)) {
    findings.push({ severity: 'major', message: 'Disposal/destruction requires a documented witness.', basis: '21 CFR 1304.21; DEA disposal regulations' });
  }
  const cat = SCHED.get(p.schedule);
  if (cat?.requiresForm222 && p.transactionType === 'receipt') {
    findings.push({ severity: 'minor', message: `Schedule ${p.schedule} receipts require DEA Form 222 / CSOS ordering records.`, basis: cat.citation });
  }
  const riskLevel: CsRiskLevel = findings.some((f) => f.severity === 'critical') ? 'high' : findings.some((f) => f.severity === 'major') ? 'medium' : 'low';
  return { findings, riskLevel };
}
