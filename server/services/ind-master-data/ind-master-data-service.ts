/**
 * IND Master-Data service
 *
 * Org-scoped CRUD for the three IND master-data registries (sponsor, US agent,
 * investigator). Every read/write is tenant-scoped from the caller's
 * organizationId (never from request input) and every mutation is audited —
 * mirroring server/services/submission-service/submission-service.ts.
 *
 * NOTE: tables are imported directly from the domain file (not the schema
 * barrel) because the barrel re-export (`export * from './ind-master-data'`) is
 * added by a human as part of the INTEGRATION NOTES in the schema file.
 *
 * ── WO-16C #133 (19 September 2026): the audit outcome is reported ───────────
 *
 * All six mutations below wrote their 21 CFR Part 11 §11.10(e) row with
 * `await auditService.logAction({…})` at statement position — awaited, and the
 * value it resolved to dropped. `logAction` does not reject when persistence
 * fails: that is deliberate policy, an audit-trail outage must not break the
 * user action it records, so it RESOLVES an `AuditWriteResult` and reports what
 * happened in `persisted`. Awaiting that and discarding it reports exactly as
 * much as not awaiting it, so the row each function returned — and the JSON
 * body `server/routes/ind-master-data.routes.ts` builds by handing that return
 * straight to `res.json` — was identical whether the §11.10(e) record for the
 * sponsor, US agent or Form 1572 investigator existed or did not. The only
 * trace of a lost row was a line in the server log.
 *
 * Each mutation now writes through `recordAuditRow` and returns the row with
 * `auditTrail` added, the key the nearest converted sibling already uses
 * (`CreatedCrossReference.auditTrail` in
 * server/services/ind-lifecycle/ind-cross-reference-persistence.ts). Exactly
 * one audit row is attempted per call here, so `auditTrail` can only ever mean
 * that call's own row.
 *
 * In every one of the six, the audit row is a log BESIDE a committed change,
 * not the change itself: the registry row is what persists what happened, and
 * its INSERT/UPDATE has already returned by the time the audit row is
 * attempted (nothing wraps the pair in a transaction). So a failed audit write
 * is never answered here as a failed action and the mutation is never reverted
 * over a lost log row — the mutation stands AND the caller is told. The store's
 * own error text stays in `recordAuditRow`'s log line and never reaches a
 * returned value; `auditTrail.message` is the caller-safe sentence.
 *
 * The read paths (`list*`, `get*`) write no audit row. Sponsor reads and write
 * receipts also carry the exact database revision for conflict-safe editing.
 *
 * @module server/services/ind-master-data/ind-master-data-service
 */

import { eq, and, desc, getTableColumns, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  sponsors,
  regulatoryAgents,
  investigators,
  type Sponsor,
  type RegulatoryAgent,
  type Investigator,
  type InsertRegulatoryAgent,
  type InsertInvestigator,
} from '../../../shared/schema/ind-master-data';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import { normalizeSponsorBusiness, sponsorBusinessFacts, sponsorReason, type SponsorBusinessPatch } from './sponsor-input';

const logger = createScopedLogger('ind-master-data-service');

// ── Standardized errors ─────────────────────────────────────────────────────

export type IndMasterDataErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'SPONSOR_REVISION_CHANGED';

export class IndMasterDataError extends Error {
  constructor(public code: IndMasterDataErrorCode, message: string) {
    super(message);
    this.name = 'IndMasterDataError';
  }
}

interface Ctx {
  organizationId: number;
  userId: number;
}

// Fields a caller may set; the service always overrides organizationId/createdBy
// from ctx so request input can never spoof tenant or actor.
type SponsorWrite = SponsorBusinessPatch & { name: string };
type RegulatoryAgentWrite = Omit<InsertRegulatoryAgent, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>;
type InvestigatorWrite = Omit<InsertInvestigator, 'id' | 'organizationId' | 'createdBy' | 'createdAt' | 'updatedAt'>;

// ── Audited return shapes (WO-16C #133) ─────────────────────────────────────
//
// A registry row handed back together with what happened to the §11.10(e) audit
// row this call wrote for it. The row is returned intact with one key added, so
// every existing field access on these returns is unaffected and the outcome
// travels with it — including out through the router, which passes the object
// straight to `res.json`. Which action's row it is, is stated on each function.

export type SponsorWithRevision = Sponsor & { revision: string };
export type AuditedSponsor = SponsorWithRevision & { auditTrail: AuditRowOutcome };
export type AuditedRegulatoryAgent = RegulatoryAgent & { auditTrail: AuditRowOutcome };
export type AuditedInvestigator = Investigator & { auditTrail: AuditRowOutcome };

// ── Sponsors ────────────────────────────────────────────────────────────────

/** Exact UTC database timestamp; JS Date would discard PostgreSQL microseconds. */
export const sponsorRevisionExpression = sql<string>`to_char(${sponsors.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const sponsorProjection = { ...getTableColumns(sponsors), revision: sponsorRevisionExpression };

export interface SponsorGovernanceOptions {
  reason: string;
  /** Required by HTTP PATCH; optional only for compatibility with service callers. */
  expectedRevision?: string;
}

export async function createSponsor(input: SponsorWrite, ctx: Ctx, governance?: SponsorGovernanceOptions): Promise<AuditedSponsor> {
  const facts = normalizeSponsorBusiness(input, 'create') as SponsorWrite;
  const reason = governance ? sponsorReason(governance.reason) : undefined;
  const [row] = await db
    .insert(sponsors)
    .values({ ...facts, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning(sponsorProjection);
  // WO-16C #133: `auditTrail` is the 'IND_SPONSOR_CREATED' row. The INSERT above
  // has already returned and is the record of the new sponsor, so a lost audit
  // row does not undo it; the sponsor stands and the caller is told.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SPONSOR_CREATED',
    resourceType: 'ind_sponsor',
    resourceId: row.id,
    reason,
    details: { name: row.name, before: null, after: sponsorBusinessFacts(row as Sponsor) },
  });
  logger.info('Created IND sponsor', {
    sponsorId: row.id,
    organizationId: ctx.organizationId,
    auditRowPersisted: auditTrail.persisted,
  });
  return { ...(row as SponsorWithRevision), auditTrail };
}

export async function listSponsors(ctx: { organizationId: number }): Promise<SponsorWithRevision[]> {
  const rows = await db
    .select(sponsorProjection)
    .from(sponsors)
    .where(eq(sponsors.organizationId, ctx.organizationId))
    .orderBy(desc(sponsors.updatedAt));
  return rows as SponsorWithRevision[];
}

export async function getSponsor(id: string, ctx: { organizationId: number }): Promise<SponsorWithRevision> {
  const [row] = await db
    .select(sponsorProjection)
    .from(sponsors)
    .where(and(eq(sponsors.id, id), eq(sponsors.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Sponsor not found for this organization.');
  return row as SponsorWithRevision;
}

export async function updateSponsor(
  id: string,
  patch: Partial<SponsorWrite>,
  ctx: Ctx,
  governance?: SponsorGovernanceOptions,
): Promise<AuditedSponsor> {
  const facts = normalizeSponsorBusiness(patch, 'patch');
  const reason = governance ? sponsorReason(governance.reason) : undefined;
  const before = await getSponsor(id, ctx); // tenant ownership check
  if (governance?.expectedRevision !== undefined && governance.expectedRevision !== before.revision) {
    throw new IndMasterDataError('SPONSOR_REVISION_CHANGED', 'This sponsor record changed after it was read. Read the current record before saving again. Nothing was written.');
  }
  const [row] = await db
    .update(sponsors)
    // Advancing in PostgreSQL preserves all six timestamp digits and cannot
    // leave two successful writes with the same revision, even within one tick.
    .set({ ...facts, updatedAt: sql`GREATEST(clock_timestamp(), ${sponsors.updatedAt} + interval '1 microsecond')` })
    .where(and(eq(sponsors.id, id), eq(sponsors.organizationId, ctx.organizationId),
      governance?.expectedRevision === undefined ? undefined : eq(sponsorRevisionExpression, governance.expectedRevision)))
    .returning(sponsorProjection);
  if (!row) throw new IndMasterDataError('SPONSOR_REVISION_CHANGED', 'This sponsor record changed during the save. Read the current record before saving again. Nothing was written.');
  // WO-16C #133: `auditTrail` is the 'IND_SPONSOR_UPDATED' row. The UPDATE above
  // is committed and the patch is never rolled back over a lost audit row — but
  // that row is the only place the change itself is recorded, so the caller is
  // told when it is missing instead of reading a clean 200 off it.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SPONSOR_UPDATED',
    resourceType: 'ind_sponsor',
    resourceId: id,
    reason,
    details: { fields: Object.keys(facts), before: sponsorBusinessFacts(before), after: sponsorBusinessFacts(row as Sponsor) },
  });
  return { ...(row as SponsorWithRevision), auditTrail };
}

// ── Regulatory agents (US agent — 21 CFR 312.3) ──────────────────────────────

export async function createRegulatoryAgent(
  input: RegulatoryAgentWrite,
  ctx: Ctx,
): Promise<AuditedRegulatoryAgent> {
  const [row] = await db
    .insert(regulatoryAgents)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  // WO-16C #133: `auditTrail` is the 'IND_REGULATORY_AGENT_CREATED' row. The
  // INSERT above is the record of the agent — including the `isUsAgent` flag that
  // marks it as a 21 CFR 312.3 US agent — so a lost audit row does not undo it;
  // the agent stands and the caller is told.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_REGULATORY_AGENT_CREATED',
    resourceType: 'ind_regulatory_agent',
    resourceId: row.id,
    details: { name: row.name, isUsAgent: row.isUsAgent },
  });
  logger.info('Created IND regulatory agent', {
    agentId: row.id,
    organizationId: ctx.organizationId,
    auditRowPersisted: auditTrail.persisted,
  });
  return { ...(row as RegulatoryAgent), auditTrail };
}

export async function listRegulatoryAgents(ctx: { organizationId: number }): Promise<RegulatoryAgent[]> {
  const rows = await db
    .select()
    .from(regulatoryAgents)
    .where(eq(regulatoryAgents.organizationId, ctx.organizationId))
    .orderBy(desc(regulatoryAgents.updatedAt));
  return rows as RegulatoryAgent[];
}

export async function getRegulatoryAgent(id: string, ctx: { organizationId: number }): Promise<RegulatoryAgent> {
  const [row] = await db
    .select()
    .from(regulatoryAgents)
    .where(and(eq(regulatoryAgents.id, id), eq(regulatoryAgents.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Regulatory agent not found for this organization.');
  return row as RegulatoryAgent;
}

export async function updateRegulatoryAgent(
  id: string,
  patch: Partial<RegulatoryAgentWrite>,
  ctx: Ctx,
): Promise<AuditedRegulatoryAgent> {
  await getRegulatoryAgent(id, ctx);
  const [row] = await db
    .update(regulatoryAgents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(regulatoryAgents.id, id), eq(regulatoryAgents.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Regulatory agent not found for this organization.');
  // WO-16C #133: `auditTrail` is the 'IND_REGULATORY_AGENT_UPDATED' row. The
  // UPDATE above is committed and is never rolled back over a lost audit row;
  // that row is the only record of who changed the US agent's details and when,
  // so its absence is reported rather than left to the log.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_REGULATORY_AGENT_UPDATED',
    resourceType: 'ind_regulatory_agent',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  });
  return { ...(row as RegulatoryAgent), auditTrail };
}

// ── Investigators (Form 1572) ────────────────────────────────────────────────

export async function createInvestigator(input: InvestigatorWrite, ctx: Ctx): Promise<AuditedInvestigator> {
  const [row] = await db
    .insert(investigators)
    .values({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId })
    .returning();
  // WO-16C #133: `auditTrail` is the 'IND_INVESTIGATOR_CREATED' row. The INSERT
  // above is the record of the investigator this org will name on a Form 1572, so
  // a lost audit row does not undo it; the record stands and the caller is told.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_INVESTIGATOR_CREATED',
    resourceType: 'ind_investigator',
    resourceId: row.id,
    details: { lastName: row.lastName, siteName: row.siteName },
  });
  logger.info('Created IND investigator', {
    investigatorId: row.id,
    organizationId: ctx.organizationId,
    auditRowPersisted: auditTrail.persisted,
  });
  return { ...(row as Investigator), auditTrail };
}

export async function listInvestigators(ctx: { organizationId: number }): Promise<Investigator[]> {
  const rows = await db
    .select()
    .from(investigators)
    .where(eq(investigators.organizationId, ctx.organizationId))
    .orderBy(desc(investigators.updatedAt));
  return rows as Investigator[];
}

export async function getInvestigator(id: string, ctx: { organizationId: number }): Promise<Investigator> {
  const [row] = await db
    .select()
    .from(investigators)
    .where(and(eq(investigators.id, id), eq(investigators.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Investigator not found for this organization.');
  return row as Investigator;
}

export async function updateInvestigator(
  id: string,
  patch: Partial<InvestigatorWrite>,
  ctx: Ctx,
): Promise<AuditedInvestigator> {
  await getInvestigator(id, ctx);
  const [row] = await db
    .update(investigators)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(investigators.id, id), eq(investigators.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new IndMasterDataError('NOT_FOUND', 'Investigator not found for this organization.');
  // WO-16C #133: `auditTrail` is the 'IND_INVESTIGATOR_UPDATED' row. The UPDATE
  // above is committed and is never rolled back over a lost audit row; that row
  // is the only record that this Form 1572 investigator's details were changed at
  // all, so the caller is told when it is missing.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_INVESTIGATOR_UPDATED',
    resourceType: 'ind_investigator',
    resourceId: id,
    details: { fields: Object.keys(patch) },
  });
  return { ...(row as Investigator), auditTrail };
}

export default {
  createSponsor,
  listSponsors,
  getSponsor,
  updateSponsor,
  createRegulatoryAgent,
  listRegulatoryAgents,
  getRegulatoryAgent,
  updateRegulatoryAgent,
  createInvestigator,
  listInvestigators,
  getInvestigator,
  updateInvestigator,
  IndMasterDataError,
};
