/**
 * Program-intake domain helpers for POST /api/c2c/projects.
 *
 * The create endpoint's validation tables and canonical-submission-spine
 * plumbing, extracted verbatim from projects.ts (which had outgrown the repo
 * line-count gate). Everything here is pure input-domain knowledge or runs on
 * the caller-supplied transaction client — no route handling, no `req`/`res`,
 * and no tenancy decisions: org scoping stays in the route, which passes the
 * already-resolved orgId/userId in.
 *
 * @module server/routes/c2c/project-intake
 */

import type { PoolClient } from 'pg';
import { createSubmissionTx } from '../../services/submission-service/submission-service.js';
import { listProductTypes } from '../../../shared/constants/domain/product-types.js';

/** Canonical program / product types accepted by the create endpoint. Program
 *  types line up with WS_CASE in projects.ts; product types match the store's
 *  CHECK-free but conventional set (drug/biologic/device/ivd). */
export const VALID_PROGRAM_TYPES = new Set([
  '510k', 'de_novo', 'pma', 'ivd', 'device', 'cer', 'ide',
  // 'cta' was mapped in PROGRAM_TO_DOC_TYPE and backed by a rule pack, but was
  // missing here — so the API rejected the one European filing a biotech running
  // trials needs most. Opened now that cta:ema carries a real CTR 536/2014
  // outline (migrations/20260806); opening it against the previous two-node pack
  // would have shipped the hollow dossier this codebase spent a migration ending.
  'ind', 'cta', 'bla', 'biologic', 'nda', 'maa', 'jnda', 'anda',
  // EU MDR / IVDR technical documentation. Thirteen registry rows offered these
  // and every one created a US NDA, because the API had no value for them to
  // land on. Backed by real packs as of migrations/20260810b.
  'mdr', 'ivdr',
  // Drug / active substance master file. Module 3 content plus a letter of
  // authorization; scaffolds against the harmonised Module 3 pack (mod3:ich)
  // through PROGRAM_TO_DOC_TYPE. Before this the wizard filed a DMF as an IND.
  'dmf',
]);
export const VALID_PRODUCT_TYPES = new Set<string>(listProductTypes());

/**
 * Program types whose intake must also create the canonical `submissions` row —
 * the spine every canonical-core surface reads (IndLifecycle checklist,
 * NdaCockpit, SubmissionCenter sequences, DispatchReadiness). Value = the
 * canonical submissions.application_type. Only concrete drug/biologic
 * APPLICATION types map; 'biologic' is a product class with no named
 * application, and inventing one ('bla'?) would fabricate a filing identity the
 * customer never declared, so it is deliberately absent. Device/IVD program
 * types (510k/pma/mdr/…) run on their own pathway stores, not this spine.
 */
export const DRUG_APPLICATION_TYPES: Record<string, string> = {
  ind: 'ind',
  cta: 'cta',
  nda: 'nda',
  bla: 'bla',
  maa: 'maa',
  jnda: 'jnda',
  anda: 'anda',
};

/** productType (validated: drug|biologic|device|ivd) → canonical clientType. */
const CLIENT_TYPE_BY_PRODUCT: Record<string, string> = {
  drug: 'pharma',
  biologic: 'biotech',
  device: 'mdx',
  ivd: 'ivd',
};

/** Wizard agency values → canonical submissions.primary_region. */
const AGENCY_TO_REGION: Record<string, string> = {
  FDA: 'fda',
  EMA: 'eu',
  PMDA: 'jp',
  MHRA: 'uk',
  HEALTH_CANADA: 'ca',
  TGA: 'au',
  NMPA: 'cn',
  SWISSMEDIC: 'ch',
  ANVISA: 'br',
  CDSCO: 'in',
  MFDS: 'kr',
  HSA: 'sg',
};

/** Region each application type files in when the agency doesn't say. Total
 *  over DRUG_APPLICATION_TYPES, so a region always resolves deterministically. */
const REGION_BY_APPLICATION: Record<string, string> = {
  ind: 'fda',
  nda: 'fda',
  bla: 'fda',
  anda: 'fda',
  cta: 'eu', // CTR 536/2014 — the cta rule pack is cta:ema
  maa: 'eu',
  jnda: 'jp',
};

/**
 * Ensure the canonical submission spine for a drug-program intake, INSIDE the
 * caller's transaction.
 *
 * Idempotent by the SAME identity convention the ind-checklist-view-assembler
 * uses to match program ↔ submission (product_name / title, case-insensitive,
 * per application type): when a matching submission already exists in the org
 * it is linked rather than duplicated, so re-creating a program for the same
 * product never forks a second spine. When none exists, the row is created via
 * the canonical submission-service insert on this client — commit and rollback
 * are atomic with the program.
 *
 * Fail-closed: any error propagates so the whole transaction rolls back — a
 * drug program without its submission spine is exactly the permanently-empty
 * canonical core this exists to end.
 */
export async function ensureSubmissionSpine(params: {
  client: PoolClient;
  orgId: number;
  userId: number;
  /** Program name → submissions.title (assembler identity key). */
  name: string;
  /** Program product_name → submissions.product_name (assembler identity key). */
  productName: string;
  applicationType: string;
  productType: string;
  primaryAgency: string;
}): Promise<{ id: number; created: boolean }> {
  const { client, orgId, userId, name, productName, applicationType } = params;
  const identityKeys = [...new Set([productName, name].map((v) => v.trim().toLowerCase()).filter(Boolean))];
  const existing = await client.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND lower(application_type) = $2
        AND (lower(coalesce(product_name, '')) = ANY($3) OR lower(title) = ANY($3))
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [orgId, applicationType, identityKeys],
  );
  if (existing.rows.length > 0) {
    return { id: Number((existing.rows[0] as { id: number | string }).id), created: false };
  }
  const region =
    AGENCY_TO_REGION[params.primaryAgency.toUpperCase().replace(/\s+/g, '_')] ??
    REGION_BY_APPLICATION[applicationType];
  const row = await createSubmissionTx(
    client,
    {
      title: name,
      productName,
      applicationType,
      clientType: CLIENT_TYPE_BY_PRODUCT[params.productType],
      primaryRegion: region,
    },
    { organizationId: orgId, userId },
  );
  return { id: Number(row.id), created: true };
}

/** A tester-friendly, org-unique program code derived from the product/name. */
export function baseCodeFrom(productName: string, name: string): string {
  const src = (productName || name || 'PRJ').trim();
  // Keep an existing "BX-204"-style code intact; else initials of the words.
  const cleaned = src.replace(/[^A-Za-z0-9\- ]/g, '').trim();
  if (/^[A-Za-z]{1,4}[- ]?\d{2,4}$/.test(cleaned)) {
    return cleaned.replace(/\s+/g, '-').toUpperCase();
  }
  const initials = cleaned.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 4).toUpperCase();
  return initials || 'PRJ';
}
