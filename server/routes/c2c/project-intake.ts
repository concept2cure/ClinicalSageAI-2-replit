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
import {
  listProductTypes,
  productTypeForFilingType,
  DEVICE_FAMILY_PRODUCT_TYPES,
  MEDICINAL_PRODUCT_TYPES,
} from '../../../shared/constants/domain/product-types.js';

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
 * caller's transaction, anchored to the program it is for.
 *
 * The spine belongs to ONE program: `submissions.program_id`
 * (migrations/20260925b, LX-22). A submission already anchored to THIS program
 * (and of this application type) is reused, so a replayed intake never forks a
 * second spine. Nothing else is: this used to adopt any submission of the
 * organization whose product_name or title matched, so a second project for
 * the same product silently took the first project's filing, and both then
 * filed into one spine (PF-creation-1). A submission with no recorded project
 * is never adopted either — the name is not a key.
 *
 * When none is anchored, the row is created via the canonical submission-service
 * insert on this client — commit and rollback are atomic with the program — and
 * that insert checks the program belongs to `orgId` on the same client, so it
 * sees the program row inserted earlier in this uncommitted transaction.
 *
 * Fail-closed: any error propagates so the whole transaction rolls back — a
 * drug program without its submission spine is exactly the permanently-empty
 * canonical core this exists to end.
 */
export async function ensureSubmissionSpine(params: {
  client: PoolClient;
  orgId: number;
  userId: number;
  /** The program the spine belongs to (regulatory_programs.id). */
  programId: string;
  /** Program name → submissions.title. */
  name: string;
  /** Program product_name → submissions.product_name (the filed product). */
  productName: string;
  applicationType: string;
  productType: string;
  primaryAgency: string;
}): Promise<{ id: number; created: boolean }> {
  const { client, orgId, userId, programId, name, productName, applicationType } = params;
  const existing = await client.query(
    `SELECT id FROM submissions
      WHERE organization_id = $1 AND program_id = $2 AND lower(application_type) = $3
        AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [orgId, programId, applicationType],
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
      programId,
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

/**
 * The product class a create records, or why it is refused (400). Pure.
 *
 * The filing type decides when it can: a 510(k) is a device submission, a BLA a
 * biologics licence, and the client may not contradict a device filing. When it
 * cannot — an IND, a CTA, an MAA, a J-NDA or a DMF, each of which covers drugs
 * and biologics alike — the class is the person's to state (P-21), and a create
 * that states none is refused. It used to be derived: every IND was recorded as
 * a biologic, an inhaled small molecule included (QA 2026-10-08, second walk,
 * j1/j7). `regulatory_programs.product_type` and the spine's
 * `submissions.client_type` are both NOT NULL, so "not stated" cannot be stored
 * as empty; it is asked for instead.
 */
export function productTypeForIntake(
  programType: string,
  stated: string,
): { productType: string } | { refusal: string } {
  const implied = productTypeForFilingType(programType);
  const productType = stated || implied || '';
  if (!productType) {
    return {
      refusal:
        `State whether the product is a drug or a biologic: a ${programType.toUpperCase()} filing ` +
        'covers both, and the class is recorded on the program.',
    };
  }
  if (!VALID_PRODUCT_TYPES.has(productType)) {
    return { refusal: `productType must be one of: ${[...VALID_PRODUCT_TYPES].join(', ')}` };
  }
  // A device or IVD filing may not be recorded as a medicinal product, whatever
  // the client sent: the MDX UAT found a 510(k) submitted as 'biologic' because
  // the Pharma & Biotech tab was open. The filing type is a regulatory fact.
  if (implied && DEVICE_FAMILY_PRODUCT_TYPES.includes(implied) && !DEVICE_FAMILY_PRODUCT_TYPES.includes(productType as never)) {
    return {
      refusal:
        `A ${programType} filing is a device submission and cannot be recorded as ` +
        `"${productType}". Use one of: ${DEVICE_FAMILY_PRODUCT_TYPES.join(', ')}.`,
    };
  }
  // …and a filing whose class the person states is for a drug or a biologic.
  if (!implied && !MEDICINAL_PRODUCT_TYPES.includes(productType as never)) {
    return {
      refusal: `A ${programType.toUpperCase()} filing is for a drug or a biologic, not "${productType}".`,
    };
  }
  return { productType };
}

/** A word that is itself a program code: "BX-204", "BX204", "HLV-333", "QA-SS-101". */
const CODE_WORD = /^(?:[A-Za-z0-9]{1,4}-){0,2}[A-Za-z]{1,4}-?\d{2,4}$/;

/**
 * The program code, before the route's org-uniqueness suffix.
 *
 * In order: a product name that IS a code ("BX-204", "bx 204"); a word of the
 * product name that is a code ("BX-204 CGM"), then one of the project name
 * ("HLV-333 — IND"); the initials of a several-word name; the first four
 * characters of a one-word name. It used to read the product name only and
 * take the initials of its words, so a one-word product gave a one-letter code
 * ("Helvanta-QA3" → "H", "QA-SS-101" → "Q") and the code written in the
 * project name was never looked at (QA 2026-10-08, j1).
 */
export function baseCodeFrom(productName: string, name: string): string {
  const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  const product = clean(productName);
  const project = clean(name);
  if (/^[A-Za-z]{1,4}[- ]?\d{2,4}$/.test(product)) {
    return product.replace(/\s+/g, '-').toUpperCase();
  }
  for (const src of [product, project]) {
    const word = src.split(' ').find((w) => CODE_WORD.test(w));
    if (word) return word.toUpperCase();
  }
  const words = (product || project).split(' ').map((w) => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  const letters = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '');
  return letters.slice(0, 4).toUpperCase() || 'PRJ';
}
