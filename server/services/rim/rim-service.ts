/**
 * RIM-lite service (Capability C2C-12)
 *
 * Tenant-scoped transaction functions over rim_products / rim_registrations /
 * rim_labels. Mutations run inside the caller's transaction with the governed-
 * action ledger. Approving a new label version supersedes the prior approved
 * label of the same product/country/type (single current label per slot).
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/rim/rim-service
 */

import { pool } from '../../db';
import type { ProductStatus, MarketStatus, LabelType } from '../../../shared/schema/rim';
import { expectedLabelType } from './rim-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class RimError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'RimError';
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface ProductInput {
  productName: string;
  inn?: string | null;
  dosageForm?: string | null;
  atcCode?: string | null;
  status?: ProductStatus;
}

export async function createProductTx(client: Queryable, orgId: number, userId: number, input: ProductInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO rim_products (organization_id, product_name, inn, dosage_form, atc_code, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, input.productName, input.inn ?? null, input.dosageForm ?? null, input.atcCode ?? null, input.status ?? 'development', userId],
  );
  return { id: Number(rows[0].id) };
}

async function assertProduct(client: Queryable, orgId: number, productId: number): Promise<void> {
  const p = await client.query(`SELECT id FROM rim_products WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [productId, orgId]);
  if (p.rows.length === 0) throw new RimError('NOT_FOUND', 'Product not found for this organization.');
}

// ─── Registrations ───────────────────────────────────────────────────────────

export interface RegistrationInput {
  country: string;
  marketStatus?: MarketStatus;
  registrationNumber?: string | null;
  marketingAuthHolder?: string | null;
  approvalDate?: string | null;
  renewalDueDate?: string | null;
}

/** Upsert a product × country registration (one row per product/country). */
export async function upsertRegistrationTx(client: Queryable, orgId: number, userId: number, productId: number, input: RegistrationInput): Promise<{ id: number }> {
  await assertProduct(client, orgId, productId);
  const country = input.country.trim().toUpperCase();
  const existing = await client.query(
    `SELECT id FROM rim_registrations WHERE product_id = $1 AND organization_id = $2 AND country = $3 AND deleted_at IS NULL LIMIT 1`,
    [productId, orgId, country],
  );
  if (existing.rows.length > 0) {
    const id = Number(existing.rows[0].id);
    await client.query(
      `UPDATE rim_registrations SET market_status = COALESCE($3, market_status), registration_number = COALESCE($4, registration_number),
          marketing_auth_holder = COALESCE($5, marketing_auth_holder), approval_date = COALESCE($6, approval_date),
          renewal_due_date = COALESCE($7, renewal_due_date), updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId, input.marketStatus ?? null, input.registrationNumber ?? null, input.marketingAuthHolder ?? null, input.approvalDate ?? null, input.renewalDueDate ?? null],
    );
    return { id };
  }
  const { rows } = await client.query(
    `INSERT INTO rim_registrations (organization_id, product_id, country, market_status, registration_number, marketing_auth_holder, approval_date, renewal_due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, productId, country, input.marketStatus ?? 'planned', input.registrationNumber ?? null, input.marketingAuthHolder ?? null, input.approvalDate ?? null, input.renewalDueDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export interface LabelInput {
  country?: string | null;
  labelType: LabelType;
  version?: string;
  status?: 'draft' | 'in_review' | 'approved';
  approvedDate?: string | null;
}

/** Add a label version. Approving it supersedes the prior approved label of the same slot. */
export async function addLabelTx(client: Queryable, orgId: number, userId: number, productId: number, input: LabelInput): Promise<{ id: number; supersededCount: number }> {
  await assertProduct(client, orgId, productId);
  const country = input.country ? input.country.trim().toUpperCase() : null;
  const status = input.status ?? 'draft';
  let supersededCount = 0;
  if (status === 'approved') {
    const r = await client.query(
      `UPDATE rim_labels SET status = 'superseded', updated_at = now()
        WHERE product_id = $1 AND organization_id = $2 AND label_type = $3 AND status = 'approved' AND deleted_at IS NULL
          AND (country IS NOT DISTINCT FROM $4)`,
      [productId, orgId, input.labelType, country],
    );
    supersededCount = (r as any).rowCount ?? 0;
  }
  const { rows } = await client.query(
    `INSERT INTO rim_labels (organization_id, product_id, country, label_type, version, status, approved_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, productId, country, input.labelType, input.version ?? '1.0', status, status === 'approved' ? (input.approvedDate ?? new Date().toISOString().slice(0, 10)) : null, userId],
  );
  return { id: Number(rows[0].id), supersededCount };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listProducts(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, product_name, inn, dosage_form, atc_code, status FROM rim_products WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY product_name`,
    [orgId],
  );
  return rows;
}

export async function listRegistrations(orgId: number, productId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, product_id, country, market_status, registration_number, marketing_auth_holder, approval_date, renewal_due_date
               FROM rim_registrations WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (productId != null) { params.push(productId); sql += ` AND product_id = $2`; }
  sql += ` ORDER BY product_id, country`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getLabelCurrencyInput(orgId: number, productId: number): Promise<{
  registrations: Array<{ country: string; marketStatus: MarketStatus }>;
  approvedLabels: Array<{ country: string | null; labelType: LabelType }>;
}> {
  const reg = await pool.query(`SELECT country, market_status FROM rim_registrations WHERE product_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [productId, orgId]);
  const lab = await pool.query(`SELECT country, label_type FROM rim_labels WHERE product_id = $1 AND organization_id = $2 AND status = 'approved' AND deleted_at IS NULL`, [productId, orgId]);
  return {
    registrations: reg.rows.map((r) => ({ country: r.country, marketStatus: r.market_status })),
    approvedLabels: lab.rows.map((l) => ({ country: l.country, labelType: l.label_type })),
  };
}

/** One market's real label + registration picture — the registration row's dossier. */
export interface RimMarketDossierEntry {
  country: string;
  marketStatus: string;
  registrationNumber: string | null;
  approvalDate: string | null;
  renewalDueDate: string | null;
  /** The label type this market requires, and the rule that says so. */
  expectedLabelType: string;
  expectedLabelBasis: string;
  /** The org's approved labels for this market (or the global core data sheet). */
  approvedLabels: Array<{ labelType: string; version: string | null; approvedDate: string | null; country: string | null }>;
  /** True when the required label type is not among them. */
  labelGap: boolean;
}

/**
 * Assemble the per-market dossier behind a product's registration rows.
 *
 * The Registrations surface has an expandable dossier row whose data source was
 * a deliberately empty object — `const REG_DOSSIERS: Record<string, RegDossier>
 * = {}` — with a comment saying no fabricated dossiers would be shown until a
 * real source existed. This is that source, and every field in it is a stored
 * row or a rule applied to one: the registration record itself, the org's
 * approved `rim_labels` for that market, and the label type the market requires
 * per expectedLabelType (which carries its own citation).
 *
 * Nothing is invented for a market with no labels: it comes back with an empty
 * list and `labelGap` true, which is the fact.
 */
export async function getMarketDossier(orgId: number, productId: number): Promise<RimMarketDossierEntry[]> {
  const reg = await pool.query(
    `SELECT country, market_status, registration_number, approval_date, renewal_due_date
       FROM rim_registrations
      WHERE product_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY country`,
    [productId, orgId],
  );
  const lab = await pool.query(
    `SELECT country, label_type, version, approved_date
       FROM rim_labels
      WHERE product_id = $1 AND organization_id = $2 AND status = 'approved' AND deleted_at IS NULL`,
    [productId, orgId],
  );

  const day = (v: unknown): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
    return m ? m[1] : String(v);
  };

  return reg.rows.map((r) => {
    const country = String(r.country ?? '');
    const { labelType, citation } = expectedLabelType(country);
    // A market's labels are the ones recorded against it, plus the global core
    // data sheet (country null), which is what satisfies a core_data_sheet
    // requirement anywhere — the same rule evaluateLabelCurrency applies.
    const mine = lab.rows.filter((l) => {
      const c = l.country == null ? null : String(l.country).toUpperCase();
      return c === country.toUpperCase() || c === null;
    });
    const covered = mine.some(
      (l) => String(l.label_type) === labelType || (labelType === 'core_data_sheet' && String(l.label_type) === 'core_data_sheet'),
    );
    return {
      country,
      marketStatus: String(r.market_status ?? ''),
      registrationNumber: r.registration_number ? String(r.registration_number) : null,
      approvalDate: day(r.approval_date),
      renewalDueDate: day(r.renewal_due_date),
      expectedLabelType: labelType,
      expectedLabelBasis: citation,
      approvedLabels: mine.map((l) => ({
        labelType: String(l.label_type),
        version: l.version == null ? null : String(l.version),
        approvedDate: day(l.approved_date),
        country: l.country == null ? null : String(l.country),
      })),
      labelGap: !covered,
    };
  });
}
