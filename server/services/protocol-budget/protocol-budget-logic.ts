/**
 * Protocol Budget & Feasibility deterministic logic (Capability C2C-22)
 *
 * Pure, DB-free, LLM-free: roll per-subject cost line items into a per-category and
 * per-subject direct cost, apply indirect (F&A) on the direct base, scale to the
 * target enrollment, compare against sponsor revenue, and return a feasibility
 * verdict. Indirect/F&A grounded in 2 CFR 200.414; per-subject negotiation is the
 * standard industry-sponsored study budgeting approach.
 *
 * @module server/services/protocol-budget/protocol-budget-logic
 */

export const FA_BASIS = '2 CFR 200.414 — indirect (F&A) cost rate on the direct cost base';

export type BudgetCategory = 'personnel' | 'procedure' | 'lab' | 'imaging' | 'overhead' | 'equipment' | 'patient_stipend' | 'other';
export type BudgetPayer = 'sponsor' | 'institution' | 'other';
export type Feasibility = 'funded' | 'under_funded' | 'unknown';

export interface BudgetItemView {
  category: BudgetCategory | string;
  unitCost: number;
  quantityPerSubject: number;
  payer?: BudgetPayer | string;
}

export interface BudgetParams {
  targetEnrollment: number;
  sponsorPaymentPerSubject?: number | null;
  indirectRatePct?: number | null;
}

export interface CategoryCost { category: string; perSubject: number }

export interface ProtocolBudgetSummary {
  categories: CategoryCost[];
  /** Direct per-subject cost (sum of unit_cost × qty). */
  directPerSubject: number;
  /** Indirect (F&A) per subject = direct × rate%. */
  indirectPerSubject: number;
  /** Total per subject = direct + indirect. */
  totalPerSubject: number;
  targetEnrollment: number;
  /** Total study cost = totalPerSubject × enrollment. */
  totalStudyCost: number;
  /** Sponsor revenue = sponsorPaymentPerSubject × enrollment (null when unset). */
  sponsorRevenue: number | null;
  /** Sponsor revenue − total study cost (null when revenue unknown). */
  margin: number | null;
  feasibility: Feasibility;
  basis: string;
}

function round2(n: number): number { return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100; }

/**
 * Compute the protocol budget + feasibility. Direct per-subject cost sums each
 * item's unit_cost × quantity_per_subject; F&A applies on that base at the given
 * rate; totals scale by target enrollment; feasibility compares sponsor revenue to
 * the total study cost (`unknown` when enrollment or sponsor payment is not set).
 * Pure.
 */
export function computeProtocolBudget(items: BudgetItemView[], params: BudgetParams): ProtocolBudgetSummary {
  const catMap = new Map<string, number>();
  let directPerSubject = 0;
  for (const it of items) {
    const cost = round2((Number(it.unitCost) || 0) * (Number(it.quantityPerSubject) || 0));
    catMap.set(it.category, round2((catMap.get(it.category) ?? 0) + cost));
    directPerSubject += cost;
  }
  directPerSubject = round2(directPerSubject);

  const ratePct = params.indirectRatePct != null && params.indirectRatePct > 0 ? Number(params.indirectRatePct) : 0;
  const indirectPerSubject = round2(directPerSubject * (ratePct / 100));
  const totalPerSubject = round2(directPerSubject + indirectPerSubject);

  const enrollment = Number.isFinite(params.targetEnrollment) && params.targetEnrollment > 0 ? Math.trunc(params.targetEnrollment) : 0;
  const totalStudyCost = round2(totalPerSubject * enrollment);

  const payPer = params.sponsorPaymentPerSubject;
  const sponsorRevenue = payPer != null && payPer >= 0 ? round2(Number(payPer) * enrollment) : null;
  const margin = sponsorRevenue == null ? null : round2(sponsorRevenue - totalStudyCost);

  let feasibility: Feasibility;
  if (enrollment === 0 || sponsorRevenue == null) feasibility = 'unknown';
  else feasibility = margin != null && margin >= 0 ? 'funded' : 'under_funded';

  const categories: CategoryCost[] = [...catMap.entries()].map(([category, perSubject]) => ({ category, perSubject })).sort((a, b) => b.perSubject - a.perSubject);

  return {
    categories,
    directPerSubject,
    indirectPerSubject,
    totalPerSubject,
    targetEnrollment: enrollment,
    totalStudyCost,
    sponsorRevenue,
    margin,
    feasibility,
    basis: FA_BASIS,
  };
}
