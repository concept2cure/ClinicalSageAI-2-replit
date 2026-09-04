/**
 * eSTAR registration service — org-scoped persistence for a client's eSTAR
 * registration state, and the bridge into the pure eligibility model.
 *
 * The pure model (./estar-registration) computes per-submission eligibility from
 * an `EstarClientRegistration` passed as input. This service is the persisted
 * source of truth: it stores one registration row per organization and bridges
 * that row into the model's shape, so `/registration/assess` and
 * `/filing-readiness` can answer "what is THIS client registered for?" from
 * storage instead of a hand-built request payload.
 *
 * Every read/write is tenant-scoped from the caller's organizationId (never from
 * request input) and every mutation is audited — mirroring
 * server/services/ind-master-data/ind-master-data-service.ts.
 *
 * @module server/services/pathway-engines/estar/estar-registration-service
 */

import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import {
  estarRegistrations,
  type EstarRegistrationRow,
} from '../../../../shared/schema/estar-registration';
import type {
  EstarClientRegistration,
  EstarRegistrationRequirement,
} from './estar-registration';
import auditService from '../../auditService';
import { createScopedLogger } from '../../../utils/logger';

const logger = createScopedLogger('estar-registration-service');

interface Ctx {
  organizationId: number;
  userId: number;
}

/**
 * Fields a caller may set. The service always overrides organizationId/createdBy
 * from ctx so request input can never spoof tenant or actor.
 */
export interface EstarRegistrationWrite {
  fdaEsgAccount?: boolean;
  cdrhPortalAccount?: boolean;
  organizationIdentity?: boolean;
  mdufaFeeAccount?: boolean;
  esgAccountId?: string | null;
  cdrhPortalEmail?: string | null;
  duns?: string | null;
  fei?: string | null;
  mdufaOrgId?: string | null;
  mdufaFeeTier?: string | null;
  variants?: Array<'device' | 'ivd'>;
  notes?: string | null;
  // The official eSTAR's Correspondent Information and Declaration of
  // Conformity facts — org-level, so they live on this row (WO-8 Phase 3).
  correspondentCompanyName?: string | null;
  correspondentContactEmail?: string | null;
  correspondentTelephone?: string | null;
  /** Pairs with declarationCompanyAddress: the DoC names ONE legal entity. */
  declarationCompanyName?: string | null;
  declarationCompanyAddress?: string | null;
}

/** The persisted registration for an org, or null when the client has none yet. */
export async function getEstarRegistration(
  ctx: { organizationId: number },
): Promise<EstarRegistrationRow | null> {
  const [row] = await db
    .select()
    .from(estarRegistrations)
    .where(eq(estarRegistrations.organizationId, ctx.organizationId))
    .limit(1);
  return (row as EstarRegistrationRow) ?? null;
}

/**
 * Create or update the org's single eSTAR registration record (upsert on the
 * unique organization_id). Audited.
 */
export async function upsertEstarRegistration(
  input: EstarRegistrationWrite,
  ctx: Ctx,
): Promise<EstarRegistrationRow> {
  const existing = await getEstarRegistration(ctx);
  if (existing) {
    const [row] = await db
      .update(estarRegistrations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(estarRegistrations.organizationId, ctx.organizationId))
      .returning();
    await auditService.logAction({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ESTAR_REGISTRATION_UPDATED',
      resourceType: 'estar_registration',
      resourceId: row.id,
      details: { fields: Object.keys(input) },
    });
    logger.info('Updated eSTAR registration', { organizationId: ctx.organizationId });
    return row as EstarRegistrationRow;
  }

  const [row] = await db
    .insert(estarRegistrations)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ESTAR_REGISTRATION_CREATED',
    resourceType: 'estar_registration',
    resourceId: row.id,
    details: {},
  });
  logger.info('Created eSTAR registration', { organizationId: ctx.organizationId });
  return row as EstarRegistrationRow;
}

/**
 * Bridge a persisted row → the pure eligibility model's input shape. The opaque
 * `clientId` is the org id as a string (the platform scopes by integer org; the
 * model treats clientId as opaque), and `satisfied` is derived mechanically from
 * the four boolean columns.
 */
export function toClientRegistration(row: EstarRegistrationRow): EstarClientRegistration {
  const satisfied: EstarRegistrationRequirement[] = [];
  if (row.fdaEsgAccount) satisfied.push('fda_esg_account');
  if (row.cdrhPortalAccount) satisfied.push('cdrh_portal_account');
  if (row.organizationIdentity) satisfied.push('organization_identity');
  if (row.mdufaFeeAccount) satisfied.push('mdufa_fee_account');
  const variants = Array.isArray(row.variants) && row.variants.length > 0 ? row.variants : undefined;
  return { clientId: String(row.organizationId), satisfied, variants };
}

/**
 * Load the org's persisted registration and bridge it to the model shape. When
 * the client has never registered, returns an empty registration (nothing
 * satisfied) keyed on the org — so eligibility fails closed rather than throwing.
 */
export async function resolveClientRegistration(
  ctx: { organizationId: number },
): Promise<EstarClientRegistration> {
  const row = await getEstarRegistration(ctx);
  if (!row) return { clientId: String(ctx.organizationId), satisfied: [] };
  return toClientRegistration(row);
}

export default {
  getEstarRegistration,
  upsertEstarRegistration,
  toClientRegistration,
  resolveClientRegistration,
};
